import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import {
  loadConfig,
  saveConfig,
  addProject,
  addProjectToGroup,
  hasEnvironments,
  getGroupNames,
} from '../../config/manager.js';
import { createGitlabClient } from '../../gitlab/client.js';
import {
  promptConfirm,
  promptSearch,
  promptSelect,
  promptGitlabProjectCheckbox,
} from '../../ui/prompts.js';
import type { ProjectConfig, GitlabProject } from '../../types.js';

export function groupAddProjectCommand(): Command {
  return new Command('add-project')
    .description(
      'Add one or more projects to the registry (optionally assign to a group)',
    )
    .argument('[group]', 'Group name (optional)')
    .option('--project-id <id>', 'GitLab project ID (single-project mode)')
    .option('--branch-map <json>', 'Branch map as JSON (single-project mode)')
    .action(runGroupAddProject);
}

async function runGroupAddProject(
  groupArg: string | undefined,
  options: { projectId?: string; branchMap?: string },
): Promise<void> {
  const config = loadConfig();

  if (groupArg && !config.groups[groupArg]) {
    console.log(chalk.red(`Group "${groupArg}" does not exist.`));
    return;
  }

  if (!hasEnvironments(config)) {
    console.log(
      chalk.red('No environments configured. Run "husgit setup flow" first.'),
    );
    return;
  }

  const client = createGitlabClient();

  if (options.projectId) {
    const spinner = ora('Fetching project...').start();
    let project: GitlabProject;
    try {
      project = await client.getProjectById(options.projectId);
      spinner.succeed(`Found: ${project.name}`);
    } catch {
      spinner.fail('Project not found');
      return;
    }
    await addSingleProject(
      project,
      groupArg,
      options.branchMap,
      config,
      client,
    );
    return;
  }

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

  const selected = await promptGitlabProjectCheckbox(allProjects);
  if (selected.length === 0) {
    console.log('No projects selected.');
    return;
  }

  const toAdd: ProjectConfig[] = [];
  const groups: Record<string, string | undefined> = {};

  for (const project of selected) {
    if (config.projects[project.fullPath]) {
      console.log(
        chalk.yellow(`  Skipping "${project.name}" — already in registry.`),
      );
      continue;
    }

    console.log(chalk.cyan(`\nConfiguring: ${project.name}`));

    const branchMap = await buildBranchMap(project, config, client);

    const projectConfig: ProjectConfig = {
      externalId: project.externalId,
      name: project.name,
      fullPath: project.fullPath,
      branchMap,
    };

    let assignedGroup = groupArg;
    if (!assignedGroup) {
      const groupNames = getGroupNames(config);
      if (groupNames.length > 0) {
        const assignGroup = await promptConfirm(
          `Assign "${project.name}" to a group? (optional)`,
          false,
        );
        if (assignGroup) {
          assignedGroup = await promptSelect<string>(
            'Select group:',
            groupNames.map((g) => ({ name: g, value: g })),
          );
        }
      }
    }

    toAdd.push(projectConfig);
    groups[project.fullPath] = assignedGroup;
  }

  if (toAdd.length === 0) {
    console.log('Nothing to add.');
    return;
  }

  console.log(chalk.cyan('\nProjects to add:'));
  for (const p of toAdd) {
    const groupName = groups[p.fullPath];
    const groupMsg = groupName ? chalk.gray(` → group: ${groupName}`) : '';
    console.log(`  ${p.name}${groupMsg}`);
    for (const [env, branch] of Object.entries(p.branchMap)) {
      console.log(`    ${env} → ${branch}`);
    }
  }

  const ok = await promptConfirm(`Add ${toAdd.length} project(s)?`);
  if (!ok) {
    console.log('Cancelled.');
    return;
  }

  let saved = 0;
  for (const p of toAdd) {
    try {
      addProject(config, p);
      const groupName = groups[p.fullPath];
      if (groupName) {
        addProjectToGroup(config, groupName, p.fullPath);
      }
      saved++;
    } catch (error: unknown) {
      console.log(
        chalk.red(
          `Failed to add "${p.name}": ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  if (saved > 0) {
    saveConfig(config);
  }
  if (saved < toAdd.length) {
    console.log(
      chalk.yellow(
        `${toAdd.length - saved} project(s) failed to add (see errors above).`,
      ),
    );
  }
  console.log(chalk.green(`${saved} project(s) added to registry.`));
}

async function addSingleProject(
  project: GitlabProject,
  groupArg: string | undefined,
  branchMapJson: string | undefined,
  config: ReturnType<typeof loadConfig>,
  client: ReturnType<typeof createGitlabClient>,
): Promise<void> {
  if (config.projects[project.fullPath]) {
    console.log(
      chalk.yellow(`Project "${project.name}" is already in the registry.`),
    );
    return;
  }

  let branchMap: Record<string, string>;

  if (branchMapJson) {
    try {
      branchMap = JSON.parse(branchMapJson);
    } catch {
      console.log(chalk.red('Invalid JSON for --branch-map'));
      return;
    }
  } else {
    branchMap = await buildBranchMap(project, config, client);
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

  let groupName = groupArg;
  if (!groupName) {
    const groups = getGroupNames(config);
    if (groups.length > 0) {
      const assignGroup = await promptConfirm(
        'Assign to a group? (optional)',
        false,
      );
      if (assignGroup) {
        groupName = await promptSelect<string>(
          'Select group:',
          groups.map((g) => ({ name: g, value: g })),
        );
      }
    }
  }

  const ok = await promptConfirm('Add this project?');
  if (!ok) {
    console.log('Cancelled.');
    return;
  }

  try {
    addProject(config, projectConfig);
    if (groupName) {
      addProjectToGroup(config, groupName, projectConfig.fullPath);
    }
    saveConfig(config);
    const groupMsg = groupName ? ` and assigned to group "${groupName}"` : '';
    console.log(chalk.green(`Project added to registry${groupMsg}.`));
  } catch (error: unknown) {
    console.log(
      chalk.red(
        error instanceof Error ? error.message : 'Failed to add project',
      ),
    );
  }
}

async function buildBranchMap(
  project: GitlabProject,
  config: ReturnType<typeof loadConfig>,
  client: ReturnType<typeof createGitlabClient>,
): Promise<Record<string, string>> {
  const branchMap: Record<string, string> = {};
  for (const env of config.environments) {
    const initialBranches = await client.getProjectBranches(
      project.fullPath,
      env.defaultBranch ?? '',
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
        return initialBranches.map((b) => ({ name: b, value: b }));
      },
    );

    branchMap[env.name] = branch;
  }
  return branchMap;
}
