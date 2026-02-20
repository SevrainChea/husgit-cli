# Design: Multi-Project Add & Environment Default Branches

**Date:** 2026-02-20
**Status:** Approved

## Problem

The `addProject` command only supports adding one project at a time, with no branch defaults. For bulk onboarding (setting up a fresh config), this means tediously repeating the full branch-search flow for every project.

## Goals

- Add multiple projects in a single command run
- Allow environments to declare a default branch name (pre-fills branch search)
- Per-project group assignment
- Full backward compatibility with existing config files

## Data Model

### `Environment` (src/types.ts)

Add an optional `defaultBranch` field:

```ts
export interface Environment {
  name: string;
  order: number;
  defaultBranch?: string; // optional — undefined for old configs
}
```

No migration needed. Existing configs without this field continue to work; reads produce `undefined`.

## Setup Flow Changes (src/commands/setup/flow.ts)

After prompting for each environment name, add an optional prompt for default branch:

```
Environment 1 name: [develop]
Default branch for "develop" (optional, press enter to skip): [develop]
```

- Default suggestion matches the environment name (common convention)
- User can accept, type a different name, or clear to leave undefined
- Re-running setup on an existing config starts with blank `defaultBranch` (not re-populated from current config)

## Multi-Project Add Flow (src/commands/group/addProject.ts)

1. **Fetch** all GitLab projects via `client.getUserProjects()`
2. **Checkbox multi-select** — user picks N projects from a list
3. **For each selected project:**
   a. Skip with a warning if already in the registry
   b. For each environment, open the branch search prompt with `env.defaultBranch` pre-filled as the search term (user can clear/change)
   c. After branch map is complete, offer optional group assignment (confirm + select, same as today)
4. **Summary** — display all configured projects and their branch maps
5. **Final confirm** — single "Add these projects?" prompt
6. **Save** all projects in one `saveConfig()` call

## Backward Compatibility

- `defaultBranch` is typed as `optional` — no reads in existing code break
- `validateConfig` in `manager.ts` must treat `defaultBranch` as optional (skip validation if absent)
- Branch search with an empty/undefined default behaves identically to today's flow

## Out of Scope

- Importing from JSON/CSV file
- Bulk group assignment (all projects to one group at once)
- Editing existing projects' branch maps
