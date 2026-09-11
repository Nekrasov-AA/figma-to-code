import axios, { AxiosError, AxiosInstance } from 'axios';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { logger } from './logger';
import {
  FigmaComponent,
  FigmaFile,
  FigmaHierarchyNode,
  FigmaNode,
  FigmaNodeMatch,
  FigmaNodesResponse,
} from '../types/figma';

const COMPONENT_NODE_TYPES = new Set(['COMPONENT', 'COMPONENT_SET']);

/** File key or a figma.com URL containing one, e.g. `.../file/<key>/...`. */
const FILE_KEY_PATTERN = /^[a-zA-Z0-9]+$/;

/** Where `getFile` caches responses, relative to the current working directory. */
const CACHE_DIR = '.figma-cache';
const DEFAULT_CACHE_MAX_AGE_MS = 60 * 60 * 1000;

export interface GetFileOptions {
  /** Limit how many levels of the tree Figma returns. Bypasses the cache (see `getFile`). */
  depth?: number;
  /** Read/write `.figma-cache/{fileId}.json` instead of always hitting the API. Default `true`. */
  useCache?: boolean;
  /** How old a cached file is allowed to be before it's treated as stale. Default 1 hour. */
  maxAgeMs?: number;
}

export interface GetNodesOptions {
  /** Read/write a `.figma-cache/` entry instead of always hitting the API. Default `true`. */
  useCache?: boolean;
  /** How old a cached response is allowed to be before it's treated as stale. Default 1 hour. */
  maxAgeMs?: number;
}

/**
 * Thin wrapper over the Figma REST API, scoped to what figma-to-code needs:
 * fetching a file, fetching specific nodes, and extracting components.
 *
 * @see https://www.figma.com/developers/api
 */
export class FigmaClient {
  private readonly token: string;
  private readonly http: AxiosInstance;

  constructor(token: string) {
    if (!token || !token.trim()) {
      throw new Error(
        'Figma API token is required. Set FIGMA_API_TOKEN in your .env file, ' +
          'or generate one at https://www.figma.com/developers/api#access-tokens'
      );
    }
    this.token = token;
    this.http = axios.create({
      baseURL: 'https://api.figma.com/v1',
      headers: { 'X-Figma-Token': this.token },
      timeout: 30_000,
    });
  }

  /**
   * Fetch a Figma file's full document tree.
   *
   * Responses are cached to `.figma-cache/{fileId}.json` and reused for up
   * to an hour by default, so repeated runs of debug scripts during
   * development don't burn through the Figma API's rate limit. Caching is
   * skipped whenever `depth` is set, since a depth-limited response isn't
   * safe to reuse as a stand-in for the full file.
   *
   * @param fileId - The file key, as found in a Figma file URL
   *   (`figma.com/file/<fileId>/...`).
   * @param options.depth - Limit how many levels of the tree Figma returns
   *   (useful for large files where you only need top-level frames).
   * @param options.useCache - Set to `false` to always hit the API. Default `true`.
   * @param options.maxAgeMs - How old a cached file may be before it's refetched. Default 1 hour.
   */
  async getFile(fileId: string, options: GetFileOptions = {}): Promise<FigmaFile> {
    this.assertValidFileId(fileId);
    const { depth, useCache = true, maxAgeMs = DEFAULT_CACHE_MAX_AGE_MS } = options;
    const cacheable = useCache && depth == null;

    if (cacheable) {
      const cached = this.readCache<FigmaFile>(fileId, maxAgeMs);
      if (cached) {
        return cached;
      }
    }

    logger.info(`🌐 Fetching file ${fileId} from the Figma API`);
    const file = await this.request<FigmaFile>(
      () =>
        this.http.get<FigmaFile>(`/files/${fileId}`, {
          params: depth != null ? { depth } : undefined,
        }),
      `fetch file "${fileId}"`
    );

    if (cacheable) {
      this.writeCache(fileId, file);
    }

    return file;
  }

  /**
   * Fetch specific nodes from a file by id, e.g. from a Figma selection
   * link — much lighter than `getFile` for inspecting one or two nodes.
   * Cached like `getFile`, but under a key that also includes the node
   * ids, since this hits a different endpoint with a different response
   * shape than a plain file fetch.
   */
  async getNodes(
    fileId: string,
    nodeIds: string[],
    options: GetNodesOptions = {}
  ): Promise<FigmaNodesResponse> {
    this.assertValidFileId(fileId);
    if (!nodeIds.length) {
      throw new Error('getNodes requires at least one node id');
    }
    const { useCache = true, maxAgeMs = DEFAULT_CACHE_MAX_AGE_MS } = options;
    const cacheKey = this.nodesCacheKey(fileId, nodeIds);

    if (useCache) {
      const cached = this.readCache<FigmaNodesResponse>(cacheKey, maxAgeMs);
      if (cached) {
        return cached;
      }
    }

    logger.info(`🌐 Fetching ${nodeIds.length} node(s) from the Figma API`);
    const response = await this.request<FigmaNodesResponse>(
      () =>
        this.http.get<FigmaNodesResponse>(`/files/${fileId}/nodes`, {
          params: { ids: nodeIds.join(',') },
        }),
      `fetch nodes [${nodeIds.join(', ')}] from file "${fileId}"`
    );

    if (useCache) {
      this.writeCache(cacheKey, response);
    }

    return response;
  }

  /**
   * Fetch a file and extract every COMPONENT / COMPONENT_SET node in it,
   * enriched with the name/description Figma stores separately in
   * `file.components`.
   */
  async getFileComponents(fileId: string): Promise<FigmaComponent[]> {
    const file = await this.getFile(fileId);
    const components: FigmaComponent[] = [];

    for (const page of file.document.children) {
      this.collectComponents(page.children ?? [], page.name, file.components, components);
    }

    logger.info(`Found ${components.length} component(s) in "${file.name}"`);
    return components;
  }

