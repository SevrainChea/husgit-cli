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

export function validateConfig(config: unknown): HusgitConfig {
  // Type guard and validation
  if (!config || typeof config !== 'object') {
    throw new Error('Config must be an object');
  }

  const cfg = config as Record<string, unknown>;

  // Validate gitlabUrl (optional, defaults to https://gitlab.com if omitted)
  if (cfg.gitlabUrl !== undefined && typeof cfg.gitlabUrl !== 'string') {
    throw new Error('Config field "gitlabUrl" must be a string');
  }

  // Validate environments (required, must be array)
  if (!Array.isArray(cfg.environments)) {
    throw new Error('Config field "environments" must be an array');
  }

  if (cfg.environments.length === 0) {
    throw new Error('Config must have at least one environment');
  }

  // Validate environment structure and order
  const envOrders = new Set<number>();
  const envNames = new Set<string>();

  for (let i = 0; i < cfg.environments.length; i++) {
    const env = cfg.environments[i];
    if (!env || typeof env !== 'object') {
      throw new Error(`Environment at index ${i} must be an object`);
    }

    const envObj = env as Record<string, unknown>;

    // Check required fields
    if (typeof envObj.name !== 'string' || !envObj.name.trim()) {
      throw new Error(
        `Environment at index ${i} missing required field "name" (string)`,
      );
    }

    if (typeof envObj.order !== 'number') {
      throw new Error(
        `Environment "${envObj.name}" missing required field "order" (number)`,
      );
    }

    // Check uniqueness
    if (envNames.has(envObj.name)) {
      throw new Error(`Duplicate environment name: "${envObj.name}"`);
    }
    envNames.add(envObj.name);

    if (envOrders.has(envObj.order)) {
      throw new Error(`Duplicate environment order: ${envObj.order}`);
    }
    envOrders.add(envObj.order);
  }

  // Validate order is sequential (0, 1, 2, ...)
  const sortedOrders = Array.from(envOrders).sort((a, b) => a - b);
  for (let i = 0; i < sortedOrders.length; i++) {
    if (sortedOrders[i] !== i) {
      throw new Error(
        `Environment orders must be sequential starting from 0, found gap at ${i}`,
      );
    }
  }

  // Validate groups (required, must be object)
  if (
    !cfg.groups ||
    typeof cfg.groups !== 'object' ||
    Array.isArray(cfg.groups)
  ) {
    throw new Error('Config field "groups" must be an object');
  }

  const groupsObj = cfg.groups as Record<string, unknown>;

  for (const [groupName, groupValue] of Object.entries(groupsObj)) {
    if (
      !groupValue ||
      typeof groupValue !== 'object' ||
      Array.isArray(groupValue)
    ) {
      throw new Error(`Group "${groupName}" must be an object`);
    }

    const group = groupValue as Record<string, unknown>;

    if (!Array.isArray(group.projects)) {
      throw new Error(`Group "${groupName}" field "projects" must be an array`);
    }

    // Validate each project
    for (let i = 0; i < group.projects.length; i++) {
      const proj = group.projects[i];
      if (!proj || typeof proj !== 'object' || Array.isArray(proj)) {
        throw new Error(
          `Project at index ${i} in group "${groupName}" must be an object`,
        );
      }

      const projObj = proj as Record<string, unknown>;

      // Required fields
      const requiredFields = ['externalId', 'name', 'fullPath', 'branchMap'];
      for (const field of requiredFields) {
        if (!(field in projObj)) {
          throw new Error(
            `Project at index ${i} in group "${groupName}" missing required field "${field}"`,
          );
        }
      }

      // Type checks
      if (
        typeof projObj.externalId !== 'string' ||
        !projObj.externalId.trim()
      ) {
        throw new Error(
          `Project at index ${i} in group "${groupName}" field "externalId" must be a non-empty string`,
        );
      }

      if (typeof projObj.name !== 'string' || !projObj.name.trim()) {
        throw new Error(
          `Project at index ${i} in group "${groupName}" field "name" must be a non-empty string`,
        );
      }

      if (typeof projObj.fullPath !== 'string' || !projObj.fullPath.trim()) {
        throw new Error(
          `Project at index ${i} in group "${groupName}" field "fullPath" must be a non-empty string`,
        );
      }

      if (
        !projObj.branchMap ||
        typeof projObj.branchMap !== 'object' ||
        Array.isArray(projObj.branchMap)
      ) {
        throw new Error(
          `Project at index ${i} in group "${groupName}" field "branchMap" must be an object`,
        );
      }
    }
  }

  // If we got here, validation passed. Construct and return the typed config.
  return {
    gitlabUrl: (cfg.gitlabUrl as string) || 'https://gitlab.com',
    environments: cfg.environments as Environment[],
    groups: groupsObj as Record<string, Group>,
  };
}
