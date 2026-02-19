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

  const action = await select({
    message: 'What would you like to do?',
    choices: [
      { name: 'Install now', value: 'install' },
      { name: 'Skip for now', value: 'skip' },
      { name: 'Do not show again', value: 'decline' },
    ],
  });

  if (action === 'install') {
    const packageManager = await select<'npm' | 'pnpm' | 'yarn'>({
      message: 'Choose your package manager:',
      choices: [
        { name: 'npm', value: 'npm' },
        { name: 'pnpm', value: 'pnpm' },
        { name: 'yarn', value: 'yarn' },
      ],
    });

    const command = INSTALL_COMMANDS[packageManager];
    console.log(
      chalk.green(`\nRun the following command to update:\n\n  ${command}\n`)
    );

    return { action: 'install', packageManager };
  }

  return { action: action as 'skip' | 'decline' };
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
