import { Command } from 'commander';
import chalk from 'chalk';
import {
  loadConfig,
  saveConfig,
  removeProject,
  getAllProjects,
} from '../../config/manager.js';
import { promptSelect, promptConfirm } from '../../ui/prompts.js';

export function projectRemoveCommand(): Command {
  return new Command('remove')
    .description('Remove a project from the registry (and all groups)')
    .argument('[fullPath]', 'Project fullPath')
    .option('--force', 'Skip confirmation')
    .action(runProjectRemove);
}

async function runProjectRemove(
  fullPathArg: string | undefined,
  options: { force?: boolean },
): Promise<void> {
  const config = loadConfig();
  const projects = getAllProjects(config);

  if (projects.length === 0) {
    console.log(chalk.yellow('No projects configured.'));
    return;
  }

  let fullPath: string;
  if (fullPathArg) {
    fullPath = fullPathArg;
  } else {
    fullPath = await promptSelect<string>(
      'Select project to remove:',
      projects.map((p) => ({ name: p.name, value: p.fullPath })),
    );
  }

  const project = config.projects[fullPath];
  if (!project) {
    console.log(chalk.red(`Project "${fullPath}" not found.`));
    return;
  }

  if (!options.force) {
    const ok = await promptConfirm(
      `Remove project "${project.name}" from registry and all groups? This cannot be undone.`,
      false,
    );
    if (!ok) {
      console.log('Cancelled.');
      return;
    }
  }

  try {
    removeProject(config, fullPath);
    saveConfig(config);
    console.log(chalk.green(`Project "${project.name}" removed.`));
  } catch (error: unknown) {
    console.log(
      chalk.red(
        error instanceof Error ? error.message : 'Failed to remove project',
      ),
    );
  }
}
