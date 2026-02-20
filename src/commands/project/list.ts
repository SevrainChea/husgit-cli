import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { loadConfig, getAllProjects } from '../../config/manager.js';

export function projectListCommand(): Command {
  return new Command('list')
    .description('List all projects in the registry')
    .action(runProjectList);
}

async function runProjectList(): Promise<void> {
  const config = loadConfig();
  const projects = getAllProjects(config);

  if (projects.length === 0) {
    console.log(chalk.yellow('No projects configured.'));
    return;
  }

  // Build a map of fullPath -> group names
  const projectGroups: Record<string, string[]> = {};
  for (const [groupName, group] of Object.entries(config.groups)) {
    for (const fullPath of group.projectPaths) {
      if (!projectGroups[fullPath]) projectGroups[fullPath] = [];
      projectGroups[fullPath].push(groupName);
    }
  }

  const envNames = config.environments.map((e) => e.name);

  const table = new Table({
    head: ['Project', 'ID', 'Groups', ...envNames],
    style: { head: ['cyan'] },
  });

  for (const project of projects) {
    const groups = projectGroups[project.fullPath] ?? [];
    table.push([
      project.name,
      project.externalId,
      groups.length > 0 ? groups.join(', ') : chalk.dim('—'),
      ...envNames.map((env) => project.branchMap[env] || '-'),
    ]);
  }

  console.log(table.toString());
}