  /**
   * Walk a node's subtree and return a simplified hierarchy (id/name/type
   * + children only), skipping nodes marked `visible: false`. Useful for
   * generators that just need the shape of the tree, not Figma's full
   * style payload.
   */
  parseComponentHierarchy(node: FigmaNode): FigmaHierarchyNode {
    const children = (node.children ?? [])
      .filter((child) => child.visible !== false)
      .map((child) => this.parseComponentHierarchy(child));

    return {
      id: node.id,
      name: node.name,
      type: node.type,
      ...(children.length ? { children } : {}),
    };
  }

  /**
   * Fetch a file and recursively collect every node matching `predicate`,
   * searching the *entire* document tree rather than just top-level
   * COMPONENT / COMPONENT_SET nodes. Use this to find component INSTANCEs
   * (e.g. a specific button placed somewhere in a page), which
   * `getFileComponents` does not return. Each match is paired with the
   * name of the page it was found on.
   */
  async findNodes(fileId: string, predicate: (node: FigmaNode) => boolean): Promise<FigmaNodeMatch[]> {
    const file = await this.getFile(fileId);
    const results: FigmaNodeMatch[] = [];

    for (const page of file.document.children) {
      this.walkTree(page.children ?? [], (node) => {
        if (predicate(node)) {
          results.push({ node, pageName: page.name });
        }
      });
    }

    logger.debug(`findNodes matched ${results.length} node(s) in "${file.name}"`);
    return results;
  }

  /** Recursively finds COMPONENT / COMPONENT_SET nodes within a page's children. */
  private collectComponents(
    nodes: FigmaNode[],
    pageName: string,
    metadata: FigmaFile['components'],
    results: FigmaComponent[]
  ): void {
    this.walkTree(nodes, (node) => {
      if (COMPONENT_NODE_TYPES.has(node.type)) {
        const meta = metadata[node.id];
        results.push({
          id: node.id,
          name: node.name,
          description: meta?.description ?? '',
          pageName,
          node,
        });
      }
    });
  }

  /** Depth-first walk over a node list, calling `visitor` for every node encountered. */
  private walkTree(nodes: FigmaNode[], visitor: (node: FigmaNode) => void): void {
    for (const node of nodes) {
      visitor(node);
      if (node.children?.length) {
        this.walkTree(node.children, visitor);
      }
    }
  }

  private cachePath(cacheKey: string): string {
    return path.join(CACHE_DIR, `${cacheKey}.json`);
  }

  /** A cache key for a `getNodes` call — namespaced under the file id and sorted node ids. */
  private nodesCacheKey(fileId: string, nodeIds: string[]): string {
    const safeIds = [...nodeIds].sort().map((id) => id.replace(/:/g, '-'));
    return `${fileId}__nodes__${safeIds.join('_')}`;
  }

  /** Returns the cached value under `cacheKey` if present and fresh enough, else `null`. */
  private readCache<T>(cacheKey: string, maxAgeMs: number): T | null {
    const filePath = this.cachePath(cacheKey);
    try {
      const ageMs = Date.now() - fs.statSync(filePath).mtimeMs;
      if (ageMs > maxAgeMs) {
        return null;
      }
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
      logger.info(`📦 Using cached data (age: ${Math.round(ageMs / 60_000)} min)`);
      return data;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.debug(`Ignoring unreadable cache file for ${cacheKey}`, error);
      }
      return null;
    }
  }

  /** Best-effort write; a failure here shouldn't fail the caller, it just means no caching this time. */
  private writeCache(cacheKey: string, data: unknown): void {
    try {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      fs.writeFileSync(this.cachePath(cacheKey), JSON.stringify(data));
    } catch (error) {
      logger.debug(`Failed to write cache for ${cacheKey}`, error);
    }
  }

  private assertValidFileId(fileId: string): void {
    if (!fileId || !FILE_KEY_PATTERN.test(fileId)) {
      throw new Error(
        `Invalid Figma file id: "${fileId}". Pass the file key from the URL ` +
          '(figma.com/file/<fileId>/...), not the full URL.'
      );
    }
  }

  /** Runs a request, translating axios/network failures into user-friendly errors. */
  private async request<T>(fn: () => Promise<{ data: T }>, actionDescription: string): Promise<T> {
    try {
      const response = await fn();
      return response.data;
    } catch (error) {
      throw this.toFriendlyError(error, actionDescription);
    }
  }

  private toFriendlyError(error: unknown, actionDescription: string): Error {
    if (axios.isAxiosError(error)) {
      const status = (error as AxiosError).response?.status;
      logger.debug(`Request failed (${actionDescription})`, {
        status,
        data: (error as AxiosError).response?.data,
      });

      switch (status) {
        case 403:
          return new Error(
            `Failed to ${actionDescription}: invalid or unauthorized Figma API token. ` +
              'Check FIGMA_API_TOKEN in your .env file.'
          );
        case 404:
          return new Error(
            `Failed to ${actionDescription}: not found. Double-check the file id and that ` +
              'your token has access to it.'
          );
        case 429:
          return new Error(
            `Failed to ${actionDescription}: rate limited by the Figma API. Wait a bit and try again.`
          );
        default:
          if (error.code === 'ECONNABORTED') {
            return new Error(`Failed to ${actionDescription}: request timed out.`);
          }
          return new Error(
            `Failed to ${actionDescription}: ${error.message}${status ? ` (HTTP ${status})` : ''}`
          );
      }
    }

    logger.debug(`Unexpected error (${actionDescription})`, error);
    const message = error instanceof Error ? error.message : String(error);
    return new Error(`Failed to ${actionDescription}: ${message}`);
  }
}
