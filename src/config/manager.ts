import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type {
  HusgitConfig,
  Environment,
  Group,
  ProjectConfig,
} from '../types.js';

const CONFIG_DIR = join(homedir(), '.husgit');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

function defaultConfig(): HusgitConfig {
  return {
    gitlabUrl: process.env.GITLAB_URL || 'https://gitlab.com',
    environments: [],
    groups: {},
  };
}

export function loadConfig(): HusgitConfig {
  if (!existsSync(CONFIG_PATH)) {
    return defaultConfig();
  }
  const raw = readFileSync(CONFIG_PATH, 'utf-8');
  return JSON.parse(raw) as HusgitConfig;
}

export function saveConfig(config: HusgitConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}

export function hasEnvironments(config: HusgitConfig): boolean {
  return config.environments.length > 0;
}

export function getEnvironmentByName(
  config: HusgitConfig,
  name: string,
): Environment | undefined {
  return config.environments.find((e) => e.name === name);
}

export function getNextEnvironment(
  config: HusgitConfig,
  envName: string,
): Environment | undefined {
  const env = getEnvironmentByName(config, envName);
  if (!env) return undefined;
  return config.environments.find((e) => e.order === env.order + 1);
}

export function getPreviousEnvironment(
  config: HusgitConfig,
  envName: string,
): Environment | undefined {
  const env = getEnvironmentByName(config, envName);
  if (!env) return undefined;
  return config.environments.find((e) => e.order === env.order - 1);
}

export function setEnvironments(
  config: HusgitConfig,
  environments: Environment[],
): void {
  config.environments = environments;
}

export function addGroup(config: HusgitConfig, name: string): void {
  if (config.groups[name]) {
    throw new Error(`Group "${name}" already exists`);
  }
  config.groups[name] = { projects: [] };
}

export function removeGroup(config: HusgitConfig, name: string): void {
  if (!config.groups[name]) {
    throw new Error(`Group "${name}" does not exist`);
  }
  delete config.groups[name];
}

export function addProjectToGroup(
  config: HusgitConfig,
  groupName: string,
  project: ProjectConfig,
): void {
  const group = config.groups[groupName];
  if (!group) {
    throw new Error(`Group "${groupName}" does not exist`);
  }
  const exists = group.projects.some(
    (p) => p.externalId === project.externalId,
  );
  if (exists) {
    throw new Error(
      `Project "${project.name}" already exists in group "${groupName}"`,
    );
  }
  group.projects.push(project);
}

export function getGroupNames(config: HusgitConfig): string[] {
  return Object.keys(config.groups);
}

export function getGroup(
  config: HusgitConfig,
  name: string,
): Group | undefined {
  return config.groups[name];
}
