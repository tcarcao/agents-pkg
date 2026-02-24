# agent-pkg — Architecture and extension guide

agent-pkg is a wrapper around the skills CLI for Cursor and Claude. This document describes how the code is structured and how to extend it so the design stays aligned with the main skills CLI.

## Architecture

```
agent-pkg/
├── src/
│   ├── cli.ts              # Single entry: argv → switch (command) → run*()
│   ├── subagents.ts         # runSubagentsList, runSubagentsAdd, runSubagentsRemove
│   ├── commands.ts         # runCommandsList, runCommandsAdd, runCommandsRemove
│   ├── agents.ts           # runAgentsList, runAgentsAdd, runAgentsRemove
│   ├── config.ts           # runConfigPath
│   └── lib/
│       ├── constants.ts    # AGENTS_DIR, LOCK_FILE, DEFAULT_AGENTS, passthrough lists
│       ├── types.ts        # LockFile, AgentEntry, ParsedGlobalOptions
│       ├── errors.ts       # fatal(message) for user-facing exit
│       ├── options.ts      # parseGlobal(args)
│       ├── lock.ts         # readLock, writeLock, getLockPath (uses constants + types)
│       ├── paths.ts        # Cursor/Claude project and global dirs
│       ├── source.ts       # resolveSourceToContent (local, URL, GitHub shorthand)
│       ├── skills-passthrough.ts  # runSkills(), SKILLS_PASSTHROUGH_COMMANDS
│       ├── markdown-dirs.ts      # listMdInDir, addMdToDirs, removeMdFromDirs, resolveDirs
│       ├── subagents.ts    # list/add/remove .md in agent dirs (uses markdown-dirs)
│       └── commands.ts     # list/add/remove .md in command dirs (uses markdown-dirs)
├── test/
└── bin/
```

**Flow**

- Entry is `cli.ts` only. It parses `argv`, then uses a single `switch (command)` and delegates to `run*` (and optional `parse*`) functions in command modules.
- No business logic lives in `cli.ts`; command modules own validation, calling lib, and calling `fatal()` on error.
- Shared types and constants live in `lib/types.ts` and `lib/constants.ts`. Lock file uses version + "empty on missing/old version" semantics (same idea as skills).
- Skills is invoked via `runSkills(command, rest)` for pass-through commands; default `--agent cursor claude-code` is injected when appropriate.

## Adding a new command

1. **Add a case in `cli.ts`**  
   In `main()`, add a `case 'mycmd':` (and aliases if needed). Call your runner, e.g. `await runMycmd(rest); break;`.

2. **Implement the runner**  
   Create a new module (e.g. `src/mycmd.ts`) that exports:
   - `runMycmd(args: string[]): Promise<void>`  
   Optionally also `parseMycmdOptions(args: string[])` if you need structured flags.
   - Use `fatal(message)` from `lib/errors.js` for usage or validation errors so the process exits with a clear message.

3. **Wire subcommands if needed**  
   If the command has subcommands (like `subagents list | add | remove`), either:
   - Handle them in the same module with a small sub-switch and `runMycmdList()`, `runMycmdAdd(args)`, etc., or
   - Export a `parseMycmdSubcommand(rest)` that returns `{ sub, args }` and branch in `cli.ts` (like subagents/commands/agents).

4. **Update help**  
   Update `showBanner()` in `cli.ts` so `agent-pkg --help` documents the new command.

## Adding a new "resource" (like subagents/commands)

If the feature is "list / add / remove markdown files in several directories":

1. **Add path getters**  
   In `lib/paths.ts` (or a dedicated module), add functions that return the dir paths for project and global, e.g. `getCursorRulesDir(global, cwd)`.

2. **Use the markdown-dirs helper**  
   Create a new lib module (e.g. `lib/rules.ts`) that:
   - Defines a `GetDirsFn[]` array (like `AGENT_DIRS` in subagents).
   - Uses `listMdInDir`, `resolveDirs`, `resolveAllDirs`, `addMdToDirs`, `removeMdFromDirs` from `lib/markdown-dirs.js`.
   - Exposes `listRules()`, `addRule(name, source, options)`, `removeRule(name, options)` with the same options shape (`cwd`, `global`) as subagents/commands.

3. **Add a command module and CLI case**  
   Create e.g. `src/rules.ts` with `runRulesList()`, `runRulesAdd(args)`, `runRulesRemove(args)` (and optionally `parseRulesSubcommand`). In `cli.ts`, add `case 'rules':` and branch on subcommand, calling these runners.

4. **Document in help**  
   Update `showBanner()` in `cli.ts`.

## Code style and patterns

- **Errors:** Use `fatal(message)` from `lib/errors.js` for user-facing failures. Do not throw for "show message and exit" flows.
- **Lock file:** Read via `readLock()`; treat missing or old version as empty. Write with `writeLock(lock)`. Schema and version are defined in `lib/types.ts` and `lib/constants.ts`.
- **Options:** Use `parseGlobal(args)` from `lib/options.js` when a command supports `-g` / `--global`.
- **Skills pass-through:** The list of commands that delegate to `npx skills` and the logic for injecting `--agent` live in `lib/skills-passthrough.ts`. Extend there if you add or change pass-through behavior.

## Install from source

When the first argument is not a command (`skills`, `subagents`, `commands`) and not `--help`/`--version`, it is treated as a **source**. agent-pkg resolves the source to a local directory (clone to temp for GitHub/URL, or use path for local), then installs from it according to `--skills`, `--subagents`, `--commands` (default: all). See `src/install-from-source.ts` and `lib/source-dir.ts`. Repo layout convention: `skills/`, `agents/`, `commands/` (see constants `REPO_SKILLS_DIR`, `REPO_AGENTS_DIR`, `REPO_COMMANDS_DIR` in `lib/constants.ts`).

Keeping a single entry point, delegated runners, shared types/constants, and a small set of lib helpers makes agent-pkg easy to extend and consistent with the main skills CLI philosophy.
