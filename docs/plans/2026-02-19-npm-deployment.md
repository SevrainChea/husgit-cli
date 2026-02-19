# npm Deployment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Set up automated npm deployment with pre-publish checks and a single `pnpm release <bump>` command for safe version management.

**Architecture:** Add a Node.js release script that runs typecheck → format verification → build, then (if all pass) bumps version via `npm version` and publishes to npm. The script supports dry-run mode for previewing. Documentation updates guide users on manual version management.

**Tech Stack:** Node.js (script execution), npm (version bumping and publishing), existing build tools (tsc, prettier, tsup)

---

## Task 1: Create Release Script

**Files:**
- Create: `scripts/release.js`

**Step 1: Write the release script**

Create `scripts/release.js` with the following content:

```javascript
#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const versionBump = args[0];

const validBumps = ['patch', 'minor', 'major'];

// Helper function to run commands
function runCommand(command, description, allowFail = false) {
  console.log(`\n📋 ${description}...`);
  try {
    execSync(command, { stdio: 'inherit' });
    console.log(`✅ ${description} passed`);
  } catch (error) {
    if (!allowFail) {
      console.error(`\n❌ ${description} failed. Aborting release.`);
      process.exit(1);
    }
  }
}

// Validate input
if (!versionBump || !validBumps.includes(versionBump)) {
  console.error(
    `\nUsage: pnpm release [patch|minor|major] [--dry-run]\n`
  );
  console.error(`Valid version bumps: ${validBumps.join(', ')}`);
  process.exit(1);
}

console.log(`\n🚀 Starting release process (${dryRun ? 'DRY RUN' : 'LIVE'})...`);
console.log(`Version bump: ${versionBump}`);

// Run pre-publish checks
runCommand('pnpm typecheck', 'Type checking');
runCommand('pnpm format', 'Format check (running prettier)');
runCommand('pnpm build', 'Building package');

if (dryRun) {
  console.log(`\n🔍 DRY RUN: Would bump version to ${versionBump} and publish.`);
  console.log('Run without --dry-run to actually publish.\n');
  process.exit(0);
}

// Perform version bump and publish
console.log(`\n📦 Bumping version...`);
try {
  execSync(`npm version ${versionBump}`, { stdio: 'inherit' });
} catch (error) {
  console.error('\n❌ Version bump failed. Aborting release.');
  process.exit(1);
}

console.log(`\n📤 Publishing to npm...`);
try {
  execSync('npm publish', { stdio: 'inherit' });
  console.log('\n✅ Release complete! Package published to npm.');
} catch (error) {
  console.error('\n❌ Publish failed.');
  console.error('Your local changes and git tag may still exist.');
  process.exit(1);
}
```

**Step 2: Make the script executable**

Run: `chmod +x scripts/release.js`

**Step 3: Verify the script exists**

Run: `ls -la scripts/release.js`

Expected: File should exist with execute permissions.

**Step 4: Commit**

```bash
git add scripts/release.js
git commit -m "feat: add release script with pre-publish checks"
```

---

## Task 2: Update package.json Scripts

**Files:**
- Modify: `package.json`

**Step 1: Add release scripts to package.json**

In the `"scripts"` section, add these two lines:

```json
"release": "node scripts/release.js",
"release:dry": "node scripts/release.js --dry-run"
```

The full scripts section should look like:

```json
"scripts": {
  "build": "tsup",
  "dev": "tsup --watch",
  "format": "prettier --write 'src/**/*.ts'",
  "typecheck": "tsc --noEmit",
  "prepublishOnly": "pnpm build && pnpm typecheck",
  "release": "node scripts/release.js",
  "release:dry": "node scripts/release.js --dry-run"
}
```

**Step 2: Verify package.json is valid JSON**

Run: `pnpm install --dry-run` or `cat package.json | jq .`

Expected: No JSON parse errors.

**Step 3: Commit**

```bash
git add package.json
git commit -m "feat: add release and release:dry npm scripts"
```

---

## Task 3: Update README with Publishing Documentation

**Files:**
- Modify: `README.md`

**Step 1: Add Publishing section to README**

After the "Config" section (line 98-100), add this new section:

```markdown
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

```

**Step 2: Verify the README is readable**

Run: `head -n 120 README.md | tail -n 30`

Expected: Your new Publishing section should be visible.

**Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add publishing and version management guide"
```

---

## Task 4: Test the Release Script (Dry Run)

**Files:**
- No new files

**Step 1: Run the release script with help**

Run: `node scripts/release.js`

Expected: Usage error showing valid bumps (patch, minor, major).

**Step 2: Run a dry-run release**

Run: `pnpm release:dry patch`

Expected: Script should:
- Run typecheck (passes)
- Run format (passes)
- Run build (passes)
- Print "DRY RUN: Would bump version to patch and publish"
- Exit without actually changing version

**Step 3: Verify package.json version is unchanged**

Run: `grep '"version"' package.json`

Expected: Version should still be `0.1.1` (not bumped).

**Step 4: No commit needed** (this was a test run)

---

## Summary

After completing all tasks:
- ✅ Release script created at `scripts/release.js`
- ✅ npm scripts added to `package.json` (`release`, `release:dry`)
- ✅ Publishing documentation added to `README.md`
- ✅ Release script tested in dry-run mode
- ✅ All changes committed to git

Users can now safely publish with `pnpm release <bump>` with pre-publish checks.
