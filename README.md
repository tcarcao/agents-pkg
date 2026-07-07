# agents-pkg

**Cursor-only** marketplace installer. Install plugins from a source (repo URL or local path) that contains `.cursor-plugin/marketplace.json`.

- **Global (default)** — Full plugin trees sync to `~/.cursor/plugins/local/<plugin-name>/` for Cursor’s native plugin loader (skills, agents, commands, rules, hooks, MCP via each plugin’s `plugin.json`).
- **Project (`--project`)** — Plugin content is copied to a store and **symlinked** into the project’s `.cursor/` dirs; hooks and MCP are merged into project `.cursor/hooks.json` and `.cursor/mcp.json`.

By default, installs are **global** (`~/.cursor/plugins/local/`). Use `--project` for the legacy flattened install into the current project’s `.cursor/`.

---

## Install

```bash
npm install -g agents-pkg
# or
pnpm add -g agents-pkg
# or run without installing
npx agents-pkg --help
```

**Requires:** Node.js 18+

---

## Config

| Item | Location |
|------|----------|
| Lock file | `~/.agents/.agents-pkg-lock.json` |
| Global plugins | `~/.cursor/plugins/local/<plugin-name>/` (or `$CURSOR_LOCAL_PLUGINS`) |
| Project store | `~/.agents/agents-pkg/marketplace/<name>/<plugin-name>/` (`--project` only) |

Override home for tests: set `AGENTS_PKG_HOME` to a temp directory. Override global plugin root: set `CURSOR_LOCAL_PLUGINS`.

---

## Usage

### Add a marketplace

```bash
agents-pkg add-plugin <source> [plugin-name] [--global | --project]
```

- **source** — Repo URL (GitHub `owner/repo`, GitLab, or full URL) or local path.
- **plugin-name** — Optional. Install only this plugin from the marketplace; otherwise all plugins are installed.
- **--global** (default) — Sync each plugin to `~/.cursor/plugins/local/<plugin-name>/`. Enable in Cursor **Settings → Plugins**.
- **--project** — Symlink into the current project’s `.cursor/` (agents, commands, skills, rules); merge hooks/MCP into project `.cursor/`.

Examples:

```bash
agents-pkg add-plugin https://github.com/org/ai-kit
agents-pkg add-plugin ./local-repo --project
agents-pkg add-plugin https://gitlab.com/org/kit my-plugin-name
```

### List installed marketplaces

```bash
agents-pkg list
```

Shows each installed marketplace with its version, scope (global/project), source, and plugin names.

### Remove one plugin from a marketplace

```bash
agents-pkg del-plugin <marketplace-name> <plugin-name>
```

Removes that plugin and updates the lock. Global installs remove `~/.cursor/plugins/local/<plugin-name>/` entirely. Project installs remove symlinks, store copy, and merged hook entries.

### Remove an entire marketplace

```bash
agents-pkg del-marketplace <name>
```

Uninstalls the marketplace and all its plugins. `name` is the marketplace name (e.g. from the manifest’s `name` field).

### Update installed marketplaces

```bash
agents-pkg update
```

Re-fetches each installed marketplace source, reads `.cursor-plugin/marketplace.json`, and reinstalls if the manifest `metadata.version` changed. Global installs re-sync `plugins/local/`; project installs recreate symlinks from the store.

---

## Marketplace format

The source must contain **`.cursor-plugin/marketplace.json`** at its root. Example:

```json
{
  "name": "ai-engineering-kit",
  "owner": { "name": "My Org" },
  "metadata": {
    "description": "Internal AI engineering kit.",
    "version": "0.1.0"
  },
  "plugins": [
    { "name": "ai-kit-global", "source": "./global", "description": "Shared skills, commands, agents, rules." },
    { "name": "ai-kit-backend", "source": "./backend", "description": "Backend-specific." }
  ]
}
```

- **name** — Marketplace id; used in the lock and as the store parent.
- **metadata.version** — Used to decide when to reinstall on `agents-pkg update`.
- **plugins** — Array of `{ name, source, description? }`. `source` is relative to the repo root (e.g. `./global`).

Inside each plugin directory (e.g. `./global`), use this layout:

| Category | Dir / file | Contents |
|----------|------------|----------|
| Agents | `agents/` | One `.md` file per agent; filename (without `.md`) is the name. |
| Commands | `commands/` | One `.md` file per command. |
| Skills | `skills/` | One subdir per skill; each must contain `SKILL.md`. |
| Rules | `rules/` | Top-level `.md` or `.mdc` rule files. |
| Hooks | `hooks/hooks.json` | Cursor-style `{ "version": 1, "hooks": { ... } }`. Global: loaded from plugin package; project: merged into `.cursor/hooks.json`. |

Missing dirs are skipped.

---

## Where things are installed

With **--global** (default):

| Kind | Location |
|------|----------|
| Full plugin package | `~/.cursor/plugins/local/<plugin-name>/` |

Hooks, MCP, skills, agents, and commands are declared in each plugin’s `.cursor-plugin/plugin.json` and loaded by Cursor when the plugin is enabled.

With **--project**:

| Kind | Location |
|------|----------|
| Agents | `<project>/.cursor/agents/` |
| Commands | `<project>/.cursor/commands/` |
| Skills | `<project>/.cursor/skills/` |
| Rules | `<project>/.cursor/rules/` |
| Hooks | `<project>/.cursor/hooks.json` (merged) |

---

## Development

TypeScript, build to `dist/`, tests with Vitest.

```bash
pnpm install
pnpm build          # Compile src/ → dist/
pnpm dev -- --help   # Run from source (tsx)
pnpm test            # pretest runs build, then vitest
pnpm type-check      # tsc --noEmit
```

### CI and publishing

- **CI** (`.github/workflows/ci.yml`): On push/PR to `main`, runs type-check, build, and tests.
- **Publish** (`.github/workflows/publish.yml`): Version bump and npm publish (e.g. via `[patch]` / `[minor]` in commit message or manual workflow run). Add **NPM_TOKEN** secret for npm publish.

---

## License

MIT
