# Config Export Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `husgit config export` that copies the full `~/.husgit/config.json` to the system clipboard and prints it to stdout.

**Architecture:** New `src/commands/config/` namespace with an `export.ts` command and an `index.ts` parent that wires subcommands together — matching the existing `group/` pattern. Clipboard is written via native OS tools (`pbcopy`/`xclip`/`clip`) using `child_process.execSync`, no new dependency.

**Tech Stack:** TypeScript ESM, Commander, chalk, child_process (stdlib)

---

### Task 1: Create `src/commands/config/export.ts`

**Files:**
- Create: `src/commands/config/export.ts`

**Step 1: Create the file**

```typescript
import { Command } from 'commander';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { loadConfig } from '../../config/manager.js';

export function configExportCommand(): Command {
  return new Command('export')
    .description('Copy config to clipboard so it can be shared')
    .action(runConfigExport);
}

async function runConfigExport(): Promise<void> {
  const config = loadConfig();
  const json = JSON.stringify(config, null, 2);

  console.log(json);

  try {
    copyToClipboard(json);
    console.log(chalk.green('\nConfig copied to clipboard.'));
  } catch {
    console.log(chalk.yellow('\nCould not copy to clipboard — paste the output above manually.'));
  }
}

function copyToClipboard(text: string): void {
  const platform = process.platform;
  if (platform === 'darwin') {
    execSync('pbcopy', { input: text });
  } else if (platform === 'win32') {
    execSync('clip', { input: text });
  } else {
    // Linux: try xclip first, then xsel
    try {
      execSync('xclip -selection clipboard', { input: text });
    } catch {
      execSync('xsel --clipboard --input', { input: text });
    }
  }
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm typecheck`
Expected: no errors

---

### Task 2: Create `src/commands/config/index.ts`

**Files:**
- Create: `src/commands/config/index.ts`

**Step 1: Create the parent command**

```typescript
import { Command } from 'commander';
import { configExportCommand } from './export.js';

export function configCommand(): Command {
  const cmd = new Command('config').description('Manage local config');
  cmd.addCommand(configExportCommand());
  return cmd;
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm typecheck`
Expected: no errors

---

### Task 3: Wire into `src/cli.ts`

**Files:**
- Modify: `src/cli.ts`

**Step 1: Add import at top of file (after existing imports)**

```typescript
import { configCommand } from './commands/config/index.js';
```

**Step 2: Register the command (before `return program`)**

```typescript
  // Config
  program.addCommand(configCommand());
```

**Step 3: Verify TypeScript compiles**

Run: `pnpm typecheck`
Expected: no errors

---

### Task 4: Add to interactive menu

**Files:**
- Modify: `src/commands/interactive.ts`

**Step 1: Add 'config' to the MenuAction type**

Find:
```typescript
type MenuAction =
  | 'setup'
  | 'groups'
  | 'release'
  | 'backport'
  | 'status'
  | 'exit';
```

Replace with:
```typescript
type MenuAction =
  | 'setup'
  | 'groups'
  | 'release'
  | 'backport'
  | 'status'
  | 'config'
  | 'exit';
```

**Step 2: Add menu option (before Exit)**

Find:
```typescript
    { name: 'Exit', value: 'exit' },
```

Add before it:
```typescript
    { name: 'Export Config', value: 'config' },
```

**Step 3: Add case to switch statement (before `case 'exit'`)**

```typescript
    case 'config': {
      const { configExportCommand } = await import('./config/export.js');
      const cmd = configExportCommand();
      await cmd.parseAsync(['node', 'husgit', 'export']);
      break;
    }
```

**Step 4: Verify TypeScript compiles**

Run: `pnpm typecheck`
Expected: no errors

---

### Task 5: Build and smoke-test

**Step 1: Build**

Run: `pnpm build`
Expected: `ESM ⚡️ Build success`

**Step 2: Smoke-test the CLI command**

Run: `./dist/index.js config export`
Expected:
- JSON of `~/.husgit/config.json` printed to terminal
- `Config copied to clipboard.` printed in green (macOS)

**Step 3: Verify `--help` works**

Run: `./dist/index.js config --help`
Expected: shows `export` subcommand listed

**Step 4: Commit**

```bash
git add src/commands/config/export.ts src/commands/config/index.ts src/cli.ts src/commands/interactive.ts
git commit -m "feat: add husgit config export command"
```
