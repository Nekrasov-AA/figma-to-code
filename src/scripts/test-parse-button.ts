/**
 * Debugging script: find every "Button - Nova" instance in a real Figma
 * file and print what parseButtonComponent extracted from each one.
 *
 * Usage: npm run test-parse-button -- <figmaFileId>
 */
import dotenv from 'dotenv';
import { FigmaClient } from '../utils/figma-client';
import { parseButtonComponent } from '../parsers/shadcn-parser';

dotenv.config();

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
    throw new Error('Usage: npm run test-parse-button -- <figmaFileId>');
  }

  const client = new FigmaClient(token);

  // The components/componentSets lookup tables (needed to reliably identify
  // which instances are Button - Nova, rather than trusting node.name —
  // see resolveComponentSetName in shadcn-parser.ts) live on the file
  // response. getFile() is cached, so this doesn't cost an extra API call
  // beyond what findNodes() below already makes internally.
  const file = await client.getFile(fileId);
  const componentSets = file.componentSets ?? {};

  // getFileComponents only returns top-level COMPONENT/COMPONENT_SET nodes;
  // actual buttons placed on a page are INSTANCE nodes, so we need to
  // search the whole document tree instead. We can't filter by name here
  // (designers rename instances) — parseButtonComponent does the real
  // identity check via componentId.
  const instances = await client.findNodes(fileId, (node) => node.type === 'INSTANCE');
  console.log(`\nFound ${instances.length} INSTANCE node(s), checking which are Button - Nova...`);

  const parsed = instances
    .map(({ node }) => parseButtonComponent(node, file.components, componentSets))
    .filter((button): button is NonNullable<typeof button> => button !== null);

  console.log(`Parsed ${parsed.length} Button - Nova instance(s):\n`);
  console.table(
    parsed.map((button) => ({
      size: button.size,
      variant: button.variant,
      state: button.state,
      label: button.label,
      leftIcon: button.hasLeftIcon,
      rightIcon: button.hasRightIcon,
      spinner: button.hasSpinner,
    }))
  );
}

main().catch((error) => {
  console.error(
    `\n❌ test-parse-button failed: ${error instanceof Error ? error.message : error}`
  );
  process.exit(1);
});
