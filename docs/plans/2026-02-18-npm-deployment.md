# npm Deployment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `husgit-cli` publicly installable via `npm install -g husgit-cli` with automated publishing triggered by git tags through GitHub Actions.

**Architecture:** Five independent file changes — no code logic changes, pure packaging/infra work. package.json gains publish metadata, three new files are added (README.md, LICENSE, .github/workflows/publish.yml), and the .gitignore is already correct (dist/ is already excluded).

**Tech Stack:** pnpm, tsup, GitHub Actions, npm registry

---

### Task 1: Harden package.json for publishing

**Files:**
- Modify: `package.json`

**Step 1: Read the current package.json**

Open `package.json` and confirm you see:
- `"name": "husgit-cli"`
- `"bin": { "husgit": "./dist/index.js" }`
- No `files`, `engines`, or `prepublishOnly` yet

**Step 2: Add the three publish fields**

Add these three entries to `package.json`. Place `files` and `engines` after `"bin"`, and `prepublishOnly` in the `scripts` block:

```json
{
  "name": "husgit-cli",
  "version": "0.1.0",
  "description": "CLI tool for orchestrating GitLab merge request workflows",
  "type": "module",
  "bin": {
    "husgit": "./dist/index.js"
  },
  "files": [
    "dist"
  ],
  "engines": {
    "node": ">=18"
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "format": "prettier --write 'src/**/*.ts'",
    "typecheck": "tsc --noEmit",
    "prepublishOnly": "pnpm build && pnpm typecheck"
  },
  "keywords": [
    "gitlab",
    "merge-request",
    "cli"
  ],
  "license": "MIT",
  "dependencies": {
    "@inquirer/prompts": "^7.3.2",
    "@urql/core": "^5.1.1",
    "axios": "^1.7.9",
    "chalk": "^5.4.1",
    "cli-table3": "^0.6.5",
    "commander": "^13.1.0",
    "graphql": "^16.10.0",
    "ora": "^8.2.0"
  },
  "devDependencies": {
    "@types/node": "^22.13.4",
    "prettier": "^3.5.2",
    "tsup": "^8.3.6",
    "typescript": "^5.7.3"
  },
  "packageManager": "pnpm@10.11.1+sha512.e519b9f7639869dc8d5c3c5dfef73b3f091094b0a006d7317353c72b124e80e1afd429732e28705ad6bfa1ee879c1fce46c128ccebd3192101f43dd67c667912"
}
```

**Step 3: Verify the publish package contents with dry-run**

Run:
```bash
pnpm build && npm pack --dry-run
```

Expected output: a list of files that would be packed. You should see only files under `dist/` plus `package.json`, `README.md`, `LICENSE`. You should NOT see `src/`, `docs/`, `tsup.config.ts`, etc.

If `README.md` and `LICENSE` don't exist yet (they're created in later tasks), that's fine — the dry-run still shows what would be included.

**Step 4: Commit**

```bash
git add package.json
git commit -m "chore: add files, engines, and prepublishOnly for npm publish"
```

---

### Task 2: Add MIT LICENSE file

**Files:**
- Create: `LICENSE`

**Step 1: Create the file**

Create `LICENSE` at the repo root with this exact content (replace `<YEAR>` with `2026` and `<AUTHOR>` with your name):

```
MIT License

Copyright (c) 2026 <AUTHOR>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

**Step 2: Commit**

```bash
git add LICENSE
git commit -m "chore: add MIT license"
```

---

### Task 3: Write README.md

**Files:**
- Create: `README.md`

**Step 1: Create the README**

Create `README.md` at the repo root:

```markdown
# husgit-cli

A CLI tool for orchestrating GitLab merge request workflows across multiple projects.

Automates environment promotion (release) and demotion (backport) by creating and updating MRs via the GitLab API — across all projects in a group simultaneously.

## Prerequisites

- Node.js 18+
- A [GitLab personal access token](https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html) with `api` scope

## Installation

```bash
npm install -g husgit-cli
```

## Setup

**1. Set your GitLab token:**

```bash
export GITLAB_TOKEN=your_token_here
```

Add this to your shell profile (`~/.zshrc`, `~/.bashrc`) to make it permanent.

**2. Configure your environment chain:**

```bash
husgit setup flow
```

This walks you through defining your environments in order (e.g., `develop → staging → production`) and saves them to `~/.husgit/config.json`.

**3. Create a project group and add projects:**

```bash
husgit group add my-services
husgit group add-project my-services
```

`add-project` will search your GitLab namespace and prompt you to map each environment to the corresponding branch for that project.

## Usage

**Promote all projects in a group to the next environment:**

```bash
husgit release staging
```

Creates (or updates) MRs from each project's `staging` branch to `production`.

**Demote to a previous environment:**

```bash
husgit backport staging
```

Creates MRs from `production` back to `staging`.

**Check open MRs between environments:**

```bash
husgit status
```

**Interactive mode (no arguments):**

```bash
husgit
```

## Commands

