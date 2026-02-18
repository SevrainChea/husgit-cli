import { createProgram } from './cli.js';
import { interactiveMenu } from './commands/interactive.js';

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    await interactiveMenu();
  } else {
    const program = createProgram();
    await program.parseAsync(process.argv);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
