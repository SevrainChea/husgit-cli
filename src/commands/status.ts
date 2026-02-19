import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import {
  loadConfig,
  getGroupNames,
  hasEnvironments,
  getEnvironmentByName,
} from '../config/manager.js';
import { createGitlabClient } from '../gitlab/client.js';
import type { OpenMergeRequest, Environment, Direction } from '../types.js';

interface EnvPair {
  sourceEnv: Environment;
  targetEnv: Environment;
  direction: Direction;
}

function buildEnvPairs(
  environments: Environment[],
  type: string | undefined,
  sourceEnvName: string | undefined,
): EnvPair[] {
  const pairs: EnvPair[] = [];
  const sorted = [...environments].sort((a, b) => a.order - b.order);

  if (!type || type === 'release') {
    for (let i = 0; i < sorted.length - 1; i++) {
      pairs.push({
        sourceEnv: sorted[i],
        targetEnv: sorted[i + 1],
        direction: 'release',
      });
    }
  }

  if (!type || type === 'backport') {
    for (let i = sorted.length - 1; i > 0; i--) {
      pairs.push({
        sourceEnv: sorted[i],
        targetEnv: sorted[i - 1],
        direction: 'backport',
      });
    }
  }

  if (sourceEnvName) {
    return pairs.filter((p) => p.sourceEnv.name === sourceEnvName);
  }

  return pairs;
}

export function statusCommand(): Command {
  return new Command('status')
    .description('Show open MRs between adjacent environments')
    .option('--group <name>', 'Show only a specific group')
    .option('--type <type>', 'Filter by direction: release or backport')
    .option('--source-env <name>', 'Filter by source environment name')
    .action(runStatus);
}

async function runStatus(options: {
  group?: string;
  type?: string;
  sourceEnv?: string;
}): Promise<void> {
  const config = loadConfig();

  if (!hasEnvironments(config)) {
    console.log(
      chalk.red('No environments configured. Run "husgit setup flow" first.'),
    );
    return;
  }

  if (options.type && options.type !== 'release' && options.type !== 'backport') {
    console.log(chalk.red(`Invalid --type "${options.type}". Must be "release" or "backport".`));
    return;
  }

  if (options.sourceEnv && !getEnvironmentByName(config, options.sourceEnv)) {
    console.log(
      chalk.red(`Environment "${options.sourceEnv}" not found in config.`),
    );
    return;
  }

  const groupNames = options.group ? [options.group] : getGroupNames(config);

  if (groupNames.length === 0) {
    console.log(chalk.yellow('No groups configured.'));
    return;
  }

  const envPairs = buildEnvPairs(
    config.environments,
    options.type,
    options.sourceEnv,
  );

  if (envPairs.length === 0) {
    console.log(chalk.yellow('No environment pairs match the given filters.'));
    return;
  }

  const client = createGitlabClient();
  const spinner = ora('Querying GitLab for open MRs...').start();

  const openMRs: OpenMergeRequest[] = [];

  for (const groupName of groupNames) {
    const group = config.groups[groupName];
    if (!group) {
      spinner.warn(`Group "${groupName}" not found`);
      continue;
    }

    for (const project of group.projects) {
      for (const pair of envPairs) {
        const sourceBranch = project.branchMap[pair.sourceEnv.name];
        const targetBranch = project.branchMap[pair.targetEnv.name];

        if (!sourceBranch || !targetBranch) continue;

        try {
          const mrs = await client.getOpenMergeRequests(
            project.fullPath,
            sourceBranch,
            targetBranch,
          );

          for (const mr of mrs) {
            openMRs.push({
              project,
              group: groupName,
              sourceEnv: pair.sourceEnv.name,
              targetEnv: pair.targetEnv.name,
              sourceBranch,
              targetBranch,
              direction: pair.direction,
              mrId: mr.iid,
              mrUrl: mr.webUrl,
              state: mr.state,
            });
          }
        } catch (err) {
          spinner.warn(`Could not query "${project.name}": ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
  }

  spinner.stop();

  if (openMRs.length === 0) {
    console.log(chalk.green('\nNo open merge requests matching the filters.'));
    return;
  }

  const table = new Table({
    head: ['Group', 'Project', 'Direction', 'Environments', 'State', 'URL'],
    style: { head: ['cyan'] },
  });

  for (const mr of openMRs) {
    table.push([
      mr.group,
      mr.project.name,
      mr.direction,
      `${mr.sourceEnv} → ${mr.targetEnv}`,
      mr.state || '-',
      mr.mrUrl || '-',
    ]); // columns: Group, Project, Direction, Environments, State, URL
  }

  console.log(`\n${chalk.cyan(`${openMRs.length} open MR(s):`)}`);
  console.log(table.toString());
}
