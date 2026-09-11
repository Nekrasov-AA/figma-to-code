/**
 * Debugging script: run parseFrameNode against the offline
 * login-card-response.json fixture — no Figma API calls, so this works
 * even while rate-limited — and print the resulting ParsedNode tree.
 *
 * Usage: npm run test-parse-frame
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseFrameNode } from '../parsers/frame-parser';
import { FigmaNodesResponse } from '../types/figma';

const FIXTURE_PATH = path.join(__dirname, '..', 'fixtures', 'login-card-response.json');

function main(): void {
  const raw = fs.readFileSync(FIXTURE_PATH, 'utf-8');
  const response = JSON.parse(raw) as FigmaNodesResponse;

  const nodeEntry = Object.values(response.nodes)[0];
  if (!nodeEntry) {
    throw new Error(`No nodes found in fixture: ${FIXTURE_PATH}`);
  }

  const parsed = parseFrameNode(
    nodeEntry.document,
    nodeEntry.components ?? {},
    nodeEntry.componentSets ?? {}
  );

  console.log(JSON.stringify(parsed, null, 2));
}

try {
  main();
} catch (error) {
  console.error(`\n❌ test-parse-frame failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