| Command | Description |
|---------|-------------|
| `husgit` | Launch interactive menu |
| `husgit setup flow` | Configure environment chain |
| `husgit group add <name>` | Create a new group |
| `husgit group add-project <group>` | Add a project with branch mapping |
| `husgit group list` | List all groups and their projects |
| `husgit group remove <name>` | Remove a group |
| `husgit release <env>` | Promote group to next environment |
| `husgit backport <env>` | Demote group to previous environment |
| `husgit status` | Show open MRs between environments |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GITLAB_TOKEN` | Yes | — | GitLab personal access token with `api` scope |
| `GITLAB_URL` | No | `https://gitlab.com` | GitLab instance URL (for self-hosted) |

## Config

Configuration is stored at `~/.husgit/config.json`. You can edit it directly or use the CLI commands to manage it.

## License

MIT
```

**Step 2: Verify it renders**

Open `README.md` and do a visual scan — check that the code fences are properly closed, the tables have correct pipes, and the commands are accurate.

**Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add README for npm package page"
```

---

### Task 4: Create GitHub Actions publish workflow

**Files:**
- Create: `.github/workflows/publish.yml`

**Step 1: Create the directory structure**

```bash
mkdir -p .github/workflows
```

**Step 2: Create the workflow file**

Create `.github/workflows/publish.yml`:

```yaml
name: Publish to npm

on:
  push:
    tags:
      - 'v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        # reads packageManager field from package.json automatically

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
          registry-url: https://registry.npmjs.org

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build
        run: pnpm build

      - name: Type check
        run: pnpm typecheck

      - name: Publish
        run: npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

**Step 3: Verify the workflow YAML is valid**

Check the YAML is syntactically correct:
```bash
# If you have yamllint installed:
yamllint .github/workflows/publish.yml

# Or just eyeball it — common mistakes:
# - Indentation (YAML uses spaces, not tabs)
# - The `on:` key (not `on :` with a space)
# - Unclosed strings
```

**Step 4: Commit**

```bash
git add .github/workflows/publish.yml
git commit -m "ci: add GitHub Actions workflow to publish to npm on tag push"
```

---

### Task 5: Verify full publish dry-run

**Step 1: Build the project**

```bash
pnpm build
```

Expected: `dist/index.js` is created (with shebang `#!/usr/bin/env node`).

**Step 2: Run npm pack dry-run**

```bash
npm pack --dry-run
```

Expected output should list ONLY:
- `dist/index.js`
- `dist/index.js.map`
- `package.json`
- `README.md`
- `LICENSE`

It should NOT include: `src/`, `tsup.config.ts`, `tsconfig.json`, `docs/`, `.github/`.

If unwanted files appear, add them to the `files` array in `package.json` (as exclusions are handled by listing only what you want in `files`).

**Step 3: Check the binary will be executable after install**

```bash
node dist/index.js --help
```

Expected: prints the help output for `husgit`.

**Step 4: Final commit (if any fixes were needed)**

If step 2 revealed unwanted files and you had to fix `package.json`:
```bash
git add package.json
git commit -m "chore: fix files field to exclude unwanted paths from npm package"
```

---

### Task 6: One-time npm and GitHub setup (manual steps, outside this repo)

These steps cannot be automated and must be done by the developer manually.

**Step 1: Create an npm account (if you don't have one)**

Go to https://www.npmjs.com/signup

**Step 2: Check if the package name is available**

```bash
npm view husgit-cli
```

If it returns "404 Not Found" — the name is available.
If it's taken, you'll need to pick a different name (e.g., `@yourusername/husgit-cli` as a scoped package) and update the `"name"` field in `package.json`.

**Step 3: Generate an npm automation token**

```bash
npm login  # log in to your npm account
npm token create --type=automation
```

Copy the token — it won't be shown again.

**Step 4: Add the token as a GitHub Actions secret**

1. Push this branch to GitHub (create the repo if it doesn't exist)
2. Go to: GitHub repo → Settings → Secrets and variables → Actions
3. Click "New repository secret"
4. Name: `NPM_TOKEN`
5. Value: paste the token from step 3

**Step 5: Test the full release flow with a dry-run publish**

```bash
# From your local machine, with npm logged in:
npm publish --dry-run
```

Expected: lists files that would be uploaded, no errors.

---

### Task 7: Tag and ship v0.1.0

**Step 1: Make sure you're on main and all changes are merged**

```bash
git log --oneline -5
git status
```

Expected: clean working tree, all deployment tasks committed.

**Step 2: Bump the version and tag**

```bash
npm version patch
```

This updates `package.json` version (already `0.1.0`, so this creates a `v0.1.1` tag) — OR if you want to publish the existing `0.1.0` as the first release, tag it manually:

```bash
git tag v0.1.0
```

**Step 3: Push commit and tag**

```bash
git push && git push --tags
```

**Step 4: Watch the GitHub Actions workflow**

Go to: GitHub repo → Actions tab → "Publish to npm" workflow

It should trigger on the tag push, run the build + typecheck + publish steps, and complete successfully.

**Step 5: Verify on npmjs.com**

```bash
npm view husgit-cli
```

Expected: shows the package metadata including version, description, and bin entry.

**Step 6: Verify installation works**

```bash
npm install -g husgit-cli
husgit --help
```

Expected: `husgit` is available globally and prints help.
