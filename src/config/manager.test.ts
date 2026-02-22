import { describe, it, expect, beforeEach } from 'vitest';
import type { HusgitConfig } from '../types.js';
import {
  hasEnvironments,
  getEnvironmentByName,
  getNextEnvironment,
  getPreviousEnvironment,
  setEnvironments,
  addGroup,
  removeGroup,
  addProject,
  removeProject,
  getProject,
  getAllProjects,
  addProjectToGroup,
  getGroupNames,
  getGroup,
  validateConfig,
} from './manager.js';

function makeConfig(overrides: Partial<HusgitConfig> = {}): HusgitConfig {
  return {
    gitlabUrl: 'https://gitlab.com',
    environments: [
      { name: 'develop', order: 0 },
      { name: 'staging', order: 1 },
      { name: 'production', order: 2 },
    ],
    groups: {},
    projects: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// hasEnvironments
// ---------------------------------------------------------------------------
describe('hasEnvironments', () => {
  it('returns false when environments array is empty', () => {
    const config = makeConfig({ environments: [] });
    expect(hasEnvironments(config)).toBe(false);
  });

  it('returns true when environments are present', () => {
    expect(hasEnvironments(makeConfig())).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getEnvironmentByName
// ---------------------------------------------------------------------------
describe('getEnvironmentByName', () => {
  it('returns the matching environment', () => {
    const env = getEnvironmentByName(makeConfig(), 'staging');
    expect(env).toEqual({ name: 'staging', order: 1 });
  });

  it('returns undefined for an unknown name', () => {
    expect(getEnvironmentByName(makeConfig(), 'unknown')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getNextEnvironment
// ---------------------------------------------------------------------------
describe('getNextEnvironment', () => {
  it('returns the environment with order + 1', () => {
    const next = getNextEnvironment(makeConfig(), 'develop');
    expect(next).toEqual({ name: 'staging', order: 1 });
  });

  it('returns undefined when source is the last environment', () => {
    expect(getNextEnvironment(makeConfig(), 'production')).toBeUndefined();
  });

  it('returns undefined when environment name does not exist', () => {
    expect(getNextEnvironment(makeConfig(), 'ghost')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getPreviousEnvironment
// ---------------------------------------------------------------------------
describe('getPreviousEnvironment', () => {
  it('returns the environment with order - 1', () => {
    const prev = getPreviousEnvironment(makeConfig(), 'staging');
    expect(prev).toEqual({ name: 'develop', order: 0 });
  });

  it('returns undefined when source is the first environment', () => {
    expect(getPreviousEnvironment(makeConfig(), 'develop')).toBeUndefined();
  });

  it('returns undefined when environment name does not exist', () => {
    expect(getPreviousEnvironment(makeConfig(), 'ghost')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// setEnvironments
// ---------------------------------------------------------------------------
describe('setEnvironments', () => {
  it('replaces the environments array on the config', () => {
    const config = makeConfig({ environments: [] });
    setEnvironments(config, [{ name: 'prod', order: 0 }]);
    expect(config.environments).toEqual([{ name: 'prod', order: 0 }]);
  });
});

// ---------------------------------------------------------------------------
// addGroup / removeGroup
// ---------------------------------------------------------------------------
describe('addGroup', () => {
  it('adds a new group with an empty projectPaths list', () => {
    const config = makeConfig();
    addGroup(config, 'backend');
    expect(config.groups['backend']).toEqual({ projectPaths: [] });
  });

  it('throws when adding a duplicate group name', () => {
    const config = makeConfig();
    addGroup(config, 'backend');
    expect(() => addGroup(config, 'backend')).toThrow(
      'Group "backend" already exists',
    );
  });
});

describe('removeGroup', () => {
  it('removes an existing group', () => {
    const config = makeConfig();
    addGroup(config, 'backend');
    removeGroup(config, 'backend');
    expect(config.groups['backend']).toBeUndefined();
  });

  it('throws when removing a non-existent group', () => {
    expect(() => removeGroup(makeConfig(), 'ghost')).toThrow(
      'Group "ghost" does not exist',
    );
  });
});

// ---------------------------------------------------------------------------
// addProject / removeProject / getProject / getAllProjects
// ---------------------------------------------------------------------------
describe('addProject', () => {
  it('stores the project under its fullPath key', () => {
    const config = makeConfig();
    addProject(config, {
      externalId: 'gid://gitlab/Project/1',
      name: 'My App',
      fullPath: 'org/my-app',
      branchMap: {},
    });
    expect(config.projects['org/my-app']).toBeDefined();
    expect(config.projects['org/my-app'].name).toBe('My App');
  });
});

describe('removeProject', () => {
  let config: HusgitConfig;

  beforeEach(() => {
    config = makeConfig();
    addProject(config, {
      externalId: 'gid://gitlab/Project/1',
      name: 'My App',
      fullPath: 'org/my-app',
      branchMap: {},
    });
    addGroup(config, 'backend');
    addProjectToGroup(config, 'backend', 'org/my-app');
  });

  it('removes the project from the projects registry', () => {
    removeProject(config, 'org/my-app');
    expect(config.projects['org/my-app']).toBeUndefined();
  });

  it('removes the project path from all groups', () => {
    removeProject(config, 'org/my-app');
    expect(config.groups['backend'].projectPaths).not.toContain('org/my-app');
  });

  it('is a no-op for a project that does not exist', () => {
    expect(() => removeProject(config, 'org/ghost')).not.toThrow();
  });
});

describe('getProject', () => {
  it('returns the project when it exists', () => {
    const config = makeConfig();
    addProject(config, {
      externalId: 'id1',
      name: 'App',
      fullPath: 'org/app',
      branchMap: {},
    });
    const p = getProject(config, 'org/app');
    expect(p?.name).toBe('App');
  });

  it('returns undefined for an unknown fullPath', () => {
    expect(getProject(makeConfig(), 'org/ghost')).toBeUndefined();
  });
});

describe('getAllProjects', () => {
  it('returns an empty array when no projects exist', () => {
    expect(getAllProjects(makeConfig())).toEqual([]);
  });

  it('returns all stored projects', () => {
    const config = makeConfig();
    addProject(config, {
      externalId: 'id1',
      name: 'App1',
      fullPath: 'org/app1',
      branchMap: {},
    });
    addProject(config, {
      externalId: 'id2',
      name: 'App2',
      fullPath: 'org/app2',
      branchMap: {},
    });
    expect(getAllProjects(config)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// addProjectToGroup
// ---------------------------------------------------------------------------
describe('addProjectToGroup', () => {
  it('adds a project path to an existing group', () => {
    const config = makeConfig();
    addGroup(config, 'backend');
    addProjectToGroup(config, 'backend', 'org/app');
    expect(config.groups['backend'].projectPaths).toContain('org/app');
  });

  it('throws when the group does not exist', () => {
    expect(() =>
      addProjectToGroup(makeConfig(), 'ghost', 'org/app'),
    ).toThrow('Group "ghost" does not exist');
  });

  it('throws when the project path is already in the group', () => {
    const config = makeConfig();
    addGroup(config, 'backend');
    addProjectToGroup(config, 'backend', 'org/app');
    expect(() => addProjectToGroup(config, 'backend', 'org/app')).toThrow(
      'already exists in group',
    );
  });
});

// ---------------------------------------------------------------------------
// getGroupNames / getGroup
// ---------------------------------------------------------------------------
describe('getGroupNames', () => {
  it('returns an empty array when no groups exist', () => {
    expect(getGroupNames(makeConfig())).toEqual([]);
  });

  it('returns all group names', () => {
    const config = makeConfig();
    addGroup(config, 'frontend');
    addGroup(config, 'backend');
    expect(getGroupNames(config)).toEqual(
      expect.arrayContaining(['frontend', 'backend']),
    );
  });
});

describe('getGroup', () => {
  it('returns the group when it exists', () => {
    const config = makeConfig();
    addGroup(config, 'infra');
    expect(getGroup(config, 'infra')).toEqual({ projectPaths: [] });
  });

  it('returns undefined for an unknown group name', () => {
    expect(getGroup(makeConfig(), 'ghost')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// validateConfig
// ---------------------------------------------------------------------------
describe('validateConfig', () => {
  const validRaw = {
    gitlabUrl: 'https://gitlab.com',
    environments: [
      { name: 'develop', order: 0 },
      { name: 'staging', order: 1 },
    ],
    groups: {
      backend: { projectPaths: ['org/app'] },
    },
    projects: {
      'org/app': {
        externalId: 'gid://gitlab/Project/1',
        name: 'App',
        fullPath: 'org/app',
        branchMap: { develop: 'dev', staging: 'main' },
      },
    },
  };

  it('accepts a valid config object', () => {
    expect(() => validateConfig(validRaw)).not.toThrow();
    const result = validateConfig(validRaw);
    expect(result.environments).toHaveLength(2);
  });

  it('throws when config is not an object', () => {
    expect(() => validateConfig(null)).toThrow('Config must be an object');
    expect(() => validateConfig('string')).toThrow('Config must be an object');
  });

  it('throws when environments is missing or not an array', () => {
    expect(() => validateConfig({ ...validRaw, environments: {} })).toThrow(
      '"environments" must be an array',
    );
  });

  it('throws when environments array is empty', () => {
    expect(() => validateConfig({ ...validRaw, environments: [] })).toThrow(
      'at least one environment',
    );
  });

  it('throws when an environment is missing its name', () => {
    expect(() =>
      validateConfig({
        ...validRaw,
        environments: [{ order: 0 }],
      }),
    ).toThrow('missing required field "name"');
  });

  it('throws when an environment is missing its order', () => {
    expect(() =>
      validateConfig({
        ...validRaw,
        environments: [{ name: 'develop' }],
      }),
    ).toThrow('missing required field "order"');
  });

  it('throws on duplicate environment names', () => {
    expect(() =>
      validateConfig({
        ...validRaw,
        environments: [
          { name: 'develop', order: 0 },
          { name: 'develop', order: 1 },
        ],
      }),
    ).toThrow('Duplicate environment name');
  });

  it('throws on duplicate environment orders', () => {
    expect(() =>
      validateConfig({
        ...validRaw,
        environments: [
          { name: 'develop', order: 0 },
          { name: 'staging', order: 0 },
        ],
      }),
    ).toThrow('Duplicate environment order');
  });

  it('throws when environment orders are not sequential from 0', () => {
    expect(() =>
      validateConfig({
        ...validRaw,
        environments: [
          { name: 'staging', order: 1 },
          { name: 'production', order: 2 },
        ],
      }),
    ).toThrow('sequential starting from 0');
  });

  it('throws when groups is not an object', () => {
    expect(() => validateConfig({ ...validRaw, groups: [] })).toThrow(
      '"groups" must be an object',
    );
  });

  it('throws when a project is missing a required field', () => {
    expect(() =>
      validateConfig({
        ...validRaw,
        projects: {
          'org/app': { name: 'App', fullPath: 'org/app', branchMap: {} },
        },
      }),
    ).toThrow('missing required field "externalId"');
  });

  it('throws when a project value is not an object', () => {
    expect(() =>
      validateConfig({
        ...validRaw,
        projects: { 'org/app': 'not-an-object' },
      }),
    ).toThrow('must be an object');
  });

  it('throws when a project externalId is an empty string', () => {
    expect(() =>
      validateConfig({
        ...validRaw,
        projects: {
          'org/app': {
            externalId: '',
            name: 'App',
            fullPath: 'org/app',
            branchMap: {},
          },
        },
      }),
    ).toThrow('field "externalId" must be a non-empty string');
  });

  it('throws when a project name is an empty string', () => {
    expect(() =>
      validateConfig({
        ...validRaw,
        projects: {
          'org/app': {
            externalId: 'gid://gitlab/Project/1',
            name: '   ',
            fullPath: 'org/app',
            branchMap: {},
          },
        },
      }),
    ).toThrow('field "name" must be a non-empty string');
  });

  it('throws when a project branchMap is not an object', () => {
    expect(() =>
      validateConfig({
        ...validRaw,
        projects: {
          'org/app': {
            externalId: 'gid://gitlab/Project/1',
            name: 'App',
            fullPath: 'org/app',
            branchMap: ['not', 'an', 'object'],
          },
        },
      }),
    ).toThrow('field "branchMap" must be an object');
  });

  it('throws when gitlabUrl is present but not a string', () => {
    expect(() =>
      validateConfig({ ...validRaw, gitlabUrl: 42 }),
    ).toThrow('"gitlabUrl" must be a string');
  });

  it('throws when an environment entry is not an object', () => {
    expect(() =>
      validateConfig({ ...validRaw, environments: ['not-an-object'] }),
    ).toThrow('must be an object');
  });

  it('throws when defaultBranch is present but not a string', () => {
    expect(() =>
      validateConfig({
        ...validRaw,
        environments: [{ name: 'develop', order: 0, defaultBranch: 99 }],
      }),
    ).toThrow('field "defaultBranch" must be a string');
  });

  it('throws when a group value is not an object', () => {
    expect(() =>
      validateConfig({ ...validRaw, groups: { backend: 'not-an-object' } }),
    ).toThrow('must be an object');
  });

  it('throws when a group is missing projectPaths array', () => {
    expect(() =>
      validateConfig({ ...validRaw, groups: { backend: { projectPaths: 'x' } } }),
    ).toThrow('"projectPaths" must be an array');
  });

  it('throws when a group projectPaths entry is not a string', () => {
    expect(() =>
      validateConfig({
        ...validRaw,
        groups: { backend: { projectPaths: [42] } },
      }),
    ).toThrow('must be a string');
  });

  it('throws when projects field is an array', () => {
    expect(() =>
      validateConfig({ ...validRaw, projects: [] }),
    ).toThrow('"projects" must be an object');
  });
});
