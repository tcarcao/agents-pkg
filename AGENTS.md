# AGENTS.md

This file provides guidance to AI coding agents working on the `agents-pkg` CLI codebase.

## Project Overview

`agents-pkg` is a **Cursor-only** marketplace installer. It installs plugins from a source (repo URL or local path) that contains `.cursor-plugin/marketplace.json`. Plugin content is copied to `~/.agents/agents-pkg/marketplace/<name>/<plugin-name>/`. **Agents** are **copied** into `.cursor/agents` (so Cursor recognizes subagents); **commands**, **skills**, and **rules** are **symlinked** into `.cursor/commands`, `~/.cursor/skills`, `.cursor/rules`. **Hooks** from `hooks/hooks.json` are **merged** into `.cursor/hooks.json` (project or global per `--project`/`--global`); **MCP** from `mcp/mcp.json` is **merged** into `.cursor/mcp.json` under each server’s **original key name** (collisions are skipped with a warning). **MCP entries are not removed** on uninstall; **update** only **updates** keys that already exist in `.cursor/mcp.json` (and runs a one-time rename from legacy prefixed keys). Use `agents-pkg update` to re-fetch each installed marketplace and reinstall when the **marketplace** version changed, or reinstall only plugins whose **plugin** version changed when the marketplace version is unchanged.

## Commands

| Command | Description |
| ------- | ----------- |
| `agents-pkg` | Show banner with available commands |
| `agents-pkg add-plugin <source> [plugin-name...]` | Install marketplace from source (reads `.cursor-plugin/marketplace.json` inside source); all plugins or one or more by name |
| `agents-pkg list` | List installed marketplaces and their plugins (name, version, scope, source, plugin names) |
| `agents-pkg del-plugin <marketplace> <plugin>` | Remove one plugin from a marketplace (remove its agent copies and symlinks, delete its store dir, update lock; remove marketplace entry if last plugin) |
| `agents-pkg del-marketplace <name>` | Uninstall entire marketplace by name (remove agent copies and symlinks, delete store, update lock) |
| `agents-pkg update` | For each installed marketplace, re-fetch source, read manifest. If **marketplace version** changed → full reinstall; if unchanged → uninstall plugins removed from manifest, reinstall only plugins whose **plugin version** changed. |

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
- **metadata.version**: Marketplace version; when it changes, a full reinstall of the marketplace is performed.
- **plugins**: Array of `{ name, source, description?, version? }`. `source` is relative to the repo root (e.g. `./global`). Optional **version** per plugin is used for update diff (manifest wins over plugin dir `.cursor-plugin/plugin.json`).
- **Plugin dir (optional):** A `plugin.json` file at **`.cursor-plugin/plugin.json`** inside the plugin directory (with a top-level `version` field, e.g. `{ "version": "1.0.0" }`) is used when the manifest does not set a version for that plugin.

## Architecture

```
src/
├── cli.ts                 # Main entry: add-plugin, list, del-plugin, del-marketplace, update, --help, --version
├── add-plugin.ts          # runAddPlugin(), installMarketplaceFromDir(); resolve source → read manifest → copy to store → copy agents, symlink rest
├── list.ts                # runList(); list installed marketplaces and plugins
├── del-marketplace.ts     # runDelMarketplace(); remove agent copies and symlinks, delete store, update lock
├── del-plugin.ts          # runDelPlugin(); remove one plugin from a marketplace
├── update.ts              # runUpdate(); per marketplace resolve source, read manifest, reinstall if version changed
└── lib/
    ├── constants.ts       # AGENTS_DIR, LOCK_FILE, MARKETPLACE_DIR, MARKETPLACE_JSON, PLUGIN_JSON, REPO_* dirs
    ├── types.ts           # LockFile, MarketplaceEntry
    ├── marketplace.ts     # readMarketplaceManifest, getMarketplaceStorePath, getPluginStorePath, readPluginVersion, getPluginVersionFromSource
    ├── agents-copy.ts     # copyAgentsFromPluginStore, removeCopiedAgentsForPlugin (agents copied so Cursor sees subagents)
    ├── symlink.ts         # createSymlink, removeSymlinksInDirPointingUnder
    ├── source-dir.ts      # resolveSourceToDir (clone or resolve path; local + GitLab + GitHub)
    ├── lock.ts            # readLock, writeLock, getLockPath, getHome
    ├── paths.ts           # getCursorAgentsDir, getCursorCommandsDir, getCursorSkillsDir, getCursorRulesDir, getCursorHooksPath, getCursorMcpPath
    ├── hooks.ts           # mergeHooksInto, removeHookEntries (merge/remove hooks; scope project or global)
    ├── mcp.ts             # readMcpJson, mergeMcpIntoCursor, updateMcpServersInCursor, renameMcpKeys (install merges by original key; update overwrites existing keys only)
    └── errors.ts          # fatal(message)
```

