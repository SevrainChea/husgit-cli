import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig, saveConfig, removeGroup } from '../../config/manager.js';
import { promptConfirm } from '../../ui/prompts.js';

export function groupRemoveCommand(): Command {
  return new Command('remove')
    .description('Remove a project group')
    .argument('<name>', 'Group name')
    .option('--force', 'Skip confirmation')
    .action(runGroupRemove);
}

async function runGroupRemove(
  name: string,
  options: { force?: boolean },
): Promise<void> {
  const config = loadConfig();

  if (!config.groups[name]) {
    console.log(chalk.red(`Group "${name}" does not exist.`));
    return;
  }

  if (!options.force) {
    const projectCount = config.groups[name].projects.length;
    const ok = await promptConfirm(
      `Remove group "${name}" (${projectCount} project${projectCount !== 1 ? 's' : ''})? This cannot be undone.`,
      false,
    );
    if (!ok) {
      console.log('Cancelled.');
      return;
    }
  }

  try {
    removeGroup(config, name);
    saveConfig(config);
    console.log(chalk.green(`Group "${name}" removed.`));
  } catch (error: unknown) {
    console.log(
      chalk.red(
        error instanceof Error ? error.message : 'Failed to remove group',
      ),
    );
  }
}
