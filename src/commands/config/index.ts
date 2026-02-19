import { Command } from 'commander';
import { configExportCommand } from './export.js';

export function configCommand(): Command {
  const cmd = new Command('config').description('Manage local config');
  cmd.addCommand(configExportCommand());
  return cmd;
}
