# AGENTS.md

This file provides guidance to AI coding agents working on the `agents-pkg` CLI codebase.

## Project Overview

`agents-pkg` is a **Cursor-only** marketplace installer. It installs plugins from a source (repo URL or local path) that contains `.cursor-plugin/marketplace.json`. Plugin content is copied to `~/.agents/agents-pkg/marketplace/<name>/<plugin-name>/` and **symlinked** into `.cursor/agents`, `.cursor/commands`, `~/.cursor/skills`, `.cursor/rules`; hooks are merged into `.cursor/hooks.json`. Use `agents-pkg update` to re-fetch each installed marketplace and reinstall when the manifest version changed.

## Commands

| Command | Description |
| ------- | ----------- |
| `agents-pkg` | Show banner with available commands |
| `agents-pkg add-plugin <source> [plugin-name]` | Install marketplace from source (reads `.cursor-plugin/marketplace.json` inside source); all plugins or one by name |
| `agents-pkg list` | List installed marketplaces and their plugins (name, version, scope, source, plugin names) |
| `agents-pkg del-plugin <marketplace> <plugin>` | Remove one plugin from a marketplace (remove its symlinks, delete its store dir, update lock; remove marketplace entry if last plugin) |
| `agents-pkg del-marketplace <name>` | Uninstall entire marketplace by name (remove symlinks, delete store, update lock) |
| `agents-pkg update` | For each installed marketplace, re-fetch source, read `.cursor-plugin/marketplace.json`, reinstall if version changed |

## Marketplace format

The marketplace manifest lives **inside the source** at **`.cursor-plugin/marketplace.json`** (Cursor-only). Example:

```json
{
  "name": "ai-engineering-kit",
  "owner": { "name": "OLX" },
  "metadata": {
    "description": "Internal AI engineering kit.",
    "version": "0.1.0"
  },
  "plugins": [
    { "name": "ai-engineering-kit-global", "source": "./global", "description": "Shared skills, commands, and agents." },
    { "name": "ai-engineering-kit-backend", "source": "./backend", "description": "Backend-specific." }
  ]
}
```

- **name** (required): Marketplace name; used as lock key and store parent.
- **metadata.version**: Used for update check; reinstall when it changes.
- **plugins**: Array of `{ name, source, description? }`. `source` is relative to the repo root (e.g. `./global`).

## Architecture

```
src/
├── cli.ts                 # Main entry: add-plugin, list, del-plugin, del-marketplace, update, --help, --version
├── add-plugin.ts          # runAddPlugin(), installMarketplaceFromDir(); resolve source → read manifest → copy to store → symlink
├── list.ts                # runList(); list installed marketplaces and plugins
├── del-marketplace.ts     # runDelMarketplace(); remove symlinks, delete store, update lock
├── del-plugin.ts          # runDelPlugin(); remove one plugin from a marketplace
├── update.ts              # runUpdate(); per marketplace resolve source, read manifest, reinstall if version changed
└── lib/
    ├── constants.ts       # AGENTS_DIR, LOCK_FILE, MARKETPLACE_DIR, MARKETPLACE_JSON, REPO_* dirs
    ├── types.ts           # LockFile, MarketplaceEntry
    ├── marketplace.ts     # readMarketplaceManifest(sourceDir), getMarketplaceStorePath, getPluginStorePath
    ├── symlink.ts         # createSymlink, removeSymlinksInDirPointingUnder
    ├── source-dir.ts      # resolveSourceToDir (clone or resolve path; local + GitLab + GitHub)
    ├── lock.ts            # readLock, writeLock, getLockPath, getHome
    ├── paths.ts           # getCursorSubagentsDir, getCursorCommandsDir, getCursorSkillsDir, getCursorRulesDir, getCursorHooksPath
    ├── hooks.ts           # mergeHooksIntoProject (used during add-plugin)
    └── errors.ts          # fatal(message)
```

## Store and symlinks

- **Store:** `~/.agents/agents-pkg/marketplace/<marketplace-name>/<plugin-name>/` — copied from source (e.g. `./global`).
- **Symlinks:** Each plugin’s `agents/*.md`, `commands/*.md`, `skills/<dir>/`, and `rules/*.md` / `rules/*.mdc` are symlinked into project `.cursor/agents`, project `.cursor/commands`, global `~/.cursor/skills`, and project `.cursor/rules`. Hooks from `hooks/hooks.json` are **merged** into project `.cursor/hooks.json` (no symlink).
- **Sources:** Local paths and GitLab/GitHub (full URL or shorthand). No API dependency for update—clone and read file.

## Lock file (v1)

- `version: 1`, `marketplaces: { "<name>": { name, source, version, pluginNames, updatedAt } }`.
- Missing or invalid lock returns empty (version 1, marketplaces empty).

## Key integration points

| Feature | Implementation |
| ------- | -------------- |
| add-plugin | `src/add-plugin.ts`: resolveSourceToDir → readMarketplaceManifest(dir) → copy plugin dirs to store → createSymlink for agents/commands/skills/rules, mergeHooksIntoProject for hooks → writeLock |
| list | `src/list.ts`: readLock, print each marketplace (name, version, scope, source, plugin names) |
| del-plugin | `src/del-plugin.ts`: remove one plugin’s symlinks and store (getPluginStorePath); update lock pluginNames; remove marketplace entry if last plugin |
| del-marketplace | `src/del-marketplace.ts`: removeSymlinksInDirPointingUnder for agents/commands/skills/rules; rm store; update lock |
| update | `src/update.ts`: for each lock.marketplaces, resolve source to dir, readMarketplaceManifest(dir), if version changed then remove symlinks, rm store, installMarketplaceFromDir, writeLock |
| Source resolution | `lib/source-dir.ts`: resolveSourceToDir (local path, git URL, owner/repo, gitlab.com/owner/repo) |

## Development

```bash
pnpm install
pnpm build
pnpm dev -- --help
pnpm dev add-plugin ./path-to-repo
pnpm dev update
pnpm test
pnpm type-check
```

Tests use the built `dist/cli.js`. Set `AGENTS_PKG_HOME` to a temp dir to avoid touching real `~/.agents/`.

## Code style and patterns

- **Errors:** Use `fatal(message)` from `lib/errors.js` for user-facing failures.
- **Lock file:** Read with `readLock()`; write with `writeLock(lock)`. Schema in `lib/types.ts`.
- **New command:** Add a `case 'mycmd':` in `cli.ts`, implement `runMycmd` in a dedicated module, update `showBanner()`.
