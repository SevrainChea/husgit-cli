import { describe, it, expect } from 'vitest';
import { resolveBranchPairs } from './flowExecution.js';
import type { HusgitConfig, ProjectConfig } from '../types.js';

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

describe('resolveBranchPairs', () => {
  it('skips projects missing the source environment branch mapping', () => {
    const projects: ProjectConfig[] = [
      {
        externalId: 'proj1',
        name: 'Project 1',
        fullPath: 'group/project1',
        branchMap: { staging: 'main', production: 'prod' }, // no develop
      },
      {
        externalId: 'proj2',
        name: 'Project 2',
        fullPath: 'group/project2',
        branchMap: { develop: 'dev', staging: 'main', production: 'prod' },
      },
    ];

    const pairs = resolveBranchPairs(baseConfig, 'develop', 'release', projects);

    expect(pairs).toHaveLength(1);
    expect(pairs[0].project.name).toBe('Project 2');
  });

  it('skips projects missing the target environment branch mapping', () => {
    const projects: ProjectConfig[] = [
      {
        externalId: 'proj1',
        name: 'Project 1',
        fullPath: 'group/project1',
        branchMap: { develop: 'dev', production: 'prod' }, // no staging
      },
      {
        externalId: 'proj2',
        name: 'Project 2',
        fullPath: 'group/project2',
        branchMap: { develop: 'dev', staging: 'main', production: 'prod' },
      },
    ];

    const pairs = resolveBranchPairs(baseConfig, 'develop', 'release', projects);

    expect(pairs).toHaveLength(1);
    expect(pairs[0].project.name).toBe('Project 2');
  });

  it('skips projects missing source branch on backport', () => {
    const projects = [
      {
        externalId: 'proj1',
        name: 'Project 1',
        fullPath: 'group/project1',
        branchMap: { develop: 'dev', production: 'prod' }, // no staging
      },
    ];

    // backport from staging -> develop, project1 has no staging
    const pairs = resolveBranchPairs(baseConfig, 'staging', 'backport', projects);

    expect(pairs).toHaveLength(0);
  });

  it('returns all projects when all have the required branch mappings', () => {
    const projects = [
      {
        externalId: 'proj1',
        name: 'Project 1',
        fullPath: 'group/project1',
        branchMap: { develop: 'dev', staging: 'main' },
      },
      {
        externalId: 'proj2',
        name: 'Project 2',
        fullPath: 'group/project2',
        branchMap: { develop: 'develop', staging: 'staging' },
      },
    ];

    const pairs = resolveBranchPairs(baseConfig, 'develop', 'release', projects);

    expect(pairs).toHaveLength(2);
  });
});
