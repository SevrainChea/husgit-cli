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
    projects: {},
  };
}

function migrateOldFormat(raw: Record<string, unknown>): HusgitConfig {
  const oldGroups = raw.groups as Record<string, { projects: ProjectConfig[] }>;
  const projects: Record<string, ProjectConfig> = {};
  const newGroups: Record<string, { projectPaths: string[] }> = {};

  for (const [groupName, group] of Object.entries(oldGroups)) {
    newGroups[groupName] = { projectPaths: [] };
    for (const project of group.projects) {
      projects[project.fullPath] = project;
      newGroups[groupName].projectPaths.push(project.fullPath);
    }
  }

  return {
    gitlabUrl: (raw.gitlabUrl as string) || 'https://gitlab.com',
    environments: (raw.environments as Environment[]) || [],
    groups: newGroups,
    projects,
  };
}

export function loadConfig(): HusgitConfig {
  if (!existsSync(CONFIG_PATH)) {
    return defaultConfig();
  }
  const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) as Record<
    string,
    unknown
  >;

  // Detect old format: any group has a `projects` array of objects (not strings)
  const groups = raw.groups as Record<string, Record<string, unknown>>;
  if (groups && typeof groups === 'object') {
    const firstGroup = Object.values(groups)[0];
    if (
      firstGroup &&
      Array.isArray(firstGroup.projects) &&
      firstGroup.projects.length > 0 &&
      typeof firstGroup.projects[0] === 'object'
    ) {
      const migrated = migrateOldFormat(raw);
      saveConfig(migrated);
      return migrated;
    }
  }

  // Ensure projects field exists (new configs may not have it yet)
  if (!raw.projects) {
    raw.projects = {};
  }

  return raw as unknown as HusgitConfig;
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
  config.groups[name] = { projectPaths: [] };
}

export function removeGroup(config: HusgitConfig, name: string): void {
  if (!config.groups[name]) {
    throw new Error(`Group "${name}" does not exist`);
  }
  delete config.groups[name];
}

export function addProject(config: HusgitConfig, project: ProjectConfig): void {
  config.projects[project.fullPath] = project;
}

export function removeProject(config: HusgitConfig, fullPath: string): void {
  delete config.projects[fullPath];
  for (const group of Object.values(config.groups)) {
    group.projectPaths = group.projectPaths.filter((p) => p !== fullPath);
  }
}

export function getProject(
  config: HusgitConfig,
  fullPath: string,
): ProjectConfig | undefined {
  return config.projects[fullPath];
}

export function getAllProjects(config: HusgitConfig): ProjectConfig[] {
  return Object.values(config.projects);
}

export function addProjectToGroup(
  config: HusgitConfig,
  groupName: string,
  fullPath: string,
): void {
  const group = config.groups[groupName];
  if (!group) {
    throw new Error(`Group "${groupName}" does not exist`);
  }
  if (group.projectPaths.includes(fullPath)) {
    throw new Error(
      `Project "${fullPath}" already exists in group "${groupName}"`,
    );
  }
  group.projectPaths.push(fullPath);
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
  if (!config || typeof config !== 'object') {
    throw new Error('Config must be an object');
  }

  const cfg = config as Record<string, unknown>;

  if (cfg.gitlabUrl !== undefined && typeof cfg.gitlabUrl !== 'string') {
    throw new Error('Config field "gitlabUrl" must be a string');
  }

  if (!Array.isArray(cfg.environments)) {
    throw new Error('Config field "environments" must be an array');
  }

  if (cfg.environments.length === 0) {
    throw new Error('Config must have at least one environment');
  }

  const envOrders = new Set<number>();
  const envNames = new Set<string>();

  for (let i = 0; i < cfg.environments.length; i++) {
    const env = cfg.environments[i];
    if (!env || typeof env !== 'object') {
      throw new Error(`Environment at index ${i} must be an object`);
    }

    const envObj = env as Record<string, unknown>;

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
    if (
      envObj.defaultBranch !== undefined &&
      typeof envObj.defaultBranch !== 'string'
    ) {
      throw new Error(
        `Environment "${envObj.name}" field "defaultBranch" must be a string`,
      );
    }

    if (envNames.has(envObj.name)) {
      throw new Error(`Duplicate environment name: "${envObj.name}"`);
    }
    envNames.add(envObj.name);

    if (envOrders.has(envObj.order)) {
      throw new Error(`Duplicate environment order: ${envObj.order}`);
    }
    envOrders.add(envObj.order);
  }

  const sortedOrders = Array.from(envOrders).sort((a, b) => a - b);
  for (let i = 0; i < sortedOrders.length; i++) {
    if (sortedOrders[i] !== i) {
      throw new Error(
        `Environment orders must be sequential starting from 0, found gap at ${i}`,
      );
    }
  }

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

    if (!Array.isArray(group.projectPaths)) {
      throw new Error(
        `Group "${groupName}" field "projectPaths" must be an array`,
      );
    }

    for (let i = 0; i < group.projectPaths.length; i++) {
      if (typeof group.projectPaths[i] !== 'string') {
        throw new Error(
          `Group "${groupName}" projectPaths[${i}] must be a string`,
        );
      }
    }
  }

  // Validate projects registry
  const projectsRaw = cfg.projects ?? {};
  if (typeof projectsRaw !== 'object' || Array.isArray(projectsRaw)) {
    throw new Error('Config field "projects" must be an object');
  }

  const projectsObj = projectsRaw as Record<string, unknown>;

  for (const [fullPath, projValue] of Object.entries(projectsObj)) {
    if (
      !projValue ||
      typeof projValue !== 'object' ||
      Array.isArray(projValue)
    ) {
      throw new Error(`Project "${fullPath}" must be an object`);
    }

    const projObj = projValue as Record<string, unknown>;
    const requiredFields = ['externalId', 'name', 'fullPath', 'branchMap'];
    for (const field of requiredFields) {
      if (!(field in projObj)) {
        throw new Error(
          `Project "${fullPath}" missing required field "${field}"`,
        );
      }
    }

    if (typeof projObj.externalId !== 'string' || !projObj.externalId.trim()) {
      throw new Error(
        `Project "${fullPath}" field "externalId" must be a non-empty string`,
      );
    }

    if (typeof projObj.name !== 'string' || !projObj.name.trim()) {
      throw new Error(
        `Project "${fullPath}" field "name" must be a non-empty string`,
      );
    }

    if (
      !projObj.branchMap ||
      typeof projObj.branchMap !== 'object' ||
      Array.isArray(projObj.branchMap)
    ) {
      throw new Error(
        `Project "${fullPath}" field "branchMap" must be an object`,
      );
    }
  }

  return {
    gitlabUrl: (cfg.gitlabUrl as string) || 'https://gitlab.com',
    environments: cfg.environments as Environment[],
    groups: groupsObj as Record<string, Group>,
    projects: projectsObj as Record<string, ProjectConfig>,
  };
}
