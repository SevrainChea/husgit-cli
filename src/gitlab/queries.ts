import { gql } from '@urql/core';

export const checkCurrentUser = gql`
  query {
    currentUser {
      name
    }
  }
`;

export const getProjects = gql`
  query getProjects($membership: Boolean, $after: String) {
    projects(membership: $membership, after: $after) {
      count
      pageInfo {
        endCursor
        hasNextPage
      }
      nodes {
        id
        nameWithNamespace
        fullPath
      }
    }
  }
`;

export const getProjectBranches = gql`
  query getProjectBranches($fullPath: ID!, $searchPattern: String!) {
    project(fullPath: $fullPath) {
      repository {
        branchNames(searchPattern: $searchPattern, offset: 0, limit: 20)
      }
    }
  }
`;

export const getProjectOpenedMergeRequestBySourceAndTarget = gql`
  query getProjectActiveMergeRequestBySourceAndTarget(
    $fullPath: ID!
    $sourceBranches: [String!]
    $targetBranches: [String!]
  ) {
    project(fullPath: $fullPath) {
      id
      mergeRequests(
        sourceBranches: $sourceBranches
        targetBranches: $targetBranches
        state: opened
      ) {
        count
        edges {
          node {
            id
            iid
            webUrl
            state
            diffStatsSummary {
              additions
              deletions
              fileCount
            }
            headPipeline {
              status
              jobs {
                nodes {
                  name
                  status
                  stage {
                    id
                    name
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

export const getMostRecentMergedMergeRequest = gql`
  query getMostRecentMergedMergeRequest(
    $fullPath: ID!
    $sourceBranches: [String!]
    $targetBranches: [String!]
  ) {
    project(fullPath: $fullPath) {
      mergeRequests(
        sourceBranches: $sourceBranches
        targetBranches: $targetBranches
        state: merged
        sort: MERGED_AT_DESC
        first: 1
      ) {
        edges {
          node {
            id
            iid
            webUrl
            state
            mergedAt
            mergeCommitSha
            diffStatsSummary {
              fileCount
            }
          }
        }
      }
    }
  }
`;

export const getProjectPipelineBySha = gql`
  query getProjectPipelineBySha($fullPath: ID!, $sha: String) {
    project(fullPath: $fullPath) {
      pipelines(sha: $sha) {
        nodes {
          status
          jobs {
            nodes {
              name
              status
              stage {
                id
                name
              }
            }
          }
        }
      }
    }
  }
`;

export const updateProjectMergeRequest = gql`
  mutation updateProjectMergeRequest(
    $fullPath: ID!
    $iid: String!
    $title: String
  ) {
    mergeRequestUpdate(
      input: { projectPath: $fullPath, iid: $iid, title: $title }
    ) {
      mergeRequest {
        id
      }
    }
  }
`;
