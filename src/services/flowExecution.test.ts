import { describe, it, expect, vi } from 'vitest';
import { resolveBranchPairs, executeMergeRequests } from './flowExecution.js';
import type { HusgitConfig, ProjectConfig, BranchPair } from '../types.js';
import type { GitlabClient } from '../gitlab/client.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const baseConfig: HusgitConfig = {
  gitlabUrl: 'https://gitlab.com',
  environments: [
    { name: 'develop', order: 0 },
    { name: 'staging', order: 1 },
    { name: 'production', order: 2 },
  ],
  groups: {},
  projects: {},
};

function makeProject(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    externalId: 'gid://gitlab/Project/1',
    name: 'My App',
    fullPath: 'org/my-app',
    branchMap: { develop: 'dev', staging: 'main', production: 'prod' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// resolveBranchPairs — happy path
// ---------------------------------------------------------------------------

describe('resolveBranchPairs', () => {
  describe('happy path', () => {
    it('maps sourceBranch and targetBranch from project branchMap for release', () => {
      const project = makeProject({
        branchMap: { develop: 'feature/dev', staging: 'feature/staging' },
      });
      const [pair] = resolveBranchPairs(baseConfig, 'develop', 'release', [
        project,
      ]);
      expect(pair.sourceBranch).toBe('feature/dev');
      expect(pair.targetBranch).toBe('feature/staging');
    });

    it('maps sourceBranch and targetBranch from project branchMap for backport', () => {
      const project = makeProject();
      const [pair] = resolveBranchPairs(baseConfig, 'staging', 'backport', [
        project,
      ]);
      expect(pair.sourceBranch).toBe('main');
      expect(pair.targetBranch).toBe('dev');
    });

    it('returns all projects when all have the required branch mappings', () => {
      const projects: ProjectConfig[] = [
        makeProject({ fullPath: 'org/a', name: 'A' }),
        makeProject({ fullPath: 'org/b', name: 'B' }),
      ];
      const pairs = resolveBranchPairs(
        baseConfig,
        'develop',
        'release',
        projects,
      );
      expect(pairs).toHaveLength(2);
    });

    it('returns empty array when all projects lack the required mapping', () => {
      const project = makeProject({ branchMap: { production: 'prod' } });
      const pairs = resolveBranchPairs(baseConfig, 'develop', 'release', [
        project,
      ]);
      expect(pairs).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Skipping projects with missing mappings
  // -------------------------------------------------------------------------

  describe('skipping projects with missing branch mappings', () => {
    it('skips projects missing the source environment branch', () => {
      const projects: ProjectConfig[] = [
        makeProject({
          name: 'No Dev',
          fullPath: 'org/no-dev',
          branchMap: { staging: 'main', production: 'prod' },
        }),
        makeProject({ name: 'Full', fullPath: 'org/full' }),
      ];
      const pairs = resolveBranchPairs(
        baseConfig,
        'develop',
        'release',
        projects,
      );
      expect(pairs).toHaveLength(1);
      expect(pairs[0].project.name).toBe('Full');
    });

    it('skips projects missing the target environment branch', () => {
      const projects: ProjectConfig[] = [
        makeProject({
          name: 'No Staging',
          fullPath: 'org/no-staging',
          branchMap: { develop: 'dev', production: 'prod' },
        }),
        makeProject({ name: 'Full', fullPath: 'org/full' }),
      ];
      const pairs = resolveBranchPairs(
        baseConfig,
        'develop',
        'release',
        projects,
      );
      expect(pairs).toHaveLength(1);
      expect(pairs[0].project.name).toBe('Full');
    });

    it('skips projects missing source branch on backport', () => {
      const project = makeProject({
        branchMap: { develop: 'dev', production: 'prod' },
      });
      const pairs = resolveBranchPairs(baseConfig, 'staging', 'backport', [
        project,
      ]);
      expect(pairs).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Error cases
  // -------------------------------------------------------------------------

  describe('error cases', () => {
    it('throws when source environment does not exist', () => {
      expect(() =>
        resolveBranchPairs(baseConfig, 'unknown', 'release', []),
      ).toThrow('Environment "unknown" not found');
    });

    it('throws when releasing from the last environment (no next)', () => {
      expect(() =>
        resolveBranchPairs(baseConfig, 'production', 'release', []),
      ).toThrow('Cannot release');
    });

    it('throws when backporting from the first environment (no previous)', () => {
      expect(() =>
        resolveBranchPairs(baseConfig, 'develop', 'backport', []),
      ).toThrow('Cannot backport');
    });
  });
});

// ---------------------------------------------------------------------------
// executeMergeRequests
// ---------------------------------------------------------------------------

function makePair(overrides: Partial<BranchPair> = {}): BranchPair {
  return {
    project: makeProject(),
    sourceBranch: 'dev',
    targetBranch: 'main',
    ...overrides,
  };
}

function makeMockClient(
  overrides: {
    createMergeRequest?: ReturnType<typeof vi.fn>;
    updateMergeRequest?: ReturnType<typeof vi.fn>;
  } = {},
): GitlabClient {
  return {
    createMergeRequest:
      overrides.createMergeRequest ??
      vi.fn().mockResolvedValue({ mrUrl: 'https://gitlab.com/mr/1' }),
    updateMergeRequest:
      overrides.updateMergeRequest ??
      vi.fn().mockResolvedValue({ mrUrl: 'https://gitlab.com/mr/1' }),
  } as unknown as GitlabClient;
}

describe('executeMergeRequests', () => {
  it('returns status "created" when MR creation succeeds', async () => {
    const client = makeMockClient();
    const results = await executeMergeRequests(
      client,
      [makePair()],
      'My MR title',
    );
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('created');
    expect(results[0].mrUrl).toBe('https://gitlab.com/mr/1');
  });

  it('returns status "updated" when MR already exists and update succeeds', async () => {
    const client = makeMockClient({
      createMergeRequest: vi
        .fn()
        .mockRejectedValue(new Error('MR_ALREADY_EXISTS')),
      updateMergeRequest: vi
        .fn()
        .mockResolvedValue({ mrUrl: 'https://gitlab.com/mr/1' }),
    });
    const results = await executeMergeRequests(
      client,
      [makePair()],
      'My MR title',
    );
    expect(results[0].status).toBe('updated');
    expect(results[0].mrUrl).toBe('https://gitlab.com/mr/1');
  });

  it('returns status "failed" when MR already exists but update also fails', async () => {
    const client = makeMockClient({
      createMergeRequest: vi
        .fn()
        .mockRejectedValue(new Error('MR_ALREADY_EXISTS')),
      updateMergeRequest: vi.fn().mockRejectedValue(new Error('Update failed')),
    });
    const results = await executeMergeRequests(
      client,
      [makePair()],
      'My MR title',
    );
    expect(results[0].status).toBe('failed');
    expect(results[0].error).toBe('Update failed');
  });

  it('returns status "failed" when create throws an unexpected error', async () => {
    const client = makeMockClient({
      createMergeRequest: vi.fn().mockRejectedValue(new Error('Network error')),
    });
    const results = await executeMergeRequests(
      client,
      [makePair()],
      'My MR title',
    );
    expect(results[0].status).toBe('failed');
    expect(results[0].error).toBe('Network error');
  });

  it('processes multiple pairs independently', async () => {
    const pair1 = makePair({
      project: makeProject({ name: 'App 1', fullPath: 'org/app1' }),
    });
    const pair2 = makePair({
      project: makeProject({ name: 'App 2', fullPath: 'org/app2' }),
      sourceBranch: 'main',
      targetBranch: 'prod',
    });
    const client = makeMockClient({
      createMergeRequest: vi
        .fn()
        .mockResolvedValueOnce({ mrUrl: 'https://gitlab.com/mr/1' })
        .mockRejectedValueOnce(new Error('MR_ALREADY_EXISTS')),
      updateMergeRequest: vi
        .fn()
        .mockResolvedValue({ mrUrl: 'https://gitlab.com/mr/2' }),
    });

    const results = await executeMergeRequests(
      client,
      [pair1, pair2],
      'Release',
    );

    expect(results).toHaveLength(2);
    expect(results[0].status).toBe('created');
    expect(results[1].status).toBe('updated');
  });

  it('passes description to createMergeRequest when provided', async () => {
    const createMR = vi
      .fn()
      .mockResolvedValue({ mrUrl: 'https://gitlab.com/mr/1' });
    const client = makeMockClient({ createMergeRequest: createMR });
    await executeMergeRequests(client, [makePair()], 'Title', 'My description');
    expect(createMR).toHaveBeenCalledWith(
      expect.any(String),
      'Title',
      'dev',
      'main',
      'My description',
    );
  });
});
