import { program } from 'commander';
import dotenv from 'dotenv';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { FigmaClient } from '../utils/figma-client';
import { parseFrameNode, countUnhandledNodes } from '../parsers/frame-parser';
import { generateComponentFile, getUsedComponentNames } from '../generators/react-generator';

dotenv.config();

program
  .name('figma-to-code')
  .description('Convert Figma designs to React/Vue components')
  .version('0.1.0');

interface GenerateCommandOptions {
  fileId: string;
  nodeId: string;
  name?: string;
  output?: string;
  cache: boolean;
}

/** Converts an arbitrary Figma node name into a safe PascalCase component identifier. */
function toComponentName(rawName: string): string {
  const words = rawName
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2') // split existing camelCase/PascalCase words apart
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const pascalCase = words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');

  if (!pascalCase) {
    return 'GeneratedComponent';
  }
  // JS identifiers (and JSX component names) can't start with a digit.
  return /^[0-9]/.test(pascalCase) ? `Component${pascalCase}` : pascalCase;
}

async function runGenerate(options: GenerateCommandOptions): Promise<void> {
  const token = process.env.FIGMA_API_TOKEN;
  if (!token) {
    throw new Error(
      'FIGMA_API_TOKEN is not set. Add it to your .env file (see .env.example) and try again.'
    );
  }

  const apiNodeId = options.nodeId.replace('-', ':');
  const client = new FigmaClient(token);

  console.log(`🚀 Fetching node ${apiNodeId} from file ${options.fileId}...`);
  const response = await client.getNodes(options.fileId, [apiNodeId], { useCache: options.cache });

  const entry = response.nodes[apiNodeId];
  if (!entry) {
    throw new Error(
      `Node "${apiNodeId}" was not found in file "${options.fileId}". Double-check the node id ` +
        '(from the Figma URL, e.g. "1953-27194") and that your token has access to this file.'
    );
  }

  const componentName = toComponentName(options.name ?? entry.document.name);
  const parsed = parseFrameNode(entry.document, entry.components ?? {}, entry.componentSets ?? {});
  const componentFile = generateComponentFile(parsed, componentName);

  const outputPath = options.output
    ? path.resolve(process.cwd(), options.output)
    : path.resolve(process.cwd(), 'output', `${componentName}.tsx`);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, componentFile);

  const usedComponents = getUsedComponentNames(parsed);
  const unhandledCount = countUnhandledNodes(parsed);

  console.log('\n✅ Component generated successfully');
  console.log(`   Name:      ${componentName}`);
  console.log(`   Output:    ${outputPath}`);
  console.log(`   Uses:      ${usedComponents.length > 0 ? usedComponents.join(', ') : '(no shadcn components)'}`);
  console.log(
    `   Unhandled: ${unhandledCount} node${unhandledCount === 1 ? '' : 's'}` +
      (unhandledCount > 0 ? ' (see warnings above)' : '')
  );
}

program
  .command('generate')
  .description('Generate a React component from a Figma node')
  .requiredOption('--file-id <id>', 'Figma file ID')
  .requiredOption(
    '--node-id <id>',
    'Figma node ID, URL format ("1953-27194") or API format ("1953:27194")'
  )
  .option('--name <name>', 'Component name (default: derived from the Figma node\'s own name)')
  .option('--output <path>', 'Output file path (default: ./output/{ComponentName}.tsx)')
  .option('--no-cache', 'Bypass the local Figma API response cache for this run')
  .action(async (options: GenerateCommandOptions) => {
    try {
      await runGenerate(options);
    } catch (error) {
      console.error(`\n❌ ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

program.parseAsync(process.argv);
