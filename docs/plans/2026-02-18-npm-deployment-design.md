# Design: npm Deployment for husgit-cli

**Date:** 2026-02-18
**Status:** Approved

## Goal

Publish `husgit-cli` to the npm registry as a public, installable package. Any GitLab user should be able to run `npm install -g husgit-cli` and have the `husgit` command available globally.

## Approach

Simple tag-triggered publish: the developer manually bumps the version with `npm version`, pushes the tag, and a GitHub Actions workflow builds and publishes to npm automatically. No extra tooling (changesets, semantic-release) — appropriate for an early-stage solo project.

## Changes

### 1. `package.json` hardening

- Add `"files": ["dist"]` — only ship built output, not `src/`, `docs/`, etc.
- Add `"engines": { "node": ">=18" }` — matches `tsup` target, communicates minimum requirement
- Add `"prepublishOnly": "pnpm build && pnpm typecheck"` — safety net against publishing broken/unbuilt code

### 2. Supporting files

| File | Purpose |
|------|---------|
| `README.md` | npmjs.com landing page + GitHub front page. Covers: what it is, prerequisites (`GITLAB_TOKEN`), install command, quick-start usage. |
| `LICENSE` | MIT license text (package.json already declares `"license": "MIT"`). |
| `.gitignore` | Ensure `dist/` is listed (build artifacts should not be committed). |

### 3. GitHub Actions publish workflow

**File:** `.github/workflows/publish.yml`

**Trigger:** `push` of tags matching `v*`

**Steps:**
1. `actions/checkout`
2. `pnpm/action-setup` (reads `packageManager` from `package.json`)
3. `actions/setup-node@v4` with `node-version: 20` and `registry-url: https://registry.npmjs.org`
4. `pnpm install --frozen-lockfile`
5. `pnpm build`
6. `pnpm typecheck`
7. `npm publish --access public` (authenticates via `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`)

### 4. One-time manual setup (outside this repo)

1. Create/log into an npm account
2. Generate an Automation token: `npm token create --type=automation`
3. Add it as a GitHub Actions secret named `NPM_TOKEN` in the repo settings

## Release Workflow

```bash
# Bump version (edits package.json, creates git tag)
npm version patch   # or minor / major

# Push commit + tag to GitHub
git push && git push --tags

# CI picks up the tag → builds → publishes to npm
```

## User Install

```bash
npm install -g husgit-cli
# or
npx husgit-cli
```

## Files Changed

| File | Change |
|------|--------|
| `package.json` | Add `files`, `engines`, `prepublishOnly` |
| `README.md` | New |
| `LICENSE` | New |
| `.gitignore` | Ensure `dist/` is excluded |
| `.github/workflows/publish.yml` | New |

## Out of Scope

- Homebrew tap (can be added later if there's demand from non-Node users)
- Changesets or semantic-release (can be adopted if the project gets contributors)
- Compiled binary distribution (pkg/bun)
