export interface Environment {
  name: string;
  order: number;
  defaultBranch?: string;
}

export interface ProjectConfig {
  externalId: string;
  name: string;
  fullPath: string;
  branchMap: Record<string, string>;
}

export interface Group {
  projectPaths: string[];
}

export interface HusgitConfig {
  gitlabUrl: string;
  environments: Environment[];
  groups: Record<string, Group>;
  projects: Record<string, ProjectConfig>;
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

export type Direction = 'release' | 'backport';

export interface PipelineJob {
  name: string;
  status: string;
  stageName: string;
}

export interface MRPipeline {
  status: string;
  jobs: PipelineJob[];
}

export interface OpenMergeRequest {
  project: ProjectConfig;
  groups: string[];
  sourceEnv: string;
  targetEnv: string;
  sourceBranch: string;
  targetBranch: string;
  direction: Direction;
  mrId?: string;
  mrUrl?: string;
  state?: string;
  hasChanges?: boolean;
  mergedAt?: string;
  pipeline?: MRPipeline | null;
}
