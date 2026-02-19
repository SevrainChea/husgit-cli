import chalk from 'chalk';
import {
  loadConfig,
  hasEnvironments,
  getGroupNames,
} from '../config/manager.js';
import { runSetupFlow } from './setup/flow.js';
import { promptSelect } from '../ui/prompts.js';

type MenuAction =
  | 'setup'
  | 'groups'
  | 'release'
  | 'backport'
  | 'status'
  | 'config'
  | 'exit';

type GroupAction = 'add' | 'add-project' | 'list' | 'remove' | 'back';

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
  console.log(chalk.dim(`  Flow: ${chain}`));
  console.log(
    chalk.dim(`  Groups: ${getGroupNames(config).join(', ') || 'none'}\n`),
  );

  const action = await promptSelect<MenuAction>('What would you like to do?', [
    { name: 'Setup Environments', value: 'setup' },
    { name: 'Manage Groups', value: 'groups' },
    { name: 'Release', value: 'release' },
    { name: 'Back-port', value: 'backport' },
    { name: 'Status', value: 'status' },
    { name: 'Export Config', value: 'config' },
    { name: 'Exit', value: 'exit' },
  ]);

  switch (action) {
    case 'setup':
      await runSetupFlow();
      return interactiveMenu();

    case 'groups':
      await groupsMenu();
      return interactiveMenu();

    case 'release':
      await runReleaseInteractive();
      break;

    case 'backport':
      await runBackportInteractive();
      break;

    case 'status': {
      // Dynamic import to avoid circular deps
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
}

async function groupsMenu(): Promise<void> {
  const action = await promptSelect<GroupAction>('Group management:', [
    { name: 'Add group', value: 'add' },
    { name: 'Add project to group', value: 'add-project' },
    { name: 'List groups', value: 'list' },
    { name: 'Remove group', value: 'remove' },
    { name: 'Back', value: 'back' },
  ]);

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
}

async function runReleaseInteractive(): Promise<void> {
  const config = loadConfig();
  const envs = config.environments.filter(
    (_e, i) => i < config.environments.length - 1,
  );

  if (envs.length === 0) {
    console.log(chalk.yellow('Not enough environments to release.'));
    return;
  }

  const sourceEnv = await promptSelect<string>(
    'Source environment:',
    envs.map((e) => ({
      name: e.name,
      value: e.name,
      description: `Release to next environment`,
    })),
  );

  const { releaseCommand } = await import('./release.js');
  const cmd = releaseCommand();
  await cmd.parseAsync(['node', 'release', sourceEnv]);
}

async function runBackportInteractive(): Promise<void> {
  const config = loadConfig();
  const envs = config.environments.filter((_e, i) => i > 0);

  if (envs.length === 0) {
    console.log(chalk.yellow('Not enough environments to backport.'));
    return;
  }

  const sourceEnv = await promptSelect<string>(
    'Source environment:',
    envs.map((e) => ({
      name: e.name,
      value: e.name,
      description: `Backport to previous environment`,
    })),
  );

  const { backportCommand } = await import('./backport.js');
  const cmd = backportCommand();
  await cmd.parseAsync(['node', 'backport', sourceEnv]);
}
