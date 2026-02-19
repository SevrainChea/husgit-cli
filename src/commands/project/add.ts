import { Command } from 'commander';
import { groupAddProjectCommand } from '../group/addProject.js';

// project add is a thin wrapper around group add-project (with no required group arg)
export function projectAddCommand(): Command {
  const cmd = groupAddProjectCommand();
  cmd.name('add').description('Add a project to the registry');
  return cmd;
}
