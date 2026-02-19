import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig, saveConfig, addGroup } from '../../config/manager.js';

export function groupAddCommand(): Command {
  return new Command('add')
    .description('Create a new project group')
    .argument('<name>', 'Group name')
    .action(runGroupAdd);
}

async function runGroupAdd(name: string): Promise<void> {
  const config = loadConfig();
  try {
    addGroup(config, name);
    saveConfig(config);
    console.log(chalk.green(`Group "${name}" created.`));
  } catch (error: unknown) {
    console.log(
      chalk.red(error instanceof Error ? error.message : 'Failed to add group'),
    );
  }
}
