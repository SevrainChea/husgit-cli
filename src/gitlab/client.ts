import { Client, createClient, fetchExchange } from '@urql/core';
import axios, { type AxiosInstance } from 'axios';
import type { GitlabProject } from '../types.js';
import {
  checkCurrentUser,
  getProjects,
  getProjectBranches,
  getProjectOpenedMergeRequestBySourceAndTarget,
  updateProjectMergeRequest,
} from './queries.js';

export class GitlabClient {
  private gqlClient: Client;
  private axiosClient: AxiosInstance;
  private gitlabUrl: string;

  constructor(gitlabToken: string, gitlabUrl: string = 'https://gitlab.com') {
    this.gitlabUrl = gitlabUrl;

    this.gqlClient = createClient({
      url: `${gitlabUrl}/api/graphql`,
      fetchOptions: {
        headers: {
          authorization: `Bearer ${gitlabToken}`,
        },
      },
      exchanges: [fetchExchange],
    });

    this.axiosClient = axios.create({
      baseURL: `${gitlabUrl}/api/v4/`,
      headers: {
        Authorization: `Bearer ${gitlabToken}`,
      },
    });
  }

  async checkCurrentUser(): Promise<string> {
    const { data, error } = await this.gqlClient
      .query(checkCurrentUser, {})
      .toPromise();

    if (error) throw new Error(`GitLab auth failed: ${error.message}`);
    return data?.currentUser?.name || '';
  }

  async getUserProjects(): Promise<GitlabProject[]> {
    const allProjects: GitlabProject[] = [];
    let after: string | null = null;

    while (true) {
      const { data, error } = await this.gqlClient
        .query(getProjects, { membership: true, after })
        .toPromise();

      if (error) throw new Error(`Failed to fetch projects: ${error.message}`);

      const nodes = data?.projects?.nodes || [];
      for (const project of nodes) {
        allProjects.push({
          externalId: project.id.split('/').at(-1)!,
          name: project.nameWithNamespace,
          fullPath: project.fullPath,
        });
      }

      const pageInfo = data?.projects?.pageInfo;
      if (!pageInfo?.hasNextPage) break;
      after = pageInfo.endCursor;
    }

    return allProjects;
  }

  async getProjectById(
    projectId: string,
  ): Promise<GitlabProject> {
    const { data } = await this.axiosClient.get(`/projects/${projectId}`);
    return {
      externalId: String(data.id),
      name: data.name_with_namespace,
      fullPath: data.path_with_namespace,
    };
  }

  async getProjectBranches(
    fullPath: string,
    searchPattern: string = '',
  ): Promise<string[]> {
    const { data } = await this.gqlClient
      .query(getProjectBranches, {
        fullPath,
        searchPattern: `${searchPattern}*`,
      })
      .toPromise();

    return data?.project?.repository?.branchNames || [];
  }

  async createMergeRequest(
    projectExternalId: string,
    title: string,
    sourceBranch: string,
    targetBranch: string,
    description?: string,
  ): Promise<{ mrId: string; mrUrl: string }> {
    try {
      const { data } = await this.axiosClient.post(
        `/projects/${projectExternalId}/merge_requests`,
        {
          title,
          description,
          source_branch: sourceBranch,
          target_branch: targetBranch,
        },
      );
      return {
        mrId: String(data.iid),
        mrUrl: data.web_url,
      };
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        throw new Error('MR_ALREADY_EXISTS');
      }
      throw error;
    }
  }

  async updateMergeRequest(
    sourceBranch: string,
    targetBranch: string,
    projectFullPath: string,
    title: string,
    description?: string,
  ): Promise<{ mrId: string; mrUrl: string }> {
    const { data } = await this.gqlClient
      .query(getProjectOpenedMergeRequestBySourceAndTarget, {
        fullPath: projectFullPath,
        sourceBranches: [sourceBranch],
        targetBranches: [targetBranch],
      })
      .toPromise();

    const edges = data?.project?.mergeRequests?.edges;
    if (!edges?.length || !edges[0]?.node) {
      throw new Error('NO_MR_FOUND');
    }

    const { id, iid, webUrl } = edges[0].node;
    const externalMrId = id.includes('MergeRequest/')
      ? id.split('MergeRequest/')[1]
      : id;

    const mutRes = await this.gqlClient
      .mutation(updateProjectMergeRequest, {
        fullPath: projectFullPath,
        iid,
        title,
      })
      .toPromise();

    if (mutRes.error) {
      throw new Error(`Failed to update MR: ${mutRes.error.message}`);
    }

    return {
      mrId: externalMrId,
      mrUrl: webUrl || `${this.gitlabUrl}/${projectFullPath}/-/merge_requests/${iid}`,
    };
  }

  async getOpenMergeRequests(
    projectFullPath: string,
    sourceBranch: string,
    targetBranch: string,
  ): Promise<
    { id: string; iid: string; webUrl: string; state: string }[]
  > {
    const { data } = await this.gqlClient
      .query(getProjectOpenedMergeRequestBySourceAndTarget, {
        fullPath: projectFullPath,
        sourceBranches: [sourceBranch],
        targetBranches: [targetBranch],
      })
      .toPromise();

    const edges = data?.project?.mergeRequests?.edges || [];
    return edges
      .filter((e: { node: unknown }) => e.node)
      .map((e: { node: { id: string; iid: string; webUrl: string; state: string } }) => e.node);
  }
}

export function createGitlabClient(): GitlabClient {
  const token = process.env.GITLAB_TOKEN;
  if (!token) {
    throw new Error(
      'GITLAB_TOKEN environment variable is required. Set it with:\n  export GITLAB_TOKEN=your-token',
    );
  }
  const url = process.env.GITLAB_URL || 'https://gitlab.com';
  return new GitlabClient(token, url);
}
