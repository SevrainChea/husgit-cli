import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { loadConfig } from '../../config/manager.js';

export function groupListCommand(): Command {
  return new Command('list')
    .description('List all groups and their projects')
    .option('--group <name>', 'Show only a specific group')
    .action(runGroupList);
}

async function runGroupList(options: { group?: string }): Promise<void> {
  const config = loadConfig();
  const groupNames = options.group
    ? [options.group]
    : Object.keys(config.groups);

  if (groupNames.length === 0) {
    console.log(chalk.yellow('No groups configured.'));
    return;
  }

  const envNames = config.environments.map((e) => e.name);

  for (const groupName of groupNames) {
    const group = config.groups[groupName];
    if (!group) {
      console.log(chalk.red(`Group "${groupName}" not found.`));
      continue;
    }

    console.log(chalk.cyan(`\n${groupName}`));

    if (group.projects.length === 0) {
      console.log(chalk.dim('  No projects'));
      continue;
    }

    const table = new Table({
      head: ['Project', 'ID', ...envNames],
      style: { head: ['cyan'] },
    });

    for (const project of group.projects) {
      table.push([
        project.name,
        project.externalId,
        ...envNames.map((env) => project.branchMap[env] || '-'),
      ]);
    }

    console.log(table.toString());
  }
}
