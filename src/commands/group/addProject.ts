import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import {
  loadConfig,
  saveConfig,
  addProjectToGroup,
  hasEnvironments,
} from '../../config/manager.js';
import { createGitlabClient } from '../../gitlab/client.js';
import { promptInput, promptConfirm, promptSearch } from '../../ui/prompts.js';
import type { ProjectConfig, GitlabProject } from '../../types.js';

export function groupAddProjectCommand(): Command {
  return new Command('add-project')
    .description('Add a project to a group')
    .argument('<group>', 'Group name')
    .option('--project-id <id>', 'GitLab project ID')
    .option('--branch-map <json>', 'Branch map as JSON')
    .action(runGroupAddProject);
}

async function runGroupAddProject(
  groupName: string,
  options: { projectId?: string; branchMap?: string },
): Promise<void> {
  const config = loadConfig();

  if (!config.groups[groupName]) {
    console.log(chalk.red(`Group "${groupName}" does not exist.`));
    return;
  }

  if (!hasEnvironments(config)) {
    console.log(
      chalk.red('No environments configured. Run "husgit setup flow" first.'),
    );
    return;
  }

  const client = createGitlabClient();

  let project: GitlabProject;

  if (options.projectId) {
    const spinner = ora('Fetching project...').start();
    try {
      project = await client.getProjectById(options.projectId);
      spinner.succeed(`Found: ${project.name}`);
    } catch {
      spinner.fail('Project not found');
      return;
    }
  } else {
    const spinner = ora('Fetching your GitLab projects...').start();
    let allProjects: GitlabProject[];
    try {
      allProjects = await client.getUserProjects();
      spinner.succeed(`Found ${allProjects.length} projects`);
    } catch (error: unknown) {
      spinner.fail(
        error instanceof Error ? error.message : 'Failed to fetch projects',
      );
      return;
    }

    project = await promptSearch<GitlabProject>(
      'Select a project:',
      async (term) => {
        const filtered = term
          ? allProjects.filter((p) =>
              p.name.toLowerCase().includes(term.toLowerCase()),
            )
          : allProjects;
        return filtered.map((p) => ({ name: p.name, value: p }));
      },
    );
  }

  let branchMap: Record<string, string>;

  if (options.branchMap) {
    try {
      branchMap = JSON.parse(options.branchMap);
    } catch {
      console.log(chalk.red('Invalid JSON for --branch-map'));
      return;
    }
  } else {
    branchMap = {};
    for (const env of config.environments) {
      const branches = await client.getProjectBranches(
        project.fullPath,
        '',
      );

      const branch = await promptSearch<string>(
        `Branch for "${env.name}" environment:`,
        async (term) => {
          if (term) {
            const remote = await client.getProjectBranches(
              project.fullPath,
              term,
            );
            return remote.map((b) => ({ name: b, value: b }));
          }
          return branches.map((b) => ({ name: b, value: b }));
        },
      );

      branchMap[env.name] = branch;
    }
  }

  const projectConfig: ProjectConfig = {
    externalId: project.externalId,
    name: project.name,
    fullPath: project.fullPath,
    branchMap,
  };

  console.log(chalk.cyan('\nProject summary:'));
  console.log(`  Name: ${projectConfig.name}`);
  console.log(`  ID: ${projectConfig.externalId}`);
  for (const [env, branch] of Object.entries(projectConfig.branchMap)) {
    console.log(`  ${env} → ${branch}`);
  }

  const ok = await promptConfirm('Add this project?');
  if (!ok) {
    console.log('Cancelled.');
    return;
  }

  try {
    addProjectToGroup(config, groupName, projectConfig);
    saveConfig(config);
    console.log(chalk.green(`Project added to group "${groupName}".`));
  } catch (error: unknown) {
    console.log(
      chalk.red(
        error instanceof Error ? error.message : 'Failed to add project',
      ),
    );
  }
}
