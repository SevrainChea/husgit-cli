import { createProgram } from './cli.js';
import { interactiveMenu } from './commands/interactive.js';
import { checkVersion } from './services/versionChecker.js';
import { promptForUpdate, showUpdateWarning } from './ui/updatePrompt.js';

async function main() {
  const args = process.argv.slice(2);

  const skipUpdateCheck =
    process.env.HUSGIT_SKIP_UPDATE_CHECK === '1' ||
    args.includes('--skip-update-check');

  if (!skipUpdateCheck) {
    try {
      const versionCheck = checkVersion();

      if (versionCheck.updateAvailable) {
        const choice = await promptForUpdate(
          versionCheck.currentVersion,
          versionCheck.latestVersion,
        );

        if (choice.action === 'decline') {
          showUpdateWarning(
            versionCheck.currentVersion,
            versionCheck.latestVersion,
          );
        }
      }
    } catch (error) {}
  }

  const filteredArgs = args.filter((arg) => arg !== '--skip-update-check');

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
