# Husky Pre-commit Hooks Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Set up Husky + lint-staged so every commit automatically formats staged `.ts` files and blocks on TypeScript errors.

**Architecture:** Husky installs a `.husky/pre-commit` shell script into git hooks. lint-staged runs `prettier --write` on staged files and re-stages them. Then `tsc --noEmit` typechecks the full project. Both are wired up via `package.json`.

**Tech Stack:** pnpm, husky, lint-staged, prettier, TypeScript

---

### Task 1: Install dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install husky and lint-staged as devDependencies**

```bash
pnpm add -D husky lint-staged
```

Expected: both packages added to `devDependencies` in `package.json` and `pnpm-lock.yaml` updated.

**Step 2: Verify installation**

```bash
pnpm list husky lint-staged
```

Expected: both packages listed with version numbers.

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add husky and lint-staged"
```

---

### Task 2: Add `prepare` script and lint-staged config to `package.json`

**Files:**
- Modify: `package.json`

**Step 1: Add the `prepare` script**

In `package.json`, add to the `"scripts"` section:

```json
"prepare": "husky"
```

This makes pnpm run `husky` automatically after `pnpm install`, setting up git hooks for any developer who clones the repo.

**Step 2: Add lint-staged config**

At the top level of `package.json` (alongside `"scripts"`, `"dependencies"`, etc.), add:

```json
"lint-staged": {
  "src/**/*.ts": [
    "prettier --write",
    "git add"
  ]
}
```

This tells lint-staged: for any staged `.ts` file under `src/`, run prettier (which modifies the file in place) then re-stage it.

**Step 3: Verify `package.json` is valid JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('valid')"
```

Expected: `valid`

**Step 4: Commit**

```bash
git add package.json
git commit -m "chore: add prepare script and lint-staged config"
```

---

### Task 3: Initialize Husky and create the pre-commit hook

**Files:**
- Create: `.husky/pre-commit`

**Step 1: Initialize Husky**

```bash
pnpm husky
```

Expected: `.husky/` directory created (may already exist). Husky writes its own wrapper files inside.

**Step 2: Create the pre-commit hook file**

Create `.husky/pre-commit` with this exact content:

```sh
pnpm lint-staged
pnpm typecheck
```

The file must be a plain shell script (no shebang needed — husky handles that). `lint-staged` runs first (format + re-stage), then `typecheck` (`tsc --noEmit`) runs on the full project.

**Step 3: Verify the hook file is executable**

```bash
ls -la .husky/pre-commit
```

Expected: the file has execute permissions (`-rwxr-xr-x` or similar). If not, run:

```bash
chmod +x .husky/pre-commit
```

**Step 4: Commit**

```bash
git add .husky/pre-commit
git commit -m "chore: add husky pre-commit hook"
```

---

### Task 4: Verify the hooks work end-to-end

**Step 1: Make a deliberate formatting violation in a source file**

Open any file in `src/` and introduce a formatting issue (e.g., add extra spaces, remove a trailing comma, change quotes). Save but do NOT run prettier manually.

**Step 2: Stage the file and attempt to commit**

```bash
git add src/<the-file-you-modified>.ts
git commit -m "test: verify pre-commit hook"
```

Expected:
- lint-staged runs prettier and fixes the file automatically
- The fixed file is re-staged
- `tsc --noEmit` runs and passes
- The commit succeeds

**Step 3: Inspect the committed file**

```bash
git show HEAD:<path-to-file>
```

Expected: the file in the commit is properly formatted (prettier's fixes were included).

**Step 4: Verify typecheck blocking**

Introduce a deliberate type error in a source file (e.g., `const x: number = "not a number"`), stage it, and attempt to commit:

```bash
git add src/<the-file>.ts
git commit -m "test: type error should block"
```

Expected: commit is blocked with a TypeScript error message. Revert the change afterward:

```bash
git checkout src/<the-file>.ts
```

**Step 5: No cleanup commit needed** — the test commits either succeeded (with auto-fixed formatting) or were blocked. The repo is clean.
