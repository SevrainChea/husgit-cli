import { Command } from 'commander';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { setupFlowCommand } from './commands/setup/flow.js';
import { groupAddCommand } from './commands/group/add.js';
import { groupAddProjectCommand } from './commands/group/addProject.js';
import { groupListCommand } from './commands/group/list.js';
import { groupRemoveCommand } from './commands/group/remove.js';
import { projectAddCommand } from './commands/project/add.js';
import { projectRemoveCommand } from './commands/project/remove.js';
import { projectListCommand } from './commands/project/list.js';
import { releaseCommand } from './commands/release.js';
import { backportCommand } from './commands/backport.js';
import { statusCommand } from './commands/status.js';
import { configCommand } from './commands/config/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf-8'),
);

export function createProgram(): Command {
  const program = new Command();

  program
    .name('husgit')
    .description('CLI tool for orchestrating GitLab merge request workflows')
    .version(packageJson.version);

  // Setup
  const setup = program.command('setup').description('Configure environments');
  setup.addCommand(setupFlowCommand());

  // Group
  const group = program.command('group').description('Manage project groups');
  group.addCommand(groupAddCommand());
  group.addCommand(groupAddProjectCommand());
  group.addCommand(groupListCommand());
  group.addCommand(groupRemoveCommand());

  // Project
  const project = program.command('project').description('Manage projects');
  project.addCommand(projectAddCommand());
  project.addCommand(projectRemoveCommand());
  project.addCommand(projectListCommand());

  // Release & Backport
  program.addCommand(releaseCommand());
  program.addCommand(backportCommand());

  // Status
  program.addCommand(statusCommand());

  // Config
  program.addCommand(configCommand());

  return program;
}
