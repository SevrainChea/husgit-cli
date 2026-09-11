import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from '../../config/manager.js';
import { copyToClipboard } from '../../utils/clipboard.js';

export function configExportCommand(): Command {
  return new Command('export')
    .description('Copy config to clipboard so it can be shared')
    .action(runConfigExport);
}

async function runConfigExport(): Promise<void> {
  const config = loadConfig();
  const json = JSON.stringify(config, null, 2);

  console.log(json);

  try {
    copyToClipboard(json);
    console.log(chalk.green('\nConfig copied to clipboard.'));
  } catch {
    console.log(
      chalk.yellow(
        '\nCould not copy to clipboard — paste the output above manually.',
      ),
    );
  }
}
