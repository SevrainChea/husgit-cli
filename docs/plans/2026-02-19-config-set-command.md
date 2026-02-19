# Config Set Command Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `husgit config set <file-path>` command to load and replace entire config from a JSON file with strict validation and timestamped backups.

**Architecture:** Implement validation as a reusable function in the config manager, create a new set command that handles path resolution and backup creation, then wire it into the config command structure. This follows the existing command pattern (factory functions returning Command instances) and leverages existing config manager infrastructure.

**Tech Stack:** Commander.js, Node.js fs (readFileSync, writeFileSync), path (resolve, expandTilde via user logic)

---

### Task 1: Add validateConfig() function to config manager

**Files:**
- Modify: `src/config/manager.ts`

**Step 1: Read the existing manager to understand current exports**

Run: Already reviewed in design phase

**Step 2: Add validateConfig() function**

Add this function before the closing brace in `src/config/manager.ts`:

```typescript
export function validateConfig(config: unknown): HusgitConfig {
  // Type guard and validation
  if (!config || typeof config !== 'object') {
    throw new Error('Config must be an object');
  }

  const cfg = config as Record<string, unknown>;

  // Validate gitlabUrl (optional, defaults to https://gitlab.com if omitted)
  if (cfg.gitlabUrl !== undefined && typeof cfg.gitlabUrl !== 'string') {
    throw new Error('Config field "gitlabUrl" must be a string');
  }

  // Validate environments (required, must be array)
  if (!Array.isArray(cfg.environments)) {
    throw new Error('Config field "environments" must be an array');
  }

  if (cfg.environments.length === 0) {
    throw new Error('Config must have at least one environment');
  }

  // Validate environment structure and order
  const envOrders = new Set<number>();
  const envNames = new Set<string>();

  for (let i = 0; i < cfg.environments.length; i++) {
    const env = cfg.environments[i];
    if (!env || typeof env !== 'object') {
      throw new Error(`Environment at index ${i} must be an object`);
    }

    const envObj = env as Record<string, unknown>;

    // Check required fields
    if (typeof envObj.name !== 'string' || !envObj.name.trim()) {
      throw new Error(`Environment at index ${i} missing required field "name" (string)`);
    }

    if (typeof envObj.order !== 'number') {
      throw new Error(
        `Environment "${envObj.name}" missing required field "order" (number)`,
      );
    }

    // Check uniqueness
    if (envNames.has(envObj.name)) {
      throw new Error(`Duplicate environment name: "${envObj.name}"`);
    }
    envNames.add(envObj.name);

    if (envOrders.has(envObj.order)) {
      throw new Error(`Duplicate environment order: ${envObj.order}`);
    }
    envOrders.add(envObj.order);
  }

  // Validate order is sequential (0, 1, 2, ...)
  const sortedOrders = Array.from(envOrders).sort((a, b) => a - b);
  for (let i = 0; i < sortedOrders.length; i++) {
    if (sortedOrders[i] !== i) {
      throw new Error(
        `Environment orders must be sequential starting from 0, found gap at ${i}`,
      );
    }
  }

  // Validate groups (required, must be object)
  if (!cfg.groups || typeof cfg.groups !== 'object' || Array.isArray(cfg.groups)) {
    throw new Error('Config field "groups" must be an object');
  }

  const groupsObj = cfg.groups as Record<string, unknown>;

  for (const [groupName, groupValue] of Object.entries(groupsObj)) {
    if (!groupValue || typeof groupValue !== 'object' || Array.isArray(groupValue)) {
      throw new Error(`Group "${groupName}" must be an object`);
    }

    const group = groupValue as Record<string, unknown>;

    if (!Array.isArray(group.projects)) {
      throw new Error(`Group "${groupName}" field "projects" must be an array`);
    }

    // Validate each project
    for (let i = 0; i < group.projects.length; i++) {
      const proj = group.projects[i];
      if (!proj || typeof proj !== 'object' || Array.isArray(proj)) {
        throw new Error(`Project at index ${i} in group "${groupName}" must be an object`);
      }

      const projObj = proj as Record<string, unknown>;

      // Required fields
      const requiredFields = ['externalId', 'name', 'fullPath', 'branchMap'];
      for (const field of requiredFields) {
        if (!(field in projObj)) {
          throw new Error(
            `Project at index ${i} in group "${groupName}" missing required field "${field}"`,
          );
        }
      }

      // Type checks
      if (typeof projObj.externalId !== 'string' || !projObj.externalId.trim()) {
        throw new Error(
          `Project at index ${i} in group "${groupName}" field "externalId" must be a non-empty string`,
        );
      }

      if (typeof projObj.name !== 'string' || !projObj.name.trim()) {
        throw new Error(
          `Project at index ${i} in group "${groupName}" field "name" must be a non-empty string`,
        );
      }

      if (typeof projObj.fullPath !== 'string' || !projObj.fullPath.trim()) {
        throw new Error(
          `Project at index ${i} in group "${groupName}" field "fullPath" must be a non-empty string`,
        );
      }

      if (!projObj.branchMap || typeof projObj.branchMap !== 'object' || Array.isArray(projObj.branchMap)) {
        throw new Error(
          `Project at index ${i} in group "${groupName}" field "branchMap" must be an object`,
        );
      }
    }
  }

  // If we got here, validation passed. Construct and return the typed config.
  return {
    gitlabUrl: (cfg.gitlabUrl as string) || 'https://gitlab.com',
    environments: cfg.environments as Environment[],
    groups: groupsObj as Record<string, Group>,
  };
}
```

