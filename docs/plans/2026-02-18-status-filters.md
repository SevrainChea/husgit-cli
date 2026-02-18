# Status Filters Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `--type`, `--source-env`, and `--group` filtering to `husgit status`.

**Architecture:** All changes in `src/commands/status.ts` plus a `direction` field added to `OpenMergeRequest` in `src/types.ts`. A local `buildEnvPairs()` helper replaces the current hard-coded loop, returning the set of (sourceEnv, targetEnv, direction) pairs to query.

**Tech Stack:** TypeScript ESM, Commander, chalk, cli-table3 (all already in use)

---

### Task 1: Add `direction` field to `OpenMergeRequest` in `src/types.ts`

**Files:**
- Modify: `src/types.ts`

**Step 1: Add the field**

Find:
```typescript
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
```

Replace with:
```typescript
export interface OpenMergeRequest {
  project: ProjectConfig;
  group: string;
  sourceEnv: string;
  targetEnv: string;
  sourceBranch: string;
  targetBranch: string;
  direction: 'release' | 'backport';
  mrId?: string;
  mrUrl?: string;
  state?: string;
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm typecheck`
Expected: errors only in pre-existing files (client.ts lines 52/67), none new

---

### Task 2: Rewrite `src/commands/status.ts` with filter options

**Files:**
- Modify: `src/commands/status.ts`

**Step 1: Replace the entire file**

```typescript
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import {
  loadConfig,
  getGroupNames,
  hasEnvironments,
  getEnvironmentByName,
} from '../config/manager.js';
import { createGitlabClient } from '../gitlab/client.js';
import type { OpenMergeRequest } from '../types.js';
import type { Environment } from '../types.js';

type Direction = 'release' | 'backport';

interface EnvPair {
  sourceEnv: Environment;
  targetEnv: Environment;
  direction: Direction;
}

function buildEnvPairs(
  environments: Environment[],
  type: string | undefined,
  sourceEnvName: string | undefined,
): EnvPair[] {
  const pairs: EnvPair[] = [];

  if (!type || type === 'release') {
    for (let i = 0; i < environments.length - 1; i++) {
      pairs.push({
        sourceEnv: environments[i],
        targetEnv: environments[i + 1],
        direction: 'release',
      });
    }
  }

  if (!type || type === 'backport') {
    for (let i = environments.length - 1; i > 0; i--) {
      pairs.push({
        sourceEnv: environments[i],
        targetEnv: environments[i - 1],
        direction: 'backport',
      });
    }
  }

  if (sourceEnvName) {
    return pairs.filter((p) => p.sourceEnv.name === sourceEnvName);
  }

  return pairs;
}

export function statusCommand(): Command {
  return new Command('status')
    .description('Show open MRs between adjacent environments')
    .option('--group <name>', 'Show only a specific group')
    .option('--type <type>', 'Filter by direction: release or backport')
    .option('--source-env <name>', 'Filter by source environment name')
    .action(runStatus);
}

async function runStatus(options: {
  group?: string;
  type?: string;
  sourceEnv?: string;
}): Promise<void> {
  const config = loadConfig();

  if (!hasEnvironments(config)) {
    console.log(
      chalk.red('No environments configured. Run "husgit setup flow" first.'),
    );
    return;
  }

  if (options.type && options.type !== 'release' && options.type !== 'backport') {
    console.log(chalk.red('--type must be "release" or "backport"'));
    return;
  }

  if (options.sourceEnv && !getEnvironmentByName(config, options.sourceEnv)) {
    console.log(
      chalk.red(`Environment "${options.sourceEnv}" not found in config.`),
    );
    return;
  }

  const groupNames = options.group ? [options.group] : getGroupNames(config);

  if (groupNames.length === 0) {
    console.log(chalk.yellow('No groups configured.'));
    return;
  }

  const envPairs = buildEnvPairs(
    config.environments,
    options.type,
    options.sourceEnv,
  );

  if (envPairs.length === 0) {
    console.log(chalk.yellow('No environment pairs match the given filters.'));
    return;
  }

  const client = createGitlabClient();
  const spinner = ora('Querying GitLab for open MRs...').start();

  const openMRs: OpenMergeRequest[] = [];

  for (const groupName of groupNames) {
    const group = config.groups[groupName];
    if (!group) {
      spinner.warn(`Group "${groupName}" not found`);
      continue;
    }

    for (const project of group.projects) {
      for (const pair of envPairs) {
        const sourceBranch = project.branchMap[pair.sourceEnv.name];
        const targetBranch = project.branchMap[pair.targetEnv.name];

        if (!sourceBranch || !targetBranch) continue;

        try {
          const mrs = await client.getOpenMergeRequests(
            project.fullPath,
            sourceBranch,
            targetBranch,
          );

          for (const mr of mrs) {
            openMRs.push({
              project,
              group: groupName,
              sourceEnv: pair.sourceEnv.name,
              targetEnv: pair.targetEnv.name,
              sourceBranch,
              targetBranch,
              direction: pair.direction,
              mrId: mr.iid,
              mrUrl: mr.webUrl,
              state: mr.state,
            });
          }
        } catch {
          // Skip projects that fail to query
        }
      }
    }
  }

  spinner.stop();

  if (openMRs.length === 0) {
    console.log(chalk.green('\nNo open merge requests matching the filters.'));
    return;
  }

  const table = new Table({
    head: ['Group', 'Project', 'Type', 'Direction', 'State', 'URL'],
    style: { head: ['cyan'] },
  });

  for (const mr of openMRs) {
    table.push([
      mr.group,
      mr.project.name,
      mr.direction,
      `${mr.sourceEnv} → ${mr.targetEnv}`,
      mr.state || '-',
      mr.mrUrl || '-',
    ]);
  }

  console.log(`\n${chalk.cyan(`${openMRs.length} open MR(s):`)}`);
  console.log(table.toString());
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm typecheck`
Expected: no new errors (pre-existing client.ts errors are acceptable)

---

### Task 3: Build, smoke-test, and commit

**Step 1: Build**

Run: `pnpm build`
Expected: `ESM ⚡️ Build success`

**Step 2: Verify --help**

Run: `./dist/index.js status --help`
Expected: shows `--type`, `--source-env`, `--group` options

**Step 3: Commit**

```bash
git add src/types.ts src/commands/status.ts
git commit -m "feat: add --type, --source-env, --group filters to status command"
```
