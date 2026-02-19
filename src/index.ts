import { createProgram } from './cli.js';
import { interactiveMenu } from './commands/interactive.js';
import { checkVersion } from './services/versionChecker.js';
import { promptForUpdate, showUpdateWarning } from './ui/updatePrompt.js';

async function main() {
  const args = process.argv.slice(2);

  // Check for skip flags
  const skipUpdateCheck =
    process.env.HUSGIT_SKIP_UPDATE_CHECK === '1' ||
    args.includes('--skip-update-check');

  // Perform version check if not skipped
  if (!skipUpdateCheck) {
    try {
      const versionCheck = checkVersion();

      if (versionCheck.updateAvailable) {
        const choice = await promptForUpdate(
          versionCheck.currentVersion,
          versionCheck.latestVersion
        );

        // Show warning banner if user declined
        if (choice.action === 'decline') {
          showUpdateWarning(
            versionCheck.currentVersion,
            versionCheck.latestVersion
          );
        }
      }
    } catch (error) {
      // Silently ignore version check errors
      // Never let update check break the CLI
    }
  }

  // Remove the skip flag from args so it doesn't confuse Commander
  const filteredArgs = args.filter(arg => arg !== '--skip-update-check');

  if (filteredArgs.length === 0) {
    await interactiveMenu();
  } else {
    const program = createProgram();
    await program.parseAsync(['node', 'husgit', ...filteredArgs]);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
