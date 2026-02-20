# Multi-Project Add Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow adding multiple GitLab projects at once, with environment default branches pre-filling the branch search prompt.

**Architecture:** Add `defaultBranch?` to the `Environment` type (backward-compatible), update the setup flow to capture it, then rewrite `addProject.ts` to use checkbox multi-select and loop per-project branch/group assignment before a single bulk save.

**Tech Stack:** TypeScript (strict ESM), Commander, `@inquirer/prompts` (checkbox, search), chalk, ora

---

### Task 1: Add `defaultBranch` to the `Environment` type

**Files:**
- Modify: `src/types.ts`

**Step 1: Add the optional field**

In `src/types.ts`, update the `Environment` interface:

```ts
export interface Environment {
  name: string;
  order: number;
  defaultBranch?: string;
}
```

**Step 2: Verify no type errors**

```bash
pnpm typecheck
```

Expected: no errors (field is optional, all existing spread/assign sites still valid).

**Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add optional defaultBranch to Environment type"
```

---

### Task 2: Update `validateConfig` for backward compatibility

**Files:**
- Modify: `src/config/manager.ts`

Context: `validateConfig` validates the shape of a loaded config. It must not reject old configs that lack `defaultBranch`, and must accept the field when present.

**Step 1: Find the environment validation loop**

In `src/config/manager.ts`, locate the loop that validates each environment object (around line 211). It currently checks `name` and `order`. It does NOT check `defaultBranch` at all right now, so no change is technically required — but add an explicit optional check for clarity and future safety.

After the `order` check, add:

```ts
if (
  envObj.defaultBranch !== undefined &&
  typeof envObj.defaultBranch !== 'string'
) {
  throw new Error(
    `Environment "${envObj.name}" field "defaultBranch" must be a string`,
  );
}
```

**Step 2: Verify no type errors**

```bash
pnpm typecheck
```

**Step 3: Commit**

```bash
git add src/config/manager.ts
git commit -m "feat: validate optional defaultBranch in validateConfig"
```

---

### Task 3: Update setup flow to prompt for `defaultBranch`

**Files:**
- Modify: `src/commands/setup/flow.ts`

Context: After the user enters each environment name, prompt for a default branch. The suggested default is the environment name itself (e.g. "develop" → "develop"). The field is optional — pressing enter with an empty value leaves it undefined.

**Step 1: Update the environment-building loop**

Replace the existing loop in `runSetupFlow` (around line 45):

```ts
for (let i = 0; i < count; i++) {
  const name = await promptInput(`Environment ${i + 1} name:`, defaults[i]);
  const defaultBranchInput = await promptInput(
    `Default branch for "${name.trim()}" (optional, press enter to skip):`,
    name.trim(),
  );
  const defaultBranch = defaultBranchInput.trim() || undefined;
  environments.push({ name: name.trim(), order: i, defaultBranch });
}
```

**Step 2: Update the summary display** to show `defaultBranch` when set. Replace the chain display:

```ts
console.log(chalk.cyan('\nFlow chain:'));
for (const env of environments) {
  const branchNote = env.defaultBranch ? chalk.gray(` (default branch: ${env.defaultBranch})`) : '';
  console.log(`  ${env.order + 1}. ${env.name}${branchNote}`);
}
const chain = environments.map((e) => e.name).join(' → ');
console.log(`  ${chain}`);
```

**Step 3: Verify no type errors**

```bash
pnpm typecheck
```

**Step 4: Commit**

```bash
git add src/commands/setup/flow.ts
git commit -m "feat: prompt for defaultBranch per environment in setup flow"
```

---

### Task 4: Add `promptGitlabProjectCheckbox` to `src/ui/prompts.ts`

**Files:**
- Modify: `src/ui/prompts.ts`

Context: We need a checkbox prompt that shows GitLab projects (fetched from the API, not from local config). This is different from the existing `promptProjectMultiSelect` which operates on the local config registry.

**Step 1: Add the new prompt function**

At the end of `src/ui/prompts.ts`, add:

```ts
import type { GitlabProject } from '../types.js';

