import {
  input,
  select,
  confirm,
  search,
  checkbox,
  Separator,
} from '@inquirer/prompts';
import {
  createPrompt,
  useState,
  useMemo,
  useKeypress,
  isEnterKey,
  isBackspaceKey,
  isUpKey,
  isDownKey,
  isSpaceKey,
} from '@inquirer/core';
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

const PAGE_SIZE = 15;

type FilterCheckboxConfig = {
  message: string;
  projects: GitlabProject[];
};

const filterCheckboxPrompt = createPrompt<
  GitlabProject[],
  FilterCheckboxConfig
>((config, done) => {
  const [filter, setFilter] = useState('');
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState(0);
  const [status, setStatus] = useState<'idle' | 'done'>('idle');

  const filtered = useMemo(() => {
    const term = filter.toLowerCase();
    return term
      ? config.projects.filter(
          (p) =>
            p.name.toLowerCase().includes(term) ||
            p.fullPath.toLowerCase().includes(term),
        )
      : config.projects;
  }, [filter]);

  useKeypress((key) => {
    if (status === 'done') return;

    if (isEnterKey(key)) {
      const result = config.projects.filter((p) =>
        selectedPaths.has(p.fullPath),
      );
      setStatus('done');
      done(result);
    } else if (key.name === 'escape') {
      setFilter('');
      setCursor(0);
    } else if (isUpKey(key)) {
      if (filtered.length > 0) setCursor(Math.max(0, cursor - 1));
    } else if (isDownKey(key)) {
      if (filtered.length > 0)
        setCursor(Math.min(filtered.length - 1, cursor + 1));
    } else if (isSpaceKey(key)) {
      const item = filtered[cursor];
      if (item) {
        const next = new Set(selectedPaths);
        if (next.has(item.fullPath)) {
          next.delete(item.fullPath);
        } else {
          next.add(item.fullPath);
        }
        setSelectedPaths(next);
      }
    } else if (isBackspaceKey(key)) {
      setFilter(filter.slice(0, -1));
      setCursor(0);
    } else if (
      key.sequence &&
      key.sequence.length === 1 &&
      !key.ctrl &&
      !(key as any).meta
    ) {
      setFilter(filter + key.sequence);
      setCursor(0);
    }
  });

  // Clamp cursor to current filtered length
  const safeCursor = Math.min(cursor, Math.max(0, filtered.length - 1));

  // Paginate: keep cursor centered
  const halfPage = Math.floor(PAGE_SIZE / 2);
  const scrollOffset = Math.max(
    0,
    Math.min(safeCursor - halfPage, filtered.length - PAGE_SIZE),
  );
  const visibleItems = filtered.slice(scrollOffset, scrollOffset + PAGE_SIZE);

  const filterLine = `${chalk.bold('Filter:')} ${filter}▊`;

  const listLines =
    filtered.length === 0
      ? [chalk.yellow('  No projects match filter.')]
      : visibleItems.map((project, i) => {
          const actualIndex = scrollOffset + i;
          const isCursor = actualIndex === safeCursor;
          const isSelected = selectedPaths.has(project.fullPath);
          const checkboxChar = isSelected ? chalk.green('◉') : '◯';
          const pointer = isCursor ? chalk.cyan('❯') : ' ';
          const name = isCursor ? chalk.cyan(project.name) : project.name;
          return `${pointer} ${checkboxChar} ${name}`;
        });

  const scrollInfo =
    filtered.length > PAGE_SIZE
      ? chalk.dim(
          ` (${scrollOffset + 1}–${Math.min(scrollOffset + PAGE_SIZE, filtered.length)} of ${filtered.length})`,
        )
      : '';
  const selectedInfo =
    selectedPaths.size > 0
      ? chalk.green(` · ${selectedPaths.size} selected`)
      : '';
  const hint = chalk.dim(
    '↑↓ navigate  space select  esc clear filter  enter confirm',
  );

  const mainLine = `${chalk.bold(config.message)}\n${filterLine}`;
  const bottomContent =
    listLines.join('\n') + `\n${hint}${scrollInfo}${selectedInfo}`;

  return [mainLine, bottomContent];
});

export async function promptGitlabProjectCheckbox(
  projects: GitlabProject[],
): Promise<GitlabProject[]> {
  if (projects.length === 0) return [];
  return filterCheckboxPrompt({
    message: 'Select projects to add:',
    projects,
  });
}
