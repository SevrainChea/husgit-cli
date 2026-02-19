#!/usr/bin/env node

import { execSync } from 'child_process';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const versionBump = args.find(arg => arg !== '--dry-run');

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
