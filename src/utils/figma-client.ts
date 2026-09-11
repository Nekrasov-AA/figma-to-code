import axios, { AxiosError, AxiosInstance } from 'axios';
import { logger } from './logger';
import {
  FigmaComponent,
  FigmaFile,
  FigmaHierarchyNode,
  FigmaNode,
  FigmaNodesResponse,
} from '../types/figma';

const COMPONENT_NODE_TYPES = new Set(['COMPONENT', 'COMPONENT_SET']);

/** File key or a figma.com URL containing one, e.g. `.../file/<key>/...`. */
const FILE_KEY_PATTERN = /^[a-zA-Z0-9]+$/;

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
   * @param fileId - The file key, as found in a Figma file URL
   *   (`figma.com/file/<fileId>/...`).
   * @param options.depth - Limit how many levels of the tree Figma returns
   *   (useful for large files where you only need top-level frames).
   */
  async getFile(fileId: string, options: { depth?: number } = {}): Promise<FigmaFile> {
    this.assertValidFileId(fileId);
    logger.debug(`Fetching file ${fileId}`, options);

    return this.request<FigmaFile>(
      () =>
        this.http.get<FigmaFile>(`/files/${fileId}`, {
          params: options.depth != null ? { depth: options.depth } : undefined,
        }),
      `fetch file "${fileId}"`
    );
  }

  /** Fetch specific nodes from a file by id, e.g. from a Figma selection link. */
  async getNodes(fileId: string, nodeIds: string[]): Promise<FigmaNodesResponse> {
    this.assertValidFileId(fileId);
    if (!nodeIds.length) {
      throw new Error('getNodes requires at least one node id');
    }
    logger.debug(`Fetching ${nodeIds.length} node(s) from ${fileId}`, nodeIds);

    return this.request<FigmaNodesResponse>(
      () =>
        this.http.get<FigmaNodesResponse>(`/files/${fileId}/nodes`, {
          params: { ids: nodeIds.join(',') },
        }),
      `fetch nodes [${nodeIds.join(', ')}] from file "${fileId}"`
    );
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
   * `getFileComponents` does not return.
   */
  async findNodes(fileId: string, predicate: (node: FigmaNode) => boolean): Promise<FigmaNode[]> {
    const file = await this.getFile(fileId);
    const results: FigmaNode[] = [];

    for (const page of file.document.children) {
      this.walkTree(page.children ?? [], (node) => {
        if (predicate(node)) {
          results.push(node);
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
