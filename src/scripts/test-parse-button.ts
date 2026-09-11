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

const TARGET_NAME = 'Button - Nova';

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

  // getFileComponents only returns top-level COMPONENT/COMPONENT_SET nodes;
  // actual buttons placed on a page are INSTANCE nodes, so we need to
  // search the whole document tree instead.
  const buttonInstances = await client.findNodes(
    fileId,
    (node) => node.type === 'INSTANCE' && node.name === TARGET_NAME
  );
  console.log(`\nFound ${buttonInstances.length} "${TARGET_NAME}" instance(s)`);

  const parsed = buttonInstances
    .map((node) => parseButtonComponent(node))
    .filter((button): button is NonNullable<typeof button> => button !== null);

  console.log(`Parsed ${parsed.length} of them successfully:\n`);
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
