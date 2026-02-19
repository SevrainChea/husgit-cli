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
husgit status --type release --source-env develop
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
| `husgit config export` | Copy config to clipboard for sharing |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GITLAB_TOKEN` | Yes | — | GitLab personal access token with `api` scope |
| `GITLAB_URL` | No | `https://gitlab.com` | GitLab instance URL (for self-hosted) |

## Config

Configuration is stored at `~/.husgit/config.json`. You can edit it directly or use the CLI commands to manage it.

## Publishing

### Version Management

Versions are managed manually using npm's versioning system. Before each release, decide whether the change is a:

- **Patch** (`0.0.X`) — Bug fixes and small improvements
- **Minor** (`0.X.0`) — New features, backwards compatible
- **Major** (`X.0.0`) — Breaking changes

### Release Process

Use the automated release script to bump version, run checks, and publish:

```bash
# Preview what will be published (dry run)
pnpm release:dry patch

# Actually publish (bumps version, creates git tag, publishes to npm)
pnpm release patch
pnpm release minor
pnpm release major
```

The release script automatically:
1. Type checks your code (`tsc --noEmit`)
2. Verifies formatting with Prettier
3. Builds the package (`tsup`)
4. Bumps the version using `npm version` (creates git tag)
5. Publishes to npm registry

If any check fails, the release stops immediately and nothing is published.

### Manual Release (if needed)

For advanced scenarios, you can manage versioning manually:

```bash
npm version patch    # or minor, major
npm publish
```

## License

MIT
