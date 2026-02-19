import { Command } from 'commander';
import { configExportCommand } from './export.js';
import { configSetCommand } from './set.js';

export function configCommand(): Command {
  const cmd = new Command('config').description('Manage local config');
  cmd.addCommand(configExportCommand());
  cmd.addCommand(configSetCommand());
  return cmd;
}
