import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import {
  loadConfig,
  getAllProjects,
  hasEnvironments,
  getEnvironmentByName,
} from '../config/manager.js';
import { createGitlabClient } from '../gitlab/client.js';
import type {
  OpenMergeRequest,
  MRPipeline,
  Environment,
  Direction,
  ProjectConfig,
} from '../types.js';

interface EnvPair {
  sourceEnv: Environment;
  targetEnv: Environment;
  direction: Direction;
}

function buildEnvPair(
  environments: Environment[],
  type: Direction,
  sourceEnvName: string,
): EnvPair | null {
  const sorted = [...environments].sort((a, b) => a.order - b.order);
  const sourceIdx = sorted.findIndex((e) => e.name === sourceEnvName);

  if (sourceIdx === -1) return null;

  if (type === 'release') {
    const targetEnv = sorted[sourceIdx + 1];
    if (!targetEnv) return null;
    return { sourceEnv: sorted[sourceIdx], targetEnv, direction: 'release' };
  } else {
    const targetEnv = sorted[sourceIdx - 1];
    if (!targetEnv) return null;
    return { sourceEnv: sorted[sourceIdx], targetEnv, direction: 'backport' };
  }
}

const STATUS_COLUMNS = ['Groups', 'Project', 'State', 'Pipeline', 'URL'];

export function statusCommand(): Command {
  return new Command('status')
    .description(
      'Show open MRs for a given flow direction and source environment',
    )
    .argument('<type>', 'Direction: release or backport')
    .argument('<source-env>', 'Source environment name')
    .option('--group <name>', 'Show only a specific group')
    .option('--hide-empty', 'Hide merge requests with no diff')
    .option(
      '--filter <text>',
      'Filter rows where the project name contains <text> (case-insensitive)',
    )
    .option(
      `--sort <column>`,
      `Sort rows by column (one of: ${STATUS_COLUMNS.join(', ')})`,
    )
    .action(runStatus);
}

