import { Command } from 'commander';
import chalk from 'chalk';
import {
  loadConfig,
  getAllProjects,
  getGroupNames,
} from '../config/manager.js';

type Shell = 'bash' | 'zsh';

export function completionCommand(): Command {
  return new Command('completion')
    .description('Print a shell completion script (bash or zsh)')
    .argument('[shell]', 'Target shell: bash or zsh', 'bash')
    .action((shell: string) => {
      const normalized = shell.toLowerCase();
      if (normalized !== 'bash' && normalized !== 'zsh') {
        console.error(
          chalk.red(`Unsupported shell "${shell}". Use "bash" or "zsh".`),
        );
        process.exitCode = 1;
        return;
      }
      process.stdout.write(buildScript(normalized as Shell));
    });
}

// Hidden helper used by the shell completion script to fetch dynamic values.
export function internalCompleteCommand(): Command {
  return new Command('__complete')
    .description('Internal: emit dynamic completion candidates')
    .argument(
      '<context>',
      'envs | releasable-envs | backportable-envs | groups | projects',
    )
    .helpOption(false)
    .action((context: string) => {
      try {
        const config = loadConfig();
        const sorted = [...config.environments].sort(
          (a, b) => a.order - b.order,
        );
        switch (context) {
          case 'envs':
            sorted.forEach((e) => console.log(e.name));
            return;
          case 'releasable-envs':
            sorted.slice(0, -1).forEach((e) => console.log(e.name));
            return;
          case 'backportable-envs':
            sorted.slice(1).forEach((e) => console.log(e.name));
            return;
          case 'groups':
            getGroupNames(config).forEach((g) => console.log(g));
            return;
          case 'projects':
            getAllProjects(config).forEach((p) => console.log(p.fullPath));
            return;
          default:
            // Unknown context — emit nothing so the shell shows no suggestions.
            return;
        }
      } catch {
        // If config is unreadable, silently emit nothing.
      }
    });
}

function buildScript(shell: Shell): string {
  const bashFunc = bashCompletionFunction();
  if (shell === 'bash') {
    return `${bashFunc}\ncomplete -F _husgit_completions husgit\n`;
  }
  // zsh: enable bashcompinit (assumes compinit is already loaded) then register.
  return `autoload -U +X bashcompinit && bashcompinit\n${bashFunc}\ncomplete -F _husgit_completions husgit\n`;
}

function bashCompletionFunction(): string {
  return `_husgit_completions() {
  local cur prev words cword
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  words=("\${COMP_WORDS[@]}")
  cword=\${COMP_CWORD}

  local top="setup group project release backport status config completion help"

  # husgit <TAB>
  if [[ \${cword} -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "\${top}" -- "\${cur}") )
    return 0
  fi

  local cmd="\${words[1]}"
  local sub="\${words[2]:-}"

  case "\${cmd}" in
    setup)
      if [[ \${cword} -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "flow" -- "\${cur}") )
      fi
      ;;
    group)
      if [[ \${cword} -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "add add-project list remove" -- "\${cur}") )
      elif [[ \${cword} -eq 3 && ( "\${sub}" == "add-project" || "\${sub}" == "remove" ) ]]; then
        local groups=$(husgit __complete groups 2>/dev/null)
        COMPREPLY=( $(compgen -W "\${groups}" -- "\${cur}") )
      fi
      ;;
    project)
      if [[ \${cword} -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "add list remove" -- "\${cur}") )
      elif [[ \${cword} -eq 3 && "\${sub}" == "remove" ]]; then
        local projects=$(husgit __complete projects 2>/dev/null)
        COMPREPLY=( $(compgen -W "\${projects}" -- "\${cur}") )
      elif [[ "\${sub}" == "list" && "\${cur}" == -* ]]; then
        COMPREPLY=( $(compgen -W "--filter --sort" -- "\${cur}") )
      fi
      ;;
    release)
      if [[ "\${prev}" == "--group" ]]; then
        local groups=$(husgit __complete groups 2>/dev/null)
        COMPREPLY=( $(compgen -W "\${groups}" -- "\${cur}") )
      elif [[ "\${cur}" == -* ]]; then
        COMPREPLY=( $(compgen -W "--group --all --projects --title --description --dry-run" -- "\${cur}") )
      elif [[ \${cword} -eq 2 ]]; then
        local envs=$(husgit __complete releasable-envs 2>/dev/null)
        COMPREPLY=( $(compgen -W "\${envs}" -- "\${cur}") )
      fi
      ;;
    backport)
      if [[ "\${prev}" == "--group" ]]; then
        local groups=$(husgit __complete groups 2>/dev/null)
        COMPREPLY=( $(compgen -W "\${groups}" -- "\${cur}") )
      elif [[ "\${cur}" == -* ]]; then
        COMPREPLY=( $(compgen -W "--group --all --projects --title --description --dry-run" -- "\${cur}") )
      elif [[ \${cword} -eq 2 ]]; then
        local envs=$(husgit __complete backportable-envs 2>/dev/null)
        COMPREPLY=( $(compgen -W "\${envs}" -- "\${cur}") )
      fi
      ;;
    status)
      if [[ "\${prev}" == "--group" ]]; then
        local groups=$(husgit __complete groups 2>/dev/null)
        COMPREPLY=( $(compgen -W "\${groups}" -- "\${cur}") )
      elif [[ "\${prev}" == "--sort" ]]; then
        COMPREPLY=( $(compgen -W "Groups Project State Pipeline URL" -- "\${cur}") )
      elif [[ "\${cur}" == -* ]]; then
        COMPREPLY=( $(compgen -W "--group --hide-empty --filter --sort" -- "\${cur}") )
      elif [[ \${cword} -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "release backport" -- "\${cur}") )
      elif [[ \${cword} -eq 3 ]]; then
        local envs=$(husgit __complete envs 2>/dev/null)
        COMPREPLY=( $(compgen -W "\${envs}" -- "\${cur}") )
      fi
      ;;
    config)
      if [[ \${cword} -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "export set" -- "\${cur}") )
      elif [[ "\${sub}" == "set" && \${cword} -eq 3 ]]; then
        COMPREPLY=( $(compgen -f -- "\${cur}") )
      fi
      ;;
    completion)
      if [[ \${cword} -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "bash zsh" -- "\${cur}") )
      fi
      ;;
  esac
  return 0
}
`;
}
