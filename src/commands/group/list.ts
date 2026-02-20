import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { loadConfig, getAllProjects } from '../../config/manager.js';

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

  const envNames = config.environments.map((e) => e.name);

  if (groupNames.length > 0) {
    for (const groupName of groupNames) {
      const group = config.groups[groupName];
      if (!group) {
        console.log(chalk.red(`Group "${groupName}" not found.`));
        continue;
      }

      console.log(chalk.cyan(`\n${groupName}`));

      if (group.projectPaths.length === 0) {
        console.log(chalk.dim('  No projects'));
        continue;
      }

      const table = new Table({
        head: ['Project', 'ID', ...envNames],
        style: { head: ['cyan'] },
      });

      for (const fullPath of group.projectPaths) {
        const project = config.projects[fullPath];
        if (!project) {
          table.push([
            chalk.dim(fullPath),
            chalk.dim('(not found)'),
            ...envNames.map(() => '-'),
          ]);
          continue;
        }
        table.push([
          project.name,
          project.externalId,
          ...envNames.map((env) => project.branchMap[env] || '-'),
        ]);
      }

      console.log(table.toString());
    }
  }

  // Show ungrouped projects if not filtering by group
  if (!options.group) {
    const allProjects = getAllProjects(config);
    const groupedPaths = new Set(
      Object.values(config.groups).flatMap((g) => g.projectPaths),
    );
    const ungrouped = allProjects.filter((p) => !groupedPaths.has(p.fullPath));

    if (ungrouped.length > 0) {
      console.log(chalk.cyan('\nUngrouped'));
      const table = new Table({
        head: ['Project', 'ID', ...envNames],
        style: { head: ['cyan'] },
      });
      for (const project of ungrouped) {
        table.push([
          project.name,
          project.externalId,
          ...envNames.map((env) => project.branchMap[env] || '-'),
        ]);
      }
      console.log(table.toString());
    }

    if (groupNames.length === 0 && allProjects.length === 0) {
      console.log(chalk.yellow('No projects configured.'));
    }
  }
}
