# Design: `--no-empty` Filter for `husgit status`

**Date:** 2026-02-22

## Problem

`husgit status` shows all open MRs, including those where `hasChanges === false` (source and target branches are already in sync). These "empty" MRs add noise when scanning for actionable work.

## Solution

Add a `--no-empty` boolean flag to `husgit status` that hides MRs where `hasChanges === false`.

## Scope

Single file change: `src/commands/status.ts`

## Changes

### 1. Commander option declaration

Add to `statusCommand()`:

```ts
.option('--no-empty', 'Hide MRs with no changes (hasChanges === false)')
```

### 2. Options type

Extend the `options` parameter in `runStatus()`:

```ts
options: { group?: string; noEmpty?: boolean }
```

### 3. Post-collection filter

After collecting `openMRs`, apply filter when flag is set:

```ts
const filtered = options.noEmpty
  ? openMRs.filter((mr) => mr.hasChanges !== false)
  : openMRs;
```

Use `filtered` in place of `openMRs` for the table and summary.

### 4. Summary line annotation

Append `chalk.dim('(empty MRs hidden)')` to the summary line when `options.noEmpty` is true.

## Behaviour

| Flag present | `hasChanges === false` MRs | `hasChanges === true` / undefined MRs |
|---|---|---|
| No (default) | shown | shown |
| `--no-empty` | hidden | shown |

`hasChanges === undefined` (field absent) is treated as "may have changes" and is **not** filtered out.

## Out of Scope

- No changes to types, GitLab client, or other commands.
- No new files.
