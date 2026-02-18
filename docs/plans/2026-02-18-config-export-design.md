# Design: `husgit config export`

**Date:** 2026-02-18

## Problem

Users want to share their `~/.husgit/config.json` with teammates. Currently there is no way to do this from the CLI — they must manually open and copy the file.

## Solution

Add a `husgit config export` command that copies the full config JSON to the system clipboard and also prints it to stdout.

## Command Shape

```
husgit config export
```

No flags. Always exports the full config (gitlabUrl + environments + groups).

## Behavior

1. Read `~/.husgit/config.json`
2. Pretty-print the JSON
3. Copy it to the system clipboard via native OS tool (`pbcopy` / `xclip` / `clip`)
4. Print the JSON to stdout
5. Print: `Config copied to clipboard.`

**Error handling:**
- No config → clear error message, exit
- Clipboard tool unavailable → warn, but still print to stdout so the user can copy manually

## Clipboard Mechanics

No new runtime dependency. Use `child_process.execSync` to pipe to:
- macOS: `pbcopy`
- Linux: `xclip -selection clipboard` (fallback: `xsel --clipboard --input`)
- Windows: `clip`

Detect platform via `process.platform`.

## Files Changed

| File | Change |
|------|--------|
| `src/commands/config/export.ts` | New — the export command |
| `src/commands/config/index.ts` | New — `configCommand()` parent Commander group |
| `src/cli.ts` | Add `configCommand()` to program |
| `src/commands/interactive.ts` | Add "Export config" entry to interactive menu |

## Future

A companion `husgit config import` command (reads JSON from stdin or a file path and writes to `~/.husgit/config.json`) would complete the share workflow.
