import type {
  HusgitConfig,
  ProjectConfig,
  BranchPair,
  MergeRequestResult,
} from '../types.js';
import {
  getEnvironmentByName,
  getNextEnvironment,
  getPreviousEnvironment,
} from '../config/manager.js';
import { GitlabClient } from '../gitlab/client.js';

export function resolveBranchPairs(
  config: HusgitConfig,
  sourceEnvName: string,
  direction: 'release' | 'backport',
  projects: ProjectConfig[],
): BranchPair[] {
  const sourceEnv = getEnvironmentByName(config, sourceEnvName);
  if (!sourceEnv) {
    throw new Error(`Environment "${sourceEnvName}" not found`);
  }

  const targetEnv =
    direction === 'release'
      ? getNextEnvironment(config, sourceEnvName)
      : getPreviousEnvironment(config, sourceEnvName);

  if (!targetEnv) {
    const dir = direction === 'release' ? 'next' : 'previous';
    throw new Error(
      `No ${dir} environment after "${sourceEnvName}". Cannot ${direction}.`,
    );
  }

  const pairs: BranchPair[] = [];

  for (const project of projects) {
    const sourceBranch = project.branchMap[sourceEnvName];
    const targetBranch = project.branchMap[targetEnv.name];

    if (!sourceBranch || !targetBranch) {
      throw new Error(
        `Project "${project.name}" is missing branch mapping for "${sourceEnvName}" or "${targetEnv.name}"`,
      );
    }

    pairs.push({ project, sourceBranch, targetBranch });
  }

  return pairs;
}

export async function executeMergeRequests(
  client: GitlabClient,
  pairs: BranchPair[],
  title: string,
  description?: string,
): Promise<MergeRequestResult[]> {
  const results: MergeRequestResult[] = [];

  for (const pair of pairs) {
    try {
      const { mrUrl } = await client.createMergeRequest(
        pair.project.externalId,
        title,
        pair.sourceBranch,
        pair.targetBranch,
        description,
      );
      results.push({
        project: pair.project,
        sourceBranch: pair.sourceBranch,
        targetBranch: pair.targetBranch,
        status: 'created',
        mrUrl,
      });
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'MR_ALREADY_EXISTS') {
        try {
          const { mrUrl } = await client.updateMergeRequest(
            pair.sourceBranch,
            pair.targetBranch,
            pair.project.fullPath,
            title,
            description,
          );
          results.push({
            project: pair.project,
            sourceBranch: pair.sourceBranch,
            targetBranch: pair.targetBranch,
            status: 'updated',
            mrUrl,
          });
        } catch (updateError: unknown) {
          results.push({
            project: pair.project,
            sourceBranch: pair.sourceBranch,
            targetBranch: pair.targetBranch,
            status: 'failed',
            error:
              updateError instanceof Error
                ? updateError.message
                : 'Failed to update existing MR',
          });
        }
      } else {
        results.push({
          project: pair.project,
          sourceBranch: pair.sourceBranch,
          targetBranch: pair.targetBranch,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  return results;
}