**Step 3: Verify the function is exported**

Check that the export line was added. The function should be callable as `import { validateConfig } from '../../config/manager.js'`

**Step 4: Commit**

```bash
git add src/config/manager.ts
git commit -m "feat: add validateConfig function for strict config validation"
```

---

### Task 2: Create the config set command

**Files:**
- Create: `src/commands/config/set.ts`

**Step 1: Create the file with full implementation**

Write to `src/commands/config/set.ts`:

```typescript
import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { resolve, expand } from 'node:path';
import { homedir } from 'node:os';
import chalk from 'chalk';
import { loadConfig, saveConfig, validateConfig, getConfigPath } from '../../config/manager.js';
import { writeFileSync, mkdirSync } from 'node:fs';

export function configSetCommand(): Command {
  return new Command('set')
    .description('Load config from a JSON file')
    .argument('<file-path>', 'Path to JSON config file')
    .action(runConfigSet);
}

async function runConfigSet(filePath: string): Promise<void> {
  try {
    // Resolve path with ~ expansion and relative path support
    const resolvedPath = resolvePath(filePath);

    // Read the file
    let fileContent: string;
    try {
      fileContent = readFileSync(resolvedPath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`File not found: ${filePath}`);
      }
      if ((error as NodeJS.ErrnoException).code === 'EISDIR') {
        throw new Error(`Path is a directory, not a file: ${filePath}`);
      }
      throw new Error(`Failed to read file: ${(error as Error).message}`);
    }

    // Parse JSON
    let parsedConfig: unknown;
    try {
      parsedConfig = JSON.parse(fileContent);
    } catch (error) {
      throw new Error(`Invalid JSON in file: ${(error as Error).message}`);
    }

    // Validate config
    const newConfig = validateConfig(parsedConfig);

    // Create backup of current config with timestamp
    const currentConfig = loadConfig();
    const configPath = getConfigPath();
    const timestamp = new Date().toISOString();
    const backupPath = configPath.replace(/\.json$/, `.backup.${timestamp}.json`);

    try {
      mkdirSync(configPath.split('/').slice(0, -1).join('/'), { recursive: true });
      writeFileSync(backupPath, JSON.stringify(currentConfig, null, 2) + '\n', 'utf-8');
    } catch (error) {
      throw new Error(`Failed to create backup: ${(error as Error).message}`);
    }

    // Save new config
    saveConfig(newConfig);

    console.log(chalk.green('✓ Config loaded successfully'));
    console.log(chalk.gray(`  Backup saved: ${backupPath}`));
  } catch (error) {
    console.error(chalk.red(`✗ Error: ${(error as Error).message}`));
    process.exit(1);
  }
}

function resolvePath(filePath: string): string {
  // Expand tilde
  let expanded = filePath;
  if (filePath.startsWith('~')) {
    expanded = filePath.replace(/^~/, homedir());
  }

  // Resolve relative paths from current working directory
  return resolve(expanded);
}
```

