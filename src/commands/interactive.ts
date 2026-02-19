import chalk from 'chalk';
import {
  loadConfig,
  hasEnvironments,
  getGroupNames,
  getAllProjects,
} from '../config/manager.js';
import { runSetupFlow } from './setup/flow.js';
import { promptSelect } from '../ui/prompts.js';

type MenuAction =
  | 'setup'
  | 'groups'
  | 'projects'
  | 'release'
  | 'backport'
  | 'status'
  | 'config'
  | 'exit';

type GroupAction = 'add' | 'add-project' | 'list' | 'remove' | 'back';
type ProjectAction = 'add' | 'remove' | 'back';

function isAbort(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === 'ExitPromptError' || err.name === 'CancelPromptError')
  );
}

export async function interactiveMenu(): Promise<void> {
  console.log(chalk.cyan('\n  husgit - GitLab MR Workflow CLI\n'));

  const config = loadConfig();

  if (!hasEnvironments(config)) {
    console.log(
      chalk.yellow('No environments configured. Starting setup...\n'),
    );
    await runSetupFlow();
    return interactiveMenu();
  }

  const chain = config.environments.map((e) => e.name).join(' → ');
  const projectCount = getAllProjects(config).length;
  console.log(chalk.dim(`  Flow: ${chain}`));
  console.log(
    chalk.dim(`  Groups: ${getGroupNames(config).join(', ') || 'none'}`),
  );
  console.log(chalk.dim(`  Projects: ${projectCount}\n`));

  let action: MenuAction;
  try {
    action = await promptSelect<MenuAction>('What would you like to do?', [
      { name: 'Setup Environments', value: 'setup' },
      { name: 'Manage Groups', value: 'groups' },
      { name: 'Manage Projects', value: 'projects' },
      { name: 'Release', value: 'release' },
      { name: 'Back-port', value: 'backport' },
      { name: 'Status', value: 'status' },
      { name: 'Export Config', value: 'config' },
      { name: 'Exit', value: 'exit' },
    ]);
  } catch (err) {
    if (isAbort(err)) return; // Ctrl+C at top level → exit
    throw err;
  }

  try {
    switch (action) {
      case 'setup':
        await runSetupFlow();
        return interactiveMenu();

      case 'groups':
        await groupsMenu();
        return interactiveMenu();

      case 'projects':
        await projectsMenu();
        return interactiveMenu();

      case 'release': {
        const { releaseCommand } = await import('./release.js');
        const cmd = releaseCommand();
        await cmd.parseAsync(['node', 'release']);
        break;
      }

      case 'backport': {
        const { backportCommand } = await import('./backport.js');
        const cmd = backportCommand();
        await cmd.parseAsync(['node', 'backport']);
        break;
      }

      case 'status': {
        const { statusCommand } = await import('./status.js');
        const cmd = statusCommand();
        await cmd.parseAsync(['node', 'status']);
        break;
      }

      case 'config': {
        const { configExportCommand } = await import('./config/export.js');
        const cmd = configExportCommand();
        await cmd.parseAsync(['node', 'export']);
        break;
      }

      case 'exit':
        return;
    }
  } catch (err) {
    if (isAbort(err)) {
      // Ctrl+C during a sub-flow → go back to main menu
      return interactiveMenu();
    }
    throw err;
  }
}

async function groupsMenu(): Promise<void> {
  let action: GroupAction;
  try {
    action = await promptSelect<GroupAction>('Group management:', [
      { name: 'Add group', value: 'add' },
      { name: 'Add project to group', value: 'add-project' },
      { name: 'List groups', value: 'list' },
      { name: 'Remove group', value: 'remove' },
      { name: 'Back', value: 'back' },
    ]);
  } catch (err) {
    if (isAbort(err)) return; // Ctrl+C at submenu → go back
    throw err;
  }

  try {
    switch (action) {
      case 'add': {
        const { promptInput } = await import('../ui/prompts.js');
        const name = await promptInput('Group name:');
        const { groupAddCommand } = await import('./group/add.js');
        const cmd = groupAddCommand();
        await cmd.parseAsync(['node', 'add', name]);
        break;
      }

      case 'add-project': {
        const config = loadConfig();
        const groups = getGroupNames(config);
        if (groups.length === 0) {
          console.log(chalk.yellow('No groups. Create one first.'));
          break;
        }
        const group = await promptSelect<string>(
          'Select group:',
          groups.map((g) => ({ name: g, value: g })),
        );
        const { groupAddProjectCommand } = await import('./group/addProject.js');
        const cmd = groupAddProjectCommand();
        await cmd.parseAsync(['node', 'add-project', group]);
        break;
      }

      case 'list': {
        const { groupListCommand } = await import('./group/list.js');
        const cmd = groupListCommand();
        await cmd.parseAsync(['node', 'list']);
        break;
      }

      case 'remove': {
        const config = loadConfig();
        const groups = getGroupNames(config);
        if (groups.length === 0) {
          console.log(chalk.yellow('No groups to remove.'));
          break;
        }
        const group = await promptSelect<string>(
          'Select group to remove:',
          groups.map((g) => ({ name: g, value: g })),
        );
        const { groupRemoveCommand } = await import('./group/remove.js');
        const cmd = groupRemoveCommand();
        await cmd.parseAsync(['node', 'remove', group]);
        break;
      }

      case 'back':
        return;
    }
  } catch (err) {
    if (isAbort(err)) return; // Ctrl+C during action → go back to group menu
    throw err;
  }
}

async function projectsMenu(): Promise<void> {
  let action: ProjectAction;
  try {
    action = await promptSelect<ProjectAction>('Project management:', [
      { name: 'Add project', value: 'add' },
      { name: 'Remove project', value: 'remove' },
      { name: 'Back', value: 'back' },
    ]);
  } catch (err) {
    if (isAbort(err)) return; // Ctrl+C at submenu → go back
    throw err;
  }

  try {
    switch (action) {
      case 'add': {
        const { groupAddProjectCommand } = await import('./group/addProject.js');
        const cmd = groupAddProjectCommand();
        await cmd.parseAsync(['node', 'add-project']);
        break;
      }

      case 'remove': {
        const config = loadConfig();
        const projects = getAllProjects(config);
        if (projects.length === 0) {
          console.log(chalk.yellow('No projects to remove.'));
          break;
        }
        const { promptSelect: ps } = await import('../ui/prompts.js');
        const fullPath = await ps<string>(
          'Select project to remove:',
          projects.map((p) => ({ name: p.name, value: p.fullPath })),
        );
        const { projectRemoveCommand } = await import('./project/remove.js');
        const cmd = projectRemoveCommand();
        await cmd.parseAsync(['node', 'remove', fullPath]);
        break;
      }

      case 'back':
        return;
    }
  } catch (err) {
    if (isAbort(err)) return; // Ctrl+C during action → go back to project menu
    throw err;
  }
}