export async function promptGitlabProjectCheckbox(
  projects: GitlabProject[],
): Promise<GitlabProject[]> {
  if (projects.length === 0) return [];

  const choices = projects.map((p) => ({
    name: p.name,
    value: p,
  }));

  return checkbox<GitlabProject>({
    message: 'Select projects to add (space to select, enter to confirm):',
    choices,
    pageSize: 20,
  });
}
```

Note: `GitlabProject` is already imported at the top of `prompts.ts` via the type import — add it to the existing import if not present.

**Step 2: Verify**

```bash
pnpm typecheck
```

**Step 3: Commit**

```bash
git add src/ui/prompts.ts
git commit -m "feat: add promptGitlabProjectCheckbox to ui/prompts"
```

---

### Task 5: Rewrite `addProject.ts` to support multi-select

**Files:**
- Modify: `src/commands/group/addProject.ts`

This is the main task. The full rewrite of `runGroupAddProject`:

**Step 1: Replace the file content**

```ts
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import {
  loadConfig,
  saveConfig,
  addProject,
  addProjectToGroup,
  hasEnvironments,
  getGroupNames,
} from '../../config/manager.js';
import { createGitlabClient } from '../../gitlab/client.js';
import {
  promptConfirm,
  promptSearch,
  promptSelect,
  promptGitlabProjectCheckbox,
} from '../../ui/prompts.js';
import type { ProjectConfig, GitlabProject } from '../../types.js';

export function groupAddProjectCommand(): Command {
  return new Command('add-project')
    .description('Add one or more projects to the registry (optionally assign to a group)')
    .argument('[group]', 'Group name (optional)')
    .option('--project-id <id>', 'GitLab project ID (single-project mode)')
    .option('--branch-map <json>', 'Branch map as JSON (single-project mode)')
    .action(runGroupAddProject);
}

async function runGroupAddProject(
  groupArg: string | undefined,
  options: { projectId?: string; branchMap?: string },
): Promise<void> {
  const config = loadConfig();

  if (groupArg && !config.groups[groupArg]) {
    console.log(chalk.red(`Group "${groupArg}" does not exist.`));
    return;
  }

  if (!hasEnvironments(config)) {
    console.log(chalk.red('No environments configured. Run "husgit setup flow" first.'));
    return;
  }

  const client = createGitlabClient();

  // --- Single-project fast path (--project-id flag) ---
  if (options.projectId) {
    const spinner = ora('Fetching project...').start();
    let project: GitlabProject;
    try {
      project = await client.getProjectById(options.projectId);
      spinner.succeed(`Found: ${project.name}`);
    } catch {
      spinner.fail('Project not found');
      return;
    }
    await addSingleProject(project, groupArg, options.branchMap, config, client);
    return;
  }

  // --- Multi-select path ---
  const spinner = ora('Fetching your GitLab projects...').start();
  let allProjects: GitlabProject[];
  try {
    allProjects = await client.getUserProjects();
    spinner.succeed(`Found ${allProjects.length} projects`);
  } catch (error: unknown) {
    spinner.fail(error instanceof Error ? error.message : 'Failed to fetch projects');
    return;
  }

  const selected = await promptGitlabProjectCheckbox(allProjects);
  if (selected.length === 0) {
    console.log('No projects selected.');
    return;
  }

  const toAdd: ProjectConfig[] = [];
  const groups: Record<string, string | undefined> = {};

  for (const project of selected) {
    // Skip already registered
    if (config.projects[project.fullPath]) {
      console.log(chalk.yellow(`  Skipping "${project.name}" — already in registry.`));
      continue;
    }

    console.log(chalk.cyan(`\nConfiguring: ${project.name}`));

    // Build branch map with defaultBranch as pre-filter
    const branchMap: Record<string, string> = {};
    for (const env of config.environments) {
      const initialBranches = await client.getProjectBranches(
        project.fullPath,
        env.defaultBranch ?? '',
      );

      const branch = await promptSearch<string>(
        `Branch for "${env.name}" environment:`,
        async (term) => {
          if (term) {
            const remote = await client.getProjectBranches(project.fullPath, term);
            return remote.map((b) => ({ name: b, value: b }));
          }
          return initialBranches.map((b) => ({ name: b, value: b }));
        },
      );

      branchMap[env.name] = branch;
    }

    const projectConfig: ProjectConfig = {
      externalId: project.externalId,
      name: project.name,
      fullPath: project.fullPath,
      branchMap,
    };

    // Per-project group assignment
    let assignedGroup = groupArg;
    if (!assignedGroup) {
      const groupNames = getGroupNames(config);
      if (groupNames.length > 0) {
        const assignGroup = await promptConfirm(
          `Assign "${project.name}" to a group? (optional)`,
          false,
        );
        if (assignGroup) {
          assignedGroup = await promptSelect<string>(
            'Select group:',
            groupNames.map((g) => ({ name: g, value: g })),
          );
        }
      }
    }

    toAdd.push(projectConfig);
    groups[project.fullPath] = assignedGroup;
  }

  if (toAdd.length === 0) {
    console.log('Nothing to add.');
    return;
  }

  // Summary
  console.log(chalk.cyan('\nProjects to add:'));
  for (const p of toAdd) {
    const groupName = groups[p.fullPath];
    const groupMsg = groupName ? chalk.gray(` → group: ${groupName}`) : '';
    console.log(`  ${p.name}${groupMsg}`);
    for (const [env, branch] of Object.entries(p.branchMap)) {
      console.log(`    ${env} → ${branch}`);
    }
  }

  const ok = await promptConfirm(`Add ${toAdd.length} project(s)?`);
  if (!ok) {
    console.log('Cancelled.');
    return;
  }

  // Bulk save
  let saved = 0;
  for (const p of toAdd) {
    try {
      addProject(config, p);
      const groupName = groups[p.fullPath];
      if (groupName) {
        addProjectToGroup(config, groupName, p.fullPath);
      }
      saved++;
    } catch (error: unknown) {
      console.log(
        chalk.red(`Failed to add "${p.name}": ${error instanceof Error ? error.message : String(error)}`),
      );
    }
  }

  saveConfig(config);
  console.log(chalk.green(`${saved} project(s) added to registry.`));
}

