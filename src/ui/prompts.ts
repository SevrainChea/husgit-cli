import {
  input,
  select,
  confirm,
  search,
  checkbox,
  Separator,
} from '@inquirer/prompts';
import chalk from 'chalk';
import type { HusgitConfig, ProjectConfig, GitlabProject } from '../types.js';

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

export async function promptProjectMultiSelect(
  config: HusgitConfig,
  _envName: string,
): Promise<ProjectConfig[]> {
  type ChoiceValue = `group:${string}` | `project:${string}`;

  const choices: (
    | { name: string; value: ChoiceValue }
    | InstanceType<typeof Separator>
  )[] = [];

  const allGroupedPaths = new Set(
    Object.values(config.groups).flatMap((g) => g.projectPaths),
  );

  // Build group sections
  for (const [groupName, group] of Object.entries(config.groups)) {
    if (group.projectPaths.length === 0) continue;

    choices.push(new Separator(`── ${groupName} ──`));
    choices.push({
      name: `[Select all in ${groupName}]`,
      value: `group:${groupName}` as ChoiceValue,
    });

    for (const fullPath of group.projectPaths) {
      const project = config.projects[fullPath];
      if (!project) continue;
      choices.push({
        name: `  ${project.name}`,
        value: `project:${fullPath}` as ChoiceValue,
      });
    }
  }

  // Ungrouped projects
  const ungrouped = Object.values(config.projects).filter(
    (p) => !allGroupedPaths.has(p.fullPath),
  );

  if (ungrouped.length > 0) {
    choices.push(new Separator('── Ungrouped ──'));
    for (const project of ungrouped) {
      choices.push({
        name: `  ${project.name}`,
        value: `project:${project.fullPath}` as ChoiceValue,
      });
    }
  }

  if (choices.filter((c) => !(c instanceof Separator)).length === 0) {
    return [];
  }

  const selected = await checkbox<ChoiceValue>({
    message: 'Select projects:',
    choices,
  });

  // Expand group: selections + union with individual project: selections
  const projectPaths = new Set<string>();

  for (const val of selected) {
    if (val.startsWith('group:')) {
      const groupName = val.slice('group:'.length);
      const group = config.groups[groupName];
      if (group) {
        for (const fp of group.projectPaths) {
          projectPaths.add(fp);
        }
      }
    } else if (val.startsWith('project:')) {
      projectPaths.add(val.slice('project:'.length));
    }
  }

  return Array.from(projectPaths)
    .map((fp) => config.projects[fp])
    .filter((p): p is ProjectConfig => p !== undefined);
}

export async function promptGitlabProjectCheckbox(
  projects: GitlabProject[],
): Promise<GitlabProject[]> {
  if (projects.length === 0) return [];

  const filterTerm = await input({
    message: 'Filter projects (leave blank for all):',
  });

  const term = filterTerm.trim().toLowerCase();
  const filtered = term
    ? projects.filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          p.fullPath.toLowerCase().includes(term),
      )
    : projects;

  if (filtered.length === 0) {
    console.log(chalk.yellow(`No projects match "${filterTerm}".`));
    return [];
  }

  const choices = filtered.map((p) => ({
    name: p.name,
    value: p,
  }));

  return checkbox<GitlabProject>({
    message: 'Select projects to add (space to select, enter to confirm):',
    choices,
    pageSize: 20,
  });
}
