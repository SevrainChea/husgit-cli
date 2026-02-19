import { select } from '@inquirer/prompts';
import chalk from 'chalk';

interface UpdateChoice {
  action: 'install' | 'skip' | 'decline';
  packageManager?: 'npm' | 'pnpm' | 'yarn';
}

const INSTALL_COMMANDS = {
  npm: 'npm install -g husgit-cli@latest',
  pnpm: 'pnpm add -g husgit-cli@latest',
  yarn: 'yarn global add husgit-cli@latest',
};

export async function promptForUpdate(
  currentVersion: string,
  latestVersion: string
): Promise<UpdateChoice> {
  console.log(
    chalk.blue(
      `\n📦 Update available: husgit-cli ${latestVersion} (current: ${currentVersion})\n`
    )
  );

  try {
    const action = await select({
      message: 'What would you like to do?',
      choices: [
        { name: 'Install now', value: 'install' },
        { name: 'Skip for now', value: 'skip' },
        { name: 'Do not show again', value: 'decline' },
      ],
    });

    if (action === 'install') {
      let packageManager: 'npm' | 'pnpm' | 'yarn';
      try {
        packageManager = await select<'npm' | 'pnpm' | 'yarn'>({
          message: 'Choose your package manager:',
          choices: [
            { name: 'npm', value: 'npm' },
            { name: 'pnpm', value: 'pnpm' },
            { name: 'yarn', value: 'yarn' },
          ],
        });
      } catch {
        // If user cancels package manager selection, treat as skip
        return { action: 'skip' };
      }

      const command = INSTALL_COMMANDS[packageManager];
      if (!command) {
        console.log(chalk.red('Unknown package manager'));
        return { action: 'decline' };
      }

      console.log(
        chalk.green(`\nRun the following command to update:\n\n  ${command}\n`)
      );

      return { action: 'install', packageManager };
    }

    // At this point action is not 'install', so it must be 'skip' or 'decline'
    if (action === 'skip' || action === 'decline') {
      return { action };
    }
    // Fallback (should never reach)
    return { action: 'decline' };
  } catch {
    // If user interrupts the first prompt, decline the update
    return { action: 'decline' };
  }
}

export function showUpdateWarning(
  currentVersion: string,
  latestVersion: string
): void {
  console.log(
    chalk.yellow(
      `⚠ Update available: husgit-cli ${latestVersion} (current: ${currentVersion}). Run: npm install -g husgit-cli@latest\n`
    )
  );
}