## Store, copies and symlinks

- **Store:** `~/.agents/agents-pkg/marketplace/<marketplace-name>/<plugin-name>/` — copied from source (e.g. `./global`).
- **Agents:** Plugin `agents/*.md` are **copied** into `.cursor/agents` (so Cursor recognizes subagents). On uninstall, those files are removed.
- **Symlinks:** Plugin `commands/*.md`, `skills/<dir>/`, and `rules/*.md` / `rules/*.mdc` are symlinked into project `.cursor/commands`, global `~/.cursor/skills`, and project `.cursor/rules`. **Hooks** from `hooks/hooks.json` are **merged** into project or global `.cursor/hooks.json` (per `--project`/`--global`); the merged entries are recorded in the lock (`pluginHooks`) so they can be removed on uninstall. **MCP** from `mcp/mcp.json` is **merged** into `.cursor/mcp.json` using **original server key names**; if a key already exists, the install **skips** it and warns. The lock stores **`pluginMcpKeys`** per plugin as metadata (original keys only). **Uninstall does not edit** `.cursor/mcp.json`. On **update**, existing keys are **updated** from the manifest; keys the user removed are **not** re-added; **renameMcpKeys** migrates old `plugin:server` and `agents-pkg:...` keys to original names when possible.
- **Sources:** Local paths and GitLab/GitHub (full URL or shorthand). No API dependency for update—clone and read file.

## Lock file (v2)

- `version: 2`, `marketplaces: { "<name>": { name, source, version, pluginNames, updatedAt, global?, pluginHooks?, pluginVersions?, pluginMcpKeys? } }`.
- **v1 migration:** Reading a lock with `version: 1` migrates in memory and **rewrites** the file to v2; `pluginMcpKeys` values like `plugin-a:github` become `github` (plugin prefix stripped).
- `pluginHooks` is optional: `Record<pluginName, Array<{ hookName, command }>>` for hook entries we merged (used for removal on del-plugin/del-marketplace/update).
- `pluginVersions` is optional: `Record<pluginName, string>` for last-installed plugin version (used for update diff; when marketplace version is unchanged, only plugins whose version changed are reinstalled).
- `pluginMcpKeys` is optional: `Record<pluginName, string[]>` of **original** MCP server keys from each plugin’s manifest (e.g. `['github']`); metadata only.
- Missing or invalid lock returns empty (current `version`, marketplaces empty).

## Key integration points

| Feature | Implementation |
| ------- | -------------- |
| add-plugin | `src/add-plugin.ts`: resolveSourceToDir → readMarketplaceManifest(dir) → copy plugin dirs to store → copy agents (agents-copy), createSymlink for commands/skills/rules, mergeHooksInto (return hook entries), mergeMcpIntoCursor with **empty prefix** (warn on key collision) → writeLock with pluginHooks and pluginMcpKeys |
| list | `src/list.ts`: readLock, print each marketplace (name, version, scope, source, plugin names) |
| del-plugin | `src/del-plugin.ts`: removeHookEntries for plugin, removeCopiedAgentsForPlugin, remove plugin symlinks and store; update lock (pluginNames, pluginHooks, pluginMcpKeys); **does not modify** `.cursor/mcp.json` |
| del-marketplace | `src/del-marketplace.ts`: removeHookEntries per plugin, removeCopiedAgentsForPlugin per plugin, removeSymlinksInDirPointingUnder for agents/commands/skills/rules; rm store; update lock; **does not modify** `.cursor/mcp.json` |
| update | `src/update.ts`: rename legacy MCP keys in mcp.json when possible; for each lock.marketplaces, resolve source, read manifest. If **marketplace version** changed → full teardown and reinstall all with `isUpdate` (MCP: update-in-place only). If **unchanged** → remove plugins no longer in manifest; reinstall only plugins whose **plugin version** changed with `isUpdate`. Write lock when any change. |
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