**Step 2: Verify file was created and is syntactically valid**

Run: `pnpm typecheck` (should pass with no errors in the new file)

**Step 3: Commit**

```bash
git add src/commands/config/set.ts
git commit -m "feat: create config set command with validation and backup"
```

---

### Task 3: Wire the set command into the config command

**Files:**
- Modify: `src/commands/config/index.ts`

**Step 1: Update the config command index to import and add the set command**

Replace the contents of `src/commands/config/index.ts`:

```typescript
import { Command } from 'commander';
import { configExportCommand } from './export.js';
import { configSetCommand } from './set.js';

export function configCommand(): Command {
  const cmd = new Command('config').description('Manage local config');
  cmd.addCommand(configExportCommand());
  cmd.addCommand(configSetCommand());
  return cmd;
}
```

**Step 2: Verify the file is syntactically valid**

Run: `pnpm typecheck` (should pass)

**Step 3: Commit**

```bash
git add src/commands/config/index.ts
git commit -m "feat: add config set command to config command group"
```

---

### Task 4: Build and manually test the implementation

**Files:**
- No new files, just testing

**Step 1: Build the project**

Run: `pnpm build`

Expected output: Build completes successfully, `dist/index.js` created

**Step 2: Test with a valid config file**

Create a temporary test config:

```bash
cat > /tmp/test-config.json << 'EOF'
{
  "gitlabUrl": "https://gitlab.company.com",
  "environments": [
    { "name": "develop", "order": 0 },
    { "name": "staging", "order": 1 },
    { "name": "production", "order": 2 }
  ],
  "groups": {
    "web": {
      "projects": [
        {
          "externalId": "1",
          "name": "frontend",
          "fullPath": "org/frontend",
          "branchMap": {
            "develop": "develop",
            "staging": "release/staging",
            "production": "release/prod"
          }
        }
      ]
    }
  }
}
EOF
```

Run: `./dist/index.js config set /tmp/test-config.json`

Expected output:
```
✓ Config loaded successfully
  Backup saved: /Users/sevrainchea/.husgit/config.backup.2026-02-19T...json
```

**Step 3: Verify config was updated**

Run: `./dist/index.js config export`

Expected output: Should show the new config with GitLab URL, environments, and groups

**Step 4: Test with invalid JSON**

Create invalid JSON file:

```bash
echo "{ invalid json" > /tmp/bad.json
```

Run: `./dist/index.js config set /tmp/bad.json`

Expected output:
```
✗ Error: Invalid JSON in file: Unexpected token...
```

**Step 5: Test with missing required field**

Create config missing environments:

```bash
cat > /tmp/bad-config.json << 'EOF'
{
  "gitlabUrl": "https://gitlab.com",
  "groups": {}
}
EOF
```

Run: `./dist/index.js config set /tmp/bad-config.json`

Expected output:
```
✗ Error: Config field "environments" must be an array
```

**Step 6: Test with non-existent file**

Run: `./dist/index.js config set /tmp/nonexistent.json`

Expected output:
```
✗ Error: File not found: /tmp/nonexistent.json
```

**Step 7: Test with ~ path expansion**

Create test file in home directory:

```bash
cat > ~/test-husgit-config.json << 'EOF'
{
  "environments": [
    { "name": "dev", "order": 0 }
  ],
  "groups": {}
}
EOF
```

Run: `./dist/index.js config set ~/test-husgit-config.json`

Expected output: Success message with backup path

Run: `rm ~/test-husgit-config.json`

**Step 8: Commit test success**

```bash
git add -A
git commit -m "test: verify config set command works with valid/invalid inputs"
```

---

## Summary

The implementation adds a new `husgit config set <file-path>` command that:
- Loads a complete config from a JSON file
- Validates strictly against the HusgitConfig schema
- Creates timestamped backups automatically
- Supports ~ expansion and relative paths
- Provides clear error messages for validation failures

All changes follow existing code patterns and maintain type safety with TypeScript strict mode.
