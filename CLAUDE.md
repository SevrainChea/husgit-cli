# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

husgit-cli is a standalone CLI tool for orchestrating GitLab merge request workflows across multiple projects. It manages environment promotion (release) and demotion (backport) by creating/updating MRs via the GitLab GraphQL and REST APIs. No server, database, or auth system -- just `GITLAB_TOKEN` and a local JSON config file at `~/.husgit/config.json`.

## Commands

- **Build:** `pnpm build` (tsup, outputs to `dist/index.js` with shebang)
- **Dev watch:** `pnpm dev`
- **Format:** `pnpm format` (Prettier)
- **Type check:** `pnpm typecheck`

No test framework is configured yet.

After building, the CLI is available as `./dist/index.js` or via `pnpm link --global` as `husgit`.

## Architecture

### Entry Point & Routing

`src/index.ts` dispatches based on args: no args launches the interactive menu (`commands/interactive.ts`), otherwise delegates to Commander (`cli.ts`).

### Config Layer (`src/config/manager.ts`)

Reads/writes `~/.husgit/config.json`. The config holds:
- `gitlabUrl` -- GitLab instance URL
- `environments` -- ordered linear chain (e.g., develop -> staging -> production)
- `groups` -- named collections of projects, each with per-environment branch mappings (`branchMap`)

### GitLab Client (`src/gitlab/`)

- `client.ts` -- `GitlabClient` class using `@urql/core` for GraphQL and `axios` for REST. Factory `createGitlabClient()` reads `GITLAB_TOKEN` and `GITLAB_URL` env vars.
- `queries.ts` -- GraphQL query/mutation strings.
- MR creation uses REST POST; on 409 conflict (MR exists), falls back to GraphQL query + mutation to update the existing MR's title.

### Flow Execution (`src/services/flowExecution.ts`)

Core orchestration logic:
- `resolveBranchPairs()` -- maps (sourceEnv, direction, groups) to concrete (sourceBranch, targetBranch) pairs per project
- `executeMergeRequests()` -- creates MRs with the create-then-update-on-409 pattern

### Commands (`src/commands/`)

| Command | File | Description |
|---------|------|-------------|
| `husgit` (no args) | `interactive.ts` | Interactive menu |
| `husgit setup flow` | `setup/flow.ts` | Configure environment chain |
| `husgit group add <name>` | `group/add.ts` | Create empty group |
| `husgit group add-project <group>` | `group/addProject.ts` | Add project with branch mapping |
| `husgit group list` | `group/list.ts` | List groups/projects |
| `husgit group remove <name>` | `group/remove.ts` | Remove group |
| `husgit release <env>` | `release.ts` | Promote to next environment |
| `husgit backport <env>` | `backport.ts` | Demote to previous environment |
| `husgit status` | `status.ts` | Show open MRs between environments |

### UI Layer (`src/ui/prompts.ts`)

Thin wrappers around `@inquirer/prompts` (input, select, confirm, search).

## Code Conventions

- TypeScript with strict mode, ESM (`"type": "module"`)
- All internal imports use `.js` extension (required for ESM)
- Prettier: single quotes, trailing commas, 2-space indent
- Each command exports a factory function returning a `Command` instance (e.g., `releaseCommand(): Command`)
- Commander for CLI parsing, `@inquirer/prompts` for interactive input

## Environment Variables

- `GITLAB_TOKEN` (required) -- GitLab personal access token
- `GITLAB_URL` (optional, default: `https://gitlab.com`) -- GitLab instance URL