async function addSingleProject(
  project: GitlabProject,
  groupArg: string | undefined,
  branchMapJson: string | undefined,
  config: ReturnType<typeof loadConfig>,
  client: ReturnType<typeof createGitlabClient>,
): Promise<void> {
  if (config.projects[project.fullPath]) {
    console.log(chalk.yellow(`Project "${project.name}" is already in the registry.`));
    return;
  }

  let branchMap: Record<string, string>;

  if (branchMapJson) {
    try {
      branchMap = JSON.parse(branchMapJson);
    } catch {
      console.log(chalk.red('Invalid JSON for --branch-map'));
      return;
    }
  } else {
    branchMap = {};
    for (const env of config.environments) {
      const initialBranches = await client.getProjectBranches(
        project.fullPath,
        env.defaultBranch ?? '',
      );

      const branch = await promptSearch<string>(
        `Branch for "${env.name}" environment:`,
        async (term) => {
          if (term) {
            const remote = await client.getProjectBranches(project.fullPath, term);
            return remote.map((b) => ({ name: b, value: b }));
          }
          return initialBranches.map((b) => ({ name: b, value: b }));
        },
      );

      branchMap[env.name] = branch;
    }
  }

  const projectConfig: ProjectConfig = {
    externalId: project.externalId,
    name: project.name,
    fullPath: project.fullPath,
    branchMap,
  };

  console.log(chalk.cyan('\nProject summary:'));
  console.log(`  Name: ${projectConfig.name}`);
  console.log(`  ID: ${projectConfig.externalId}`);
  for (const [env, branch] of Object.entries(projectConfig.branchMap)) {
    console.log(`  ${env} → ${branch}`);
  }

  let groupName = groupArg;
  if (!groupName) {
    const groups = getGroupNames(config);
    if (groups.length > 0) {
      const assignGroup = await promptConfirm('Assign to a group? (optional)', false);
      if (assignGroup) {
        groupName = await promptSelect<string>(
          'Select group:',
          groups.map((g) => ({ name: g, value: g })),
        );
      }
    }
  }

  const ok = await promptConfirm('Add this project?');
  if (!ok) {
    console.log('Cancelled.');
    return;
  }

  try {
    addProject(config, projectConfig);
    if (groupName) {
      addProjectToGroup(config, groupName, projectConfig.fullPath);
    }
    saveConfig(config);
    const groupMsg = groupName ? ` and assigned to group "${groupName}"` : '';
    console.log(chalk.green(`Project added to registry${groupMsg}.`));
  } catch (error: unknown) {
    console.log(
      chalk.red(error instanceof Error ? error.message : 'Failed to add project'),
    );
  }
}
```

**Step 2: Verify no type errors**

```bash
pnpm typecheck
```

Expected: no errors.

**Step 3: Build**

```bash
pnpm build
```

Expected: `dist/index.js` produced with no errors.

**Step 4: Commit**

```bash
git add src/commands/group/addProject.ts
git commit -m "feat: multi-project add with checkbox select and per-project group assignment"
```

---

### Task 6: Manual smoke test

**Step 1: Link CLI locally**

```bash
pnpm build && node dist/index.js group add-project
```

Verify:
- Fetches GitLab projects
- Shows checkbox list
- For each selected project, shows branch search pre-filtered by `defaultBranch` (if set in your env config)
- Asks per-project group assignment
- Shows summary
- Saves to config

**Step 2: Test backward compat**

Check that an existing `~/.husgit/config.json` without `defaultBranch` on environments still loads correctly and the branch search starts with an empty filter.

**Step 3: Final commit (if any fixups needed)**

```bash
git add -p
git commit -m "fix: <description of fixup>"
```
