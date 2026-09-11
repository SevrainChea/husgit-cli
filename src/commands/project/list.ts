import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { loadConfig, getAllProjects } from '../../config/manager.js';

const BASE_COLUMNS = ['Project', 'ID', 'Groups'];

export function projectListCommand(): Command {
  return new Command('list')
    .description('List all projects in the registry')
    .option(
      '--filter <text>',
      'Filter rows where the project name contains <text> (case-insensitive)',
    )
    .option(
      '--sort <column>',
      'Sort rows by column (Project, ID, Groups, or an environment name)',
    )
    .action(runProjectList);
}

async function runProjectList(options: {
  filter?: string;
  sort?: string;
}): Promise<void> {
  const config = loadConfig();
  let projects = getAllProjects(config);

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
  const allColumns = [...BASE_COLUMNS, ...envNames];

  if (options.filter) {
    const needle = options.filter.toLowerCase();
    projects = projects.filter((p) => p.name.toLowerCase().includes(needle));
  }

  if (options.sort) {
    const sortCol = allColumns.find(
      (c) => c.toLowerCase() === options.sort!.toLowerCase(),
    );
    if (!sortCol) {
      console.log(
        chalk.red(
          `Invalid --sort column "${options.sort}". Valid columns: ${allColumns.join(', ')}.`,
        ),
      );
      return;
    }
    projects = [...projects].sort((a, b) => {
      let ka: string;
      let kb: string;
      if (sortCol === 'Project') {
        ka = a.name;
        kb = b.name;
      } else if (sortCol === 'ID') {
        ka = a.externalId;
        kb = b.externalId;
      } else if (sortCol === 'Groups') {
        ka = (projectGroups[a.fullPath] ?? []).join(', ');
        kb = (projectGroups[b.fullPath] ?? []).join(', ');
      } else {
        ka = a.branchMap[sortCol] ?? '';
        kb = b.branchMap[sortCol] ?? '';
      }
      return ka.localeCompare(kb, undefined, { sensitivity: 'base' });
    });
  }

  if (projects.length === 0) {
    console.log(chalk.yellow('No projects match the given filters.'));
    return;
  }

  const table = new Table({
    head: allColumns,
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