async function runStatus(
  type: string,
  sourceEnvName: string,
  options: {
    group?: string;
    hideEmpty?: boolean;
    filter?: string;
    sort?: string;
  },
): Promise<void> {
  const config = loadConfig();

  if (!hasEnvironments(config)) {
    console.log(
      chalk.red('No environments configured. Run "husgit setup flow" first.'),
    );
    return;
  }

  if (type !== 'release' && type !== 'backport') {
    console.log(
      chalk.red(`Invalid type "${type}". Must be "release" or "backport".`),
    );
    return;
  }

  if (!getEnvironmentByName(config, sourceEnvName)) {
    console.log(
      chalk.red(`Environment "${sourceEnvName}" not found in config.`),
    );
    return;
  }

  const pair = buildEnvPair(
    config.environments,
    type as Direction,
    sourceEnvName,
  );
  if (!pair) {
    const msg =
      type === 'release'
        ? `"${sourceEnvName}" has no next environment to release into.`
        : `"${sourceEnvName}" has no previous environment to backport into.`;
    console.log(chalk.yellow(msg));
    return;
  }

  let projectsToQuery: ProjectConfig[];
  if (options.group) {
    const group = config.groups[options.group];
    if (!group) {
      console.log(chalk.yellow(`Group "${options.group}" not found.`));
      return;
    }
    projectsToQuery = group.projectPaths
      .map((fp) => config.projects[fp])
      .filter((p): p is ProjectConfig => p !== undefined);
  } else {
    projectsToQuery = getAllProjects(config);
  }

  if (projectsToQuery.length === 0) {
    console.log(chalk.yellow('No projects configured.'));
    return;
  }

  // Build reverse lookup: fullPath -> group names
  const projectGroupsMap = new Map<string, string[]>();
  for (const [groupName, group] of Object.entries(config.groups)) {
    for (const fp of group.projectPaths) {
      const existing = projectGroupsMap.get(fp) ?? [];
      existing.push(groupName);
      projectGroupsMap.set(fp, existing);
    }
  }

  const client = createGitlabClient();
  const spinner = ora('Querying GitLab for open MRs...').start();

  const openMRs: OpenMergeRequest[] = [];

  for (const project of projectsToQuery) {
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
          groups: projectGroupsMap.get(project.fullPath) ?? [],
          sourceEnv: pair.sourceEnv.name,
          targetEnv: pair.targetEnv.name,
          sourceBranch,
          targetBranch,
          direction: pair.direction,
          mrId: mr.iid,
          mrUrl: mr.webUrl,
          state: mr.state,
          hasChanges: mr.hasChanges,
          mergedAt: mr.mergedAt,
          pipeline: mr.pipeline,
        });
      }
    } catch (err) {
      spinner.warn(
        `Could not query "${project.name}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  spinner.stop();

  let visibleMRs = options.hideEmpty
    ? openMRs.filter((mr) => mr.hasChanges !== false)
    : openMRs;

  if (options.filter) {
    const needle = options.filter.toLowerCase();
    visibleMRs = visibleMRs.filter((mr) =>
      mr.project.name.toLowerCase().includes(needle),
    );
  }

  if (options.sort) {
    const sortCol = STATUS_COLUMNS.find(
      (c) => c.toLowerCase() === options.sort!.toLowerCase(),
    );
    if (!sortCol) {
      console.log(
        chalk.red(
          `Invalid --sort column "${options.sort}". Valid columns: ${STATUS_COLUMNS.join(', ')}.`,
        ),
      );
      return;
    }
    const keyFor = (mr: OpenMergeRequest): string => {
      switch (sortCol) {
        case 'Groups':
          return mr.groups.join(', ');
        case 'Project':
          return mr.project.name;
        case 'State':
          return mr.state ?? '';
        case 'Pipeline':
          return mr.pipeline?.status ?? '';
        case 'URL':
          return mr.mrUrl ?? '';
        default:
          return '';
      }
    };
    visibleMRs = [...visibleMRs].sort((a, b) =>
      keyFor(a).localeCompare(keyFor(b), undefined, { sensitivity: 'base' }),
    );
  }

  if (visibleMRs.length === 0) {
    console.log(chalk.green('\nNo open merge requests.'));
    return;
  }

  const table = new Table({
    head: STATUS_COLUMNS,
    style: { head: ['cyan'] },
  });

  for (const mr of visibleMRs) {
    const stateLabel = formatState(mr.state, mr.hasChanges, mr.mergedAt);
    table.push([
      mr.groups.join(', ') || chalk.dim('ungrouped'),
      mr.project.name,
      stateLabel,
      formatPipeline(mr.pipeline),
      mr.mrUrl || '-',
    ]);
  }

  const openCount = visibleMRs.filter((mr) => mr.state === 'opened').length;
  const mergedCount = visibleMRs.filter((mr) => mr.state === 'merged').length;
  const parts = [];
  if (openCount > 0) parts.push(chalk.cyan(`${openCount} open`));
  if (mergedCount > 0)
    parts.push(chalk.dim(`${mergedCount} merged (fallback)`));
  const arrow = `${pair.sourceEnv.name} → ${pair.targetEnv.name}`;
  const notes: string[] = [];
  if (options.hideEmpty) notes.push('empty MRs hidden');
  if (options.filter) notes.push(`filter: "${options.filter}"`);
  if (options.sort) notes.push(`sort: ${options.sort}`);
  const filterNote = notes.length ? chalk.dim(` · ${notes.join(' · ')}`) : '';
  console.log(
    `\n${parts.join(', ')} ${chalk.dim(`MR(s) (${type}: ${arrow}):`)}${filterNote}`,
  );
  console.log(table.toString());
}

function formatPipeline(pipeline: MRPipeline | null | undefined): string {
  if (!pipeline) return chalk.dim('-');
  switch (pipeline.status.toLowerCase()) {
    case 'success':
      return chalk.green('passed');
    case 'failed': {
      const failedJobs = pipeline.jobs
        .filter((j) => j.status.toLowerCase() === 'failed')
        .map((j) => j.name)
        .join(', ');
      return (
        chalk.red('failed') + (failedJobs ? chalk.dim(` (${failedJobs})`) : '')
      );
    }
    case 'running': {
      const stages = pipeline.jobs
        .filter((j) => j.status.toLowerCase() === 'running')
        .map((j) => j.stageName)
        .join(', ');
      return (
        chalk.yellow('running') + (stages ? chalk.dim(` (${stages})`) : '')
      );
    }
    case 'pending': {
      const stages = pipeline.jobs
        .filter((j) => j.status.toLowerCase() === 'pending')
        .map((j) => j.stageName)
        .join(', ');
      return chalk.dim('pending') + (stages ? chalk.dim(` (${stages})`) : '');
    }
    case 'canceled': {
      const stages = pipeline.jobs
        .filter((j) => j.status.toLowerCase() === 'canceled')
        .map((j) => j.stageName)
        .join(', ');
      return chalk.dim('canceled') + (stages ? chalk.dim(` (${stages})`) : '');
    }
    case 'skipped':
      return chalk.dim('skipped');
    default:
      return chalk.dim(pipeline.status.toLowerCase());
  }
}

function formatState(
  state: string | undefined,
  hasChanges: boolean | undefined,
  mergedAt?: string,
): string {
  if (!state) return '-';
  if (state === 'merged') {
    const date = mergedAt
      ? chalk.dim(` (${new Date(mergedAt).toLocaleDateString()})`)
      : '';
    return `${chalk.dim('merged')}${date}`;
  }
  if (hasChanges === false) {
    return `${chalk.dim(state)} ${chalk.yellow('(empty)')}`;
  }
  return chalk.green(state);
}
