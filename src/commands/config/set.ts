import { Command } from 'commander';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import chalk from 'chalk';
import {
  loadConfig,
  saveConfig,
  validateConfig,
  getConfigPath,
} from '../../config/manager.js';

export function configSetCommand(): Command {
  return new Command('set')
    .description('Load config from a JSON file')
    .argument('<file-path>', 'Path to JSON config file')
    .action(runConfigSet);
}

function runConfigSet(filePath: string): void {
  try {
    // Resolve path with ~ expansion and relative path support
    const resolvedPath = resolvePath(filePath);

    // Read the file
    let fileContent: string;
    try {
      fileContent = readFileSync(resolvedPath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`File not found: ${filePath}`);
      }
      if ((error as NodeJS.ErrnoException).code === 'EISDIR') {
        throw new Error(`Path is a directory, not a file: ${filePath}`);
      }
      throw new Error(`Failed to read file: ${(error as Error).message}`);
    }

    // Parse JSON
    let parsedConfig: unknown;
    try {
      parsedConfig = JSON.parse(fileContent);
    } catch (error) {
      throw new Error(`Invalid JSON in file: ${(error as Error).message}`);
    }

    // Validate config
    const newConfig = validateConfig(parsedConfig);

    // Create backup of current config with timestamp
    const currentConfig = loadConfig();
    const configPath = getConfigPath();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = configPath.replace(
      /\.json$/,
      `.backup.${timestamp}.json`,
    );

    try {
      const configDir = dirname(configPath);
      mkdirSync(configDir, { recursive: true });
      writeFileSync(
        backupPath,
        JSON.stringify(currentConfig, null, 2) + '\n',
        'utf-8',
      );
    } catch (error) {
      throw new Error(`Failed to create backup: ${(error as Error).message}`);
    }

    // Save new config
    saveConfig(newConfig);

    console.log(chalk.green('✓ Config loaded successfully'));
    console.log(chalk.gray(`  Backup saved: ${backupPath}`));
  } catch (error) {
    console.log(chalk.red(`✗ Error: ${(error as Error).message}`));
  }
}

function resolvePath(filePath: string): string {
  // Expand tilde
  let expanded = filePath;
  if (filePath.startsWith('~')) {
    expanded = filePath.replace(/^~/, homedir());
  }

  // Resolve relative paths from current working directory
  return resolve(expanded);
}
