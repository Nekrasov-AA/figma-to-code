/**
 * Exploration script: fetch a single node via the lighter
 * `/v1/files/{key}/nodes` endpoint (instead of a full-file fetch), and
 * print its raw JSON plus a quick summary of descendant types.
 *
 * Usage: npm run inspect-node -- <figmaFileId> <nodeId>
 * <nodeId> may be in Figma URL format (e.g. "2229-15062") or API format
 * ("2229:15062") — the dash is converted to a colon automatically.
 */
import dotenv from 'dotenv';
import { FigmaClient } from '../utils/figma-client';
import { FigmaNode } from '../types/figma';

dotenv.config();

/** Recursively tallies a node's descendants by type, e.g. { TEXT: 5, INSTANCE: 3 }. */
function countDescendantsByType(node: FigmaNode): Record<string, number> {
  const counts: Record<string, number> = {};

  const walk = (children: FigmaNode[]) => {
    for (const child of children) {
      counts[child.type] = (counts[child.type] ?? 0) + 1;
      if (child.children?.length) {
        walk(child.children);
      }
    }
  };
  walk(node.children ?? []);

  return counts;
}

async function main(): Promise<void> {
  const token = process.env.FIGMA_API_TOKEN;
  if (!token) {
    throw new Error(
      'FIGMA_API_TOKEN is not set. Add it to your .env file ' +
        '(see .env.example) and try again.'
    );
  }

  const fileId = process.argv[2];
  const rawNodeId = process.argv[3];
  if (!fileId || !rawNodeId) {
    throw new Error('Usage: npm run inspect-node -- <figmaFileId> <nodeId>');
  }
  const nodeId = rawNodeId.replace('-', ':');

  const client = new FigmaClient(token);
  const response = await client.getNodes(fileId, [nodeId]);

  console.log('\nFull response:');
  console.log(JSON.stringify(response, null, 2));

  const entry = response.nodes[nodeId];
  if (!entry) {
    throw new Error(`Node "${nodeId}" was not found in the response.`);
  }

  const counts = countDescendantsByType(entry.document);
  const countsSummary =
    Object.entries(counts)
      .map(([type, count]) => `${type}: ${count}`)
      .join(', ') || '(no children)';

  console.log('\nSummary:');
  console.log(`  name: ${entry.document.name}`);
  console.log(`  type: ${entry.document.type}`);
  console.log(`  children by type: ${countsSummary}`);
}

main().catch((error) => {
  console.error(`\n❌ inspect-node failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
