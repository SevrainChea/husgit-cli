import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import {
  loadConfig,
  getAllProjects,
  getNextEnvironment,
} from '../config/manager.js';
import { createGitlabClient } from '../gitlab/client.js';
import {
  resolveBranchPairs,
  executeMergeRequests,
} from '../services/flowExecution.js';
import {
  promptSelect,
  promptInput,
  promptProjectMultiSelect,
} from '../ui/prompts.js';
import type { MergeRequestResult, ProjectConfig } from '../types.js';

export function releaseCommand(): Command {
  return new Command('release')
    .description('Create merge requests to promote to the next environment')
    .argument('[source-env]', 'Source environment name')
    .option('--group <name>', 'Target a specific group')
    .option('--all', 'Target all projects')
    .option('--projects <paths>', 'Comma-separated project fullPaths')
    .option('--title <title>', 'MR title')
    .option('--description <desc>', 'MR description')
    .option('--dry-run', 'Show what would be created without creating MRs')
    .action(runRelease);
}

async function runRelease(
  sourceEnvArg: string | undefined,
  options: {
    group?: string;
    all?: boolean;
    projects?: string;
    title?: string;
    description?: string;
    dryRun?: boolean;
  },
): Promise<void> {
  const config = loadConfig();

  // Resolve source environment
  let sourceEnv: string;
  if (sourceEnvArg) {
    sourceEnv = sourceEnvArg;
  } else {
    const releasableEnvs = config.environments.filter(
      (_e, i) => i < config.environments.length - 1,
    );
    if (releasableEnvs.length === 0) {
      console.log(chalk.red('Not enough environments to release.'));
      return;
    }
    sourceEnv = await promptSelect<string>(
      'Source environment:',
      releasableEnvs.map((e) => ({ name: e.name, value: e.name })),
    );
  }

  const targetEnv = getNextEnvironment(config, sourceEnv);
  if (!targetEnv) {
    console.log(
      chalk.red(`No next environment after "${sourceEnv}". Cannot release.`),
    );
    return;
  }

  // Resolve projects
  let selectedProjects: ProjectConfig[];

  if (options.all) {
    selectedProjects = getAllProjects(config);
  } else if (options.projects) {
    const paths = options.projects.split(',').map((p) => p.trim());
    selectedProjects = paths
      .map((fp) => config.projects[fp])
      .filter((p): p is ProjectConfig => p !== undefined);
  } else if (options.group) {
    const group = config.groups[options.group];
    if (!group) {
      console.log(chalk.red(`Group "${options.group}" not found.`));
      return;
    }
    selectedProjects = group.projectPaths
      .map((fp) => config.projects[fp])
      .filter((p): p is ProjectConfig => p !== undefined);
  } else {
    selectedProjects = await promptProjectMultiSelect(config, sourceEnv);
    if (selectedProjects.length === 0) {
      console.log(chalk.yellow('No projects selected.'));
      return;
    }
  }

  let title = options.title;
  if (!title) {
    title = await promptInput(
      'MR title:',
      `Release ${sourceEnv} → ${targetEnv.name}`,
    );
  }

  const pairs = resolveBranchPairs(
    config,
    sourceEnv,
    'release',
    selectedProjects,
  );

  if (pairs.length === 0) {
    console.log(chalk.yellow('No projects to release.'));
    return;
  }

  console.log(
    chalk.cyan(
      `\nRelease: ${sourceEnv} → ${targetEnv.name} (${pairs.length} MR${pairs.length !== 1 ? 's' : ''})`,
    ),
  );

  const previewTable = new Table({
    head: ['Project', 'Source Branch', 'Target Branch'],
    style: { head: ['cyan'] },
  });
  for (const pair of pairs) {
    previewTable.push([
      pair.project.name,
      pair.sourceBranch,
      pair.targetBranch,
    ]);
  }
  console.log(previewTable.toString());

  if (options.dryRun) {
    console.log(chalk.yellow('\n--dry-run: No MRs created.'));
    return;
  }

  const client = createGitlabClient();
  const spinner = ora('Creating merge requests...').start();

  const results = await executeMergeRequests(
    client,
    pairs,
    title,
    options.description,
  );

  spinner.stop();
  printResults(results);
}

function printResults(results: MergeRequestResult[]): void {
  const table = new Table({
    head: ['Project', 'Status', 'URL'],
    style: { head: ['cyan'] },
  });

  for (const r of results) {
    const statusText =
      r.status === 'created'
        ? chalk.green('Created')
        : r.status === 'updated'
          ? chalk.yellow('Updated')
          : chalk.red(`Failed: ${r.error}`);

    table.push([r.project.name, statusText, r.mrUrl || '-']);
  }

  console.log(table.toString());

  const created = results.filter((r) => r.status === 'created').length;
  const updated = results.filter((r) => r.status === 'updated').length;
  const failed = results.filter((r) => r.status === 'failed').length;

  console.log(
    `\n${chalk.green(`${created} created`)}, ${chalk.yellow(`${updated} updated`)}, ${chalk.red(`${failed} failed`)}`,
  );
}
