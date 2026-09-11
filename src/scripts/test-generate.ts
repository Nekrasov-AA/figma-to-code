/**
 * Debugging script: run the offline login-card-response.json fixture
 * through parseFrameNode and generateComponentFile, print the resulting
 * .tsx, and save it to src/fixtures/output/LoginCard.tsx.
 *
 * Usage: npm run test-generate
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseFrameNode } from '../parsers/frame-parser';
import { generateComponentFile } from '../generators/react-generator';
import { FigmaNodesResponse } from '../types/figma';

const FIXTURE_PATH = path.join(__dirname, '..', 'fixtures', 'login-card-response.json');
const OUTPUT_PATH = path.join(__dirname, '..', 'fixtures', 'output', 'LoginCard.tsx');

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
  const componentFile = generateComponentFile(parsed, 'LoginCard');

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, componentFile);

  console.log(componentFile);
  console.log(`\nWrote ${OUTPUT_PATH}`);
}

try {
  main();
} catch (error) {
  console.error(`\n❌ test-generate failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
