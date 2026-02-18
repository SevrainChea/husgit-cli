import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { loadConfig, getGroupNames, hasEnvironments } from '../config/manager.js';
import { createGitlabClient } from '../gitlab/client.js';
import type { OpenMergeRequest } from '../types.js';

export function statusCommand(): Command {
  return new Command('status')
    .description('Show open MRs between adjacent environments')
    .option('--group <name>', 'Show only a specific group')
    .action(runStatus);
}

async function runStatus(options: { group?: string }): Promise<void> {
  const config = loadConfig();

  if (!hasEnvironments(config)) {
    console.log(
      chalk.red('No environments configured. Run "husgit setup flow" first.'),
    );
    return;
  }

  const groupNames = options.group
    ? [options.group]
    : getGroupNames(config);

  if (groupNames.length === 0) {
    console.log(chalk.yellow('No groups configured.'));
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
      for (let i = 0; i < config.environments.length - 1; i++) {
        const sourceEnv = config.environments[i];
        const targetEnv = config.environments[i + 1];
        const sourceBranch = project.branchMap[sourceEnv.name];
        const targetBranch = project.branchMap[targetEnv.name];

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
              sourceEnv: sourceEnv.name,
              targetEnv: targetEnv.name,
              sourceBranch,
              targetBranch,
              mrId: mr.iid,
              mrUrl: mr.webUrl,
              state: mr.state,
            });
          }
        } catch {
          // Skip projects that fail to query
        }
      }
    }
  }

  spinner.stop();

  if (openMRs.length === 0) {
    console.log(chalk.green('\nNo open merge requests between environments.'));
    return;
  }

  const table = new Table({
    head: ['Group', 'Project', 'Direction', 'Source', 'Target', 'State', 'URL'],
    style: { head: ['cyan'] },
  });

  for (const mr of openMRs) {
    table.push([
      mr.group,
      mr.project.name,
      `${mr.sourceEnv} → ${mr.targetEnv}`,
      mr.sourceBranch,
      mr.targetBranch,
      mr.state || '-',
      mr.mrUrl || '-',
    ]);
  }

  console.log(`\n${chalk.cyan(`${openMRs.length} open MR(s):`)}`);
  console.log(table.toString());
}
