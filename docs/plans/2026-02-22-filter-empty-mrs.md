# `--no-empty` Filter for `husgit status` Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `--no-empty` flag to `husgit status` that hides MRs where `hasChanges === false`.

**Architecture:** Single-file change in `src/commands/status.ts`. After collecting all open MRs, filter out entries with `hasChanges === false` when the flag is present, then annotate the summary line to indicate the filter is active.

**Tech Stack:** TypeScript, Commander (CLI option parsing), chalk (terminal colors)

---

### Task 1: Add `--no-empty` flag and filtering logic

**Files:**
- Modify: `src/commands/status.ts`

No test framework is configured. Verify manually by building and running the CLI.

---

**Step 1: Add the Commander option**

In `src/commands/status.ts`, locate the `statusCommand()` function (line 47). After the existing `.option('--group <name>', ...)` line, add:

```ts
.option('--no-empty', 'Hide MRs with no changes (hasChanges === false)')
```

Result should look like:
```ts
export function statusCommand(): Command {
  return new Command('status')
    .description(
      'Show open MRs for a given flow direction and source environment',
    )
    .argument('<type>', 'Direction: release or backport')
    .argument('<source-env>', 'Source environment name')
    .option('--group <name>', 'Show only a specific group')
    .option('--no-empty', 'Hide MRs with no changes (hasChanges === false)')
    .action(runStatus);
}
```

---

**Step 2: Extend the options type in `runStatus`**

Change the `options` parameter type on line 61 from:
```ts
options: { group?: string },
```
to:
```ts
options: { group?: string; noEmpty?: boolean },
```

Note: Commander maps `--no-empty` to `options.noEmpty` (camelCase, strips the `no-` prefix and flips to boolean).

---

**Step 3: Apply the filter after collecting MRs**

After line 169 (`spinner.stop();`), insert the filter:

```ts
const visibleMRs = options.noEmpty
  ? openMRs.filter((mr) => mr.hasChanges !== false)
  : openMRs;
```

---

**Step 4: Replace all downstream uses of `openMRs` with `visibleMRs`**

The following lines currently reference `openMRs` after collection — replace each with `visibleMRs`:

- Line 173: `if (openMRs.length === 0)` → `if (visibleMRs.length === 0)`
- Line 183: `for (const mr of openMRs)` → `for (const mr of visibleMRs)`
- Line 194: `const openCount = openMRs.filter(...)` → `const openCount = visibleMRs.filter(...)`
- Line 195: `const mergedCount = openMRs.filter(...)` → `const mergedCount = visibleMRs.filter(...)`

---

**Step 5: Annotate the summary line when filtering is active**

On line 200–203, the summary line is built. After `const arrow = ...`, add the annotation:

```ts
const arrow = `${pair.sourceEnv.name} → ${pair.targetEnv.name}`;
const filterNote = options.noEmpty ? chalk.dim(' · empty MRs hidden') : '';
console.log(
  `\n${parts.join(', ')} ${chalk.dim(`MR(s) (${type}: ${arrow}):`)}${filterNote}`,
);
```

---

**Step 6: Build and verify**

```bash
pnpm build
```

Expected: no TypeScript errors, `dist/index.js` updated.

---

**Step 7: Manual smoke test**

Run without flag — behaviour unchanged:
```bash
./dist/index.js status release <source-env>
```
Expected: all MRs shown, no annotation.

Run with flag — empty MRs hidden:
```bash
./dist/index.js status release <source-env> --no-empty
```
Expected: MRs where `hasChanges === false` are gone from table; summary line ends with `· empty MRs hidden`.

---

**Step 8: Commit**

```bash
git add src/commands/status.ts
git commit -m "feat: add --no-empty flag to status command to hide empty MRs"
```
