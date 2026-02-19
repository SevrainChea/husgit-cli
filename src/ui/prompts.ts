import { input, select, confirm, search } from '@inquirer/prompts';

export async function promptInput(
  message: string,
  defaultValue?: string,
): Promise<string> {
  return input({ message, default: defaultValue });
}

export async function promptSelect<T extends string>(
  message: string,
  choices: { name: string; value: T; description?: string }[],
): Promise<T> {
  return select({ message, choices });
}

export async function promptConfirm(
  message: string,
  defaultValue = true,
): Promise<boolean> {
  return confirm({ message, default: defaultValue });
}

export async function promptSearch<T>(
  message: string,
  source: (term: string) => Promise<{ name: string; value: T }[]>,
): Promise<T> {
  return search({
    message,
    source: async (term) => source(term || ''),
  });
}
