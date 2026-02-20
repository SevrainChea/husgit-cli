import { Command } from 'commander';
import chalk from 'chalk';
import {
  loadConfig,
  saveConfig,
  setEnvironments,
} from '../../config/manager.js';
import { promptInput, promptConfirm } from '../../ui/prompts.js';
import type { Environment } from '../../types.js';

export function setupFlowCommand(): Command {
  return new Command('flow')
    .description('Configure environments (interactive)')
    .action(runSetupFlow);
}

export async function runSetupFlow(): Promise<void> {
  const config = loadConfig();

  if (config.environments.length > 0) {
    console.log(chalk.yellow('\nCurrent environments:'));
    for (const env of config.environments) {
      console.log(`  ${env.order + 1}. ${env.name}`);
    }
    const overwrite = await promptConfirm(
      'Overwrite existing environments?',
      false,
    );
    if (!overwrite) {
      console.log('Setup cancelled.');
      return;
    }
  }

  const countStr = await promptInput('How many environments?', '3');
  const count = parseInt(countStr, 10);
  if (isNaN(count) || count < 2) {
    console.log(chalk.red('Need at least 2 environments.'));
    return;
  }

  const defaults = ['develop', 'staging', 'production'];
  const environments: Environment[] = [];

  for (let i = 0; i < count; i++) {
    const name = await promptInput(`Environment ${i + 1} name:`, defaults[i]);
    const trimmedName = name.trim();
    const defaultBranchInput = await promptInput(
      `Default branch for "${trimmedName}" (optional, press enter to skip):`,
      trimmedName,
    );
    const defaultBranch = defaultBranchInput.trim() || undefined;
    environments.push({ name: trimmedName, order: i, defaultBranch });
  }

  console.log(chalk.cyan('\nFlow chain:'));
  for (const env of environments) {
    const branchNote = env.defaultBranch
      ? chalk.gray(` (default branch: ${env.defaultBranch})`)
      : '';
    console.log(`  ${env.order + 1}. ${env.name}${branchNote}`);
  }
  const chain = environments.map((e) => e.name).join(' → ');
  console.log(`  ${chain}`);

  const ok = await promptConfirm('Save this flow?');
  if (!ok) {
    console.log('Setup cancelled.');
    return;
  }

  setEnvironments(config, environments);
  saveConfig(config);
  console.log(chalk.green('Environments saved.'));
}
