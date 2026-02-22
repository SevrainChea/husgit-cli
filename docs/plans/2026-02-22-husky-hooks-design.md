# Design: Pre-commit Hooks with Husky + lint-staged

**Date:** 2026-02-22
**Status:** Approved

## Goal

Ensure every commit passes typechecks and formatting automatically, blocking bad commits at the source.

## Approach

Husky + lint-staged (Option A): Husky manages git hooks committed to the repo; lint-staged runs tools only on staged files for fast feedback.

## Dependencies

Add to `devDependencies`:
- `husky` — git hook management via `.husky/` directory
- `lint-staged` — runs configured tools on staged files only

## Changes

### `package.json`

Add `prepare` script so hooks are installed automatically on `pnpm install`:

```json
"scripts": {
  "prepare": "husky"
}
```

Add lint-staged config:

```json
"lint-staged": {
  "src/**/*.ts": [
    "prettier --write",
    "git add"
  ]
}
```

### `.husky/pre-commit`

```sh
pnpm lint-staged
pnpm typecheck
```

## Commit Flow

1. `git commit` triggers `.husky/pre-commit`
2. `lint-staged` runs `prettier --write` on staged `.ts` files and re-stages them
3. `tsc --noEmit` checks the full project — commit is blocked on type errors

## Out of Scope

- No commit-msg hook (commit message linting)
- No pre-push hook
