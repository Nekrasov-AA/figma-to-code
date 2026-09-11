/**
 * Debugging script: fetch components from a real Figma file and print
 * what FigmaClient extracted, so we can sanity-check parsing against
 * live API responses.
 *
 * Usage: npm run test-fetch -- <figmaFileId>
 */
import dotenv from 'dotenv';
import { FigmaClient } from '../utils/figma-client';

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
    throw new Error('Usage: npm run test-fetch -- <figmaFileId>');
  }

  const client = new FigmaClient(token);
  const components = await client.getFileComponents(fileId);

  console.log(`\nTotal components found: ${components.length}`);

  console.log('\nFirst 5 components:');
  components.slice(0, 5).forEach((component) => {
    console.log(`  - ${component.name} (${component.node.type}) [${component.id}]`);
  });

  const buttonComponent = components.find((component) =>
    component.name.toLowerCase().includes('button')
  );
  if (buttonComponent) {
    console.log(`\nFull JSON for "${buttonComponent.name}":`);
    console.log(JSON.stringify(buttonComponent, null, 2));
  } else {
    console.log('\nNo component with "Button" in its name was found.');
  }
}

main().catch((error) => {
  console.error(`\n❌ test-fetch failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
