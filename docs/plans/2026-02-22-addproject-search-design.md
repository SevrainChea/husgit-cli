# Design: Add Search/Filter to `promptGitlabProjectCheckbox`

**Date:** 2026-02-22
**Status:** Approved

## Problem

`promptGitlabProjectCheckbox` renders all fetched GitLab projects in a plain scrollable checkbox with no way to narrow the list. Users with many projects must scroll through everything.

## Approach

Pre-filter input → checkbox (two-step, client-side, no new dependencies).

## Flow

1. Projects are fetched from GitLab (existing behavior, unchanged).
2. **New:** `input` prompt — "Filter projects (leave blank for all):".
3. The `allProjects` array is filtered client-side: case-insensitive substring match on `name` or `fullPath`.
4. If filter matches 0 projects → print "No projects match filter." and return `[]`.
5. Filtered list is passed to `checkbox` for multi-select (existing behavior).

## Scope

- **Only file changed:** `src/ui/prompts.ts` — `promptGitlabProjectCheckbox` function.
- `addProject.ts` is untouched.
- No new dependencies.

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Blank filter | Show all projects |
| Non-empty filter, 0 matches | Log warning, return `[]` |
| Non-empty filter, all match | Show all |
| Filter matches 1 project | Checkbox shows 1 item |
