# agents-pkg

**Cursor-only** marketplace installer. Install plugins from a source (repo URL or local path) that contains `.cursor-plugin/marketplace.json`. Plugin content is copied to a store and **symlinked** into Cursor’s config dirs (agents, commands, skills, rules); hooks are merged into `.cursor/hooks.json`.

- **Agents** — Agent `.md` files in `.cursor/agents` (global or project).
- **Commands** — Slash commands in `.cursor/commands`.
- **Skills** — Skill dirs (each with `SKILL.md`) in `.cursor/skills`.
- **Rules** — Rule `.md`/`.mdc` files in `.cursor/rules`.
- **Hooks** — Cursor lifecycle hooks merged into project `.cursor/hooks.json`.

By default, symlinks are **global** (`~/.cursor/*`). Use `--project` to install into the current project’s `.cursor/` instead.

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
| Store | `~/.agents/agents-pkg/marketplace/<name>/<plugin-name>/` |

Override home for tests: set `AGENTS_PKG_HOME` to a temp directory.

---

## Usage

### Add a marketplace

```bash
agents-pkg add-plugin <source> [plugin-name] [--global | --project]
```

- **source** — Repo URL (GitHub `owner/repo`, GitLab, or full URL) or local path.
- **plugin-name** — Optional. Install only this plugin from the marketplace; otherwise all plugins are installed.
- **--global** (default) — Symlink into `~/.cursor/agents`, `~/.cursor/commands`, `~/.cursor/skills`, `~/.cursor/rules`. Available in all projects.
- **--project** — Symlink into the current project’s `.cursor/` so only this project sees the plugin.

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

Removes that plugin’s symlinks and data; updates the lock. If it was the last plugin, the marketplace entry is removed. Use `agents-pkg list` to see marketplace and plugin names.

### Remove an entire marketplace

```bash
agents-pkg del-marketplace <name>
```

Uninstalls the marketplace and all its plugins. `name` is the marketplace name (e.g. from the manifest’s `name` field).

### Update installed marketplaces

```bash
agents-pkg update
```

Re-fetches each installed marketplace source, reads `.cursor-plugin/marketplace.json`, and reinstalls if the manifest `metadata.version` changed. Symlinks are recreated in the same place (global or project) as when the marketplace was first installed.

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
| Hooks | `hooks/hooks.json` | Cursor-style `{ "version": 1, "hooks": { ... } }`. Merged into project `.cursor/hooks.json` only. |

Missing dirs are skipped. Hooks are always merged into the **project** `.cursor/hooks.json` (not global).

---

## Where things are installed

With **--global** (default):

| Kind | Location |
|------|----------|
| Agents | `~/.cursor/agents/` |
| Commands | `~/.cursor/commands/` |
| Skills | `~/.cursor/skills/` |
| Rules | `~/.cursor/rules/` |
| Hooks | Project `.cursor/hooks.json` (merged) |

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
