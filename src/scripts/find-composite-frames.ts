/**
 * Exploration script: find candidate "composite" frames (containing both
 * text and a Button - Nova instance, with a manageable number of
 * descendants) to use as test cases for a future frame-level parser.
 *
 * Usage: npm run find-frames -- <figmaFileId>
 */
import dotenv from 'dotenv';
import { FigmaClient } from '../utils/figma-client';
import { FigmaNode } from '../types/figma';

dotenv.config();

const BUTTON_NAME = 'Button - Nova';
const MIN_DESCENDANTS = 2;
const MAX_DESCENDANTS = 15;
const MAX_RESULTS = 15;

interface FrameStats {
  totalDescendants: number;
  textCount: number;
  buttonCount: number;
}

/** Walks a node's subtree (excluding the node itself) and tallies what a frame-level parser would care about. */
function collectStats(node: FigmaNode): FrameStats {
  const stats: FrameStats = { totalDescendants: 0, textCount: 0, buttonCount: 0 };

  const walk = (children: FigmaNode[]) => {
    for (const child of children) {
      stats.totalDescendants++;
      if (child.type === 'TEXT') {
        stats.textCount++;
      }
      if (child.type === 'INSTANCE' && child.name === BUTTON_NAME) {
        stats.buttonCount++;
      }
      if (child.children?.length) {
        walk(child.children);
      }
    }
  };
  walk(node.children ?? []);

  return stats;
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
  if (!fileId) {
    throw new Error('Usage: npm run find-frames -- <figmaFileId>');
  }

  const client = new FigmaClient(token);
  const frameMatches = await client.findNodes(
    fileId,
    (node) => node.type === 'FRAME' || node.type === 'GROUP'
  );

  const candidates = frameMatches
    .map(({ node, pageName }) => ({ node, pageName, stats: collectStats(node) }))
    .filter(
      ({ stats }) =>
        stats.textCount > 0 &&
        stats.buttonCount > 0 &&
        stats.totalDescendants >= MIN_DESCENDANTS &&
        stats.totalDescendants <= MAX_DESCENDANTS
    );

  console.log(
    `\nFound ${candidates.length} composite frame(s), showing up to ${MAX_RESULTS}:\n`
  );

  candidates.slice(0, MAX_RESULTS).forEach(({ node, pageName, stats }) => {
    console.log(
      `- "${node.name}" [${node.id}] on page "${pageName}" — ` +
        `${stats.textCount} text node(s), ${stats.buttonCount} button instance(s)`
    );
  });
}

main().catch((error) => {
  console.error(
    `\n❌ find-frames failed: ${error instanceof Error ? error.message : error}`
  );
  process.exit(1);
});
