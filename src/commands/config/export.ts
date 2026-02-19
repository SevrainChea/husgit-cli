import { Command } from 'commander';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { loadConfig } from '../../config/manager.js';

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

function copyToClipboard(text: string): void {
  const platform = process.platform;
  if (platform === 'darwin') {
    execSync('pbcopy', { input: text });
  } else if (platform === 'win32') {
    execSync('clip', { input: text });
  } else {
    // Linux: try xclip first, then xsel
    try {
      execSync('xclip -selection clipboard', { input: text });
    } catch {
      execSync('xsel --clipboard --input', { input: text });
    }
  }
}
