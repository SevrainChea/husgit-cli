import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import {
  loadConfig,
  getGroupNames,
  getPreviousEnvironment,
} from '../config/manager.js';
import { createGitlabClient } from '../gitlab/client.js';
import { resolveBranchPairs, executeMergeRequests } from '../services/flowExecution.js';
import { promptSelect, promptInput } from '../ui/prompts.js';
import type { MergeRequestResult } from '../types.js';

export function backportCommand(): Command {
  return new Command('backport')
    .description(
      'Create merge requests to backport to the previous environment',
    )
    .argument('<source-env>', 'Source environment name')
    .option('--group <name>', 'Target a specific group')
    .option('--all', 'Target all groups')
    .option('--title <title>', 'MR title')
    .option('--description <desc>', 'MR description')
    .option('--dry-run', 'Show what would be created without creating MRs')
    .action(runBackport);
}

async function runBackport(
  sourceEnv: string,
  options: {
    group?: string;
    all?: boolean;
    title?: string;
    description?: string;
    dryRun?: boolean;
  },
): Promise<void> {
  const config = loadConfig();

  const targetEnv = getPreviousEnvironment(config, sourceEnv);
  if (!targetEnv) {
    console.log(
      chalk.red(
        `No previous environment before "${sourceEnv}". Cannot backport.`,
      ),
    );
    return;
  }

  const allGroups = getGroupNames(config);
  if (allGroups.length === 0) {
    console.log(
      chalk.red('No groups configured. Run "husgit group add" first.'),
    );
    return;
  }

  let selectedGroups: string[];
  if (options.all) {
    selectedGroups = allGroups;
  } else if (options.group) {
    selectedGroups = [options.group];
  } else {
    const chosen = await promptSelect<string>(
      'Select a group:',
      allGroups.map((g) => ({ name: g, value: g })),
    );
    selectedGroups = [chosen];
  }

  let title = options.title;
  if (!title) {
    title = await promptInput(
      'MR title:',
      `Backport ${sourceEnv} → ${targetEnv.name}`,
    );
  }

  const pairs = resolveBranchPairs(
    config,
    sourceEnv,
    'backport',
    selectedGroups,
  );

  if (pairs.length === 0) {
    console.log(chalk.yellow('No projects to backport.'));
    return;
  }

  console.log(
    chalk.cyan(
      `\nBackport: ${sourceEnv} → ${targetEnv.name} (${pairs.length} MR${pairs.length !== 1 ? 's' : ''})`,
    ),
  );

  const previewTable = new Table({
    head: ['Project', 'Source Branch', 'Target Branch'],
    style: { head: ['cyan'] },
  });
  for (const pair of pairs) {
    previewTable.push([pair.project.name, pair.sourceBranch, pair.targetBranch]);
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
