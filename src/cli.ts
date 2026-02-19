import { Command } from 'commander';
import { setupFlowCommand } from './commands/setup/flow.js';
import { groupAddCommand } from './commands/group/add.js';
import { groupAddProjectCommand } from './commands/group/addProject.js';
import { groupListCommand } from './commands/group/list.js';
import { groupRemoveCommand } from './commands/group/remove.js';
import { releaseCommand } from './commands/release.js';
import { backportCommand } from './commands/backport.js';
import { statusCommand } from './commands/status.js';
import { configCommand } from './commands/config/index.js';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('husgit')
    .description('CLI tool for orchestrating GitLab merge request workflows')
    .version('0.1.0');

  // Setup
  const setup = program.command('setup').description('Configure environments');
  setup.addCommand(setupFlowCommand());

  // Group
  const group = program.command('group').description('Manage project groups');
  group.addCommand(groupAddCommand());
  group.addCommand(groupAddProjectCommand());
  group.addCommand(groupListCommand());
  group.addCommand(groupRemoveCommand());

  // Release & Backport
  program.addCommand(releaseCommand());
  program.addCommand(backportCommand());

  // Status
  program.addCommand(statusCommand());

  // Config
  program.addCommand(configCommand());

  return program;
}
