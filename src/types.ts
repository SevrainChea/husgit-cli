export interface Environment {
  name: string;
  order: number;
}

export interface ProjectConfig {
  externalId: string;
  name: string;
  fullPath: string;
  branchMap: Record<string, string>;
}

export interface Group {
  projects: ProjectConfig[];
}

export interface HusgitConfig {
  gitlabUrl: string;
  environments: Environment[];
  groups: Record<string, Group>;
}

export interface GitlabProject {
  externalId: string;
  name: string;
  fullPath: string;
}

export interface MergeRequestResult {
  project: ProjectConfig;
  sourceBranch: string;
  targetBranch: string;
  status: 'created' | 'updated' | 'failed';
  mrUrl?: string;
  error?: string;
}

export interface BranchPair {
  project: ProjectConfig;
  sourceBranch: string;
  targetBranch: string;
}

export interface OpenMergeRequest {
  project: ProjectConfig;
  group: string;
  sourceEnv: string;
  targetEnv: string;
  sourceBranch: string;
  targetBranch: string;
  mrId?: string;
  mrUrl?: string;
  state?: string;
}
