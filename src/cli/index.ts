import { program } from 'commander';
import dotenv from 'dotenv';

dotenv.config();

program
  .name('figma-to-code')
  .description('Convert Figma designs to React/Vue components')
  .version('0.1.0');

program
  .command('generate')
  .description('Generate components from Figma file')
  .option('--file-id <id>', 'Figma file ID')
  .option('--ui-kit <kit>', 'UI Kit: shadcn | material', 'shadcn')
  .option('--framework <fw>', 'Framework: react | vue', 'react')
  .option('--output <dir>', 'Output directory', './src/components')
  .action((options) => {
    console.log('🚀 Starting code generation...');
    console.log('Options:', options);
    console.log('✅ This is a placeholder. Let\'s build it together!');
  });

program.parse(process.argv);
