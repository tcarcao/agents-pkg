# agent-pkg

A wrapper around the [skills](https://github.com/vercel-labs/skills) CLI for **Cursor** and **Claude Code**. It keeps the same config location (`~/.agents/`) and folder layout each app expects, and adds **subagents** and **commands** management for both.

- **Skills** — Pass-through to `npx skills` (e.g. `agent-pkg skills add owner/repo`) with `--agent cursor claude-code` by default.
- **Subagents** — Agent definition files (`.md`) in `.cursor/agents` and `.claude/agents`.
- **Commands** — Slash commands in `.cursor/commands` and `.claude/commands`.
- **Hooks** — Cursor only: `.cursor/hooks.json` (Claude uses a different hooks setup and is not managed here).

**Note:** `--agent` (cursor, claude-code) is which *app* to install skills to. Subagents are the `.md` agent files in those apps’ agent dirs — a different concept.

---

## Install

```bash
npm install -g agent-pkg
# or
pnpm add -g agent-pkg
# or run without installing
npx agent-pkg --help
```

**Requires:** Node.js 18+

---

## Config

| Item | Location |
|------|----------|
| Lock file | `~/.agents/.agent-pkg-lock.json` (same parent as skills’ `.skill-lock.json`) |
| Schema | `{ "version": 1, "agents": { ... }, "sources": { "owner/repo": { "source", "repoHash", "options", "updatedAt" } } }` |

Override home for tests: set `AGENT_PKG_HOME` to a temp directory.

---

## Usage

### Install from a repo (all at once)

Pass a **source** (GitHub `owner/repo`, git URL, or local path). By default this installs **skills**, **subagents**, **commands**, and **hooks** (Cursor only) from that repo. Use flags to install only what you want:

```bash
agent-pkg owner/repo                         # install skills + subagents + commands + hooks
agent-pkg owner/repo --subagents --hooks     # only subagents and hooks
agent-pkg ./my-local-repo --skills           # only skills from local path
```

The repo is expected to follow the [repo layout convention](#repo-layout-convention-for-install-from-source) below.

### Skills (pass-through to `npx skills`)

Under the `skills` command, all of these are forwarded to `npx skills` with **`--agent cursor claude-code`** unless you pass `--agent` yourself.

```bash
agent-pkg skills add vercel-labs/agent-skills
agent-pkg skills remove <skill>
agent-pkg skills list
agent-pkg skills find
agent-pkg skills check
agent-pkg skills update
agent-pkg skills init [name]
agent-pkg skills experimental_install
agent-pkg skills experimental_sync
```

### Subagents (Cursor + Claude)

Subagents are `.md` files in `.cursor/agents` and `.claude/agents`. **Source** can be: omitted (stub), a local path, an HTTP(S) URL, or GitHub `owner/repo/path/to/file.md`.

```bash
agent-pkg subagents list
agent-pkg subagents add <name> [source]   # add -g for global dirs too
agent-pkg subagents remove <name>
```

### Commands (slash commands)

Slash commands live in `.cursor/commands` and `.claude/commands`. Same **source** options as subagents.

```bash
agent-pkg commands list
agent-pkg commands add <name> [source]     # add -g for global dirs too
agent-pkg commands remove <name>
```

### Hooks (Cursor only)

Hooks run shell commands at lifecycle events in Cursor (`.cursor/hooks.json`). Claude uses a different setup and is not managed here. See [Cursor hooks](https://cursor.com/docs/agent/third-party-hooks) for event names (e.g. `beforeShellExecution`, `afterFileEdit`).

```bash
agent-pkg hooks list
agent-pkg hooks add <hookName> <command>   # e.g. hooks add beforeShellExecution ./check.sh; add -g for global
agent-pkg hooks remove <hookName>
```

### Update

`agent-pkg update` runs **skills update** (so all skills installed via `npx skills` are updated), then checks each **tracked GitHub source** (repos you installed from with `agent-pkg owner/repo`). For each repo, it fetches the current default-branch tree hash from the GitHub API; if the hash changed, it re-installs from that source (skills, subagents, commands, hooks per the options used when you first installed). Local-path installs are not tracked for update.

```bash
agent-pkg update
```

Tracking is stored in the lock file (`~/.agents/.agent-pkg-lock.json` under `sources`). Optional: set `GITHUB_TOKEN` or `GH_TOKEN` for higher API rate limits.

### Agents and config

Custom install targets (in the lock file) and path info:

```bash
agent-pkg agents list
agent-pkg agents add <name> <projectDir> [globalDir]
agent-pkg agents remove <name>
agent-pkg config path
```

---

## Repo layout convention (install from source)

When you run `agent-pkg owner/repo` (or any source), agent-pkg looks for these directories in the repo:

| Category   | Location in repo   | Contents |
|-----------|--------------------|----------|
| Skills    | `skills/`          | Directory the skills CLI can use: a single `SKILL.md` or subdirs each with `SKILL.md`. |
| Subagents | `agents/`          | One `.md` file per subagent; filename (without `.md`) is the name. |
| Commands  | `commands/`        | One `.md` file per command; filename (without `.md`) is the name. |
| Hooks     | `hooks/hooks.json` | Cursor-style JSON: `{ "version": 1, "hooks": { "hookName": [{ "command": "path" }] } }`. Merged into project `.cursor/hooks.json` only (Cursor only). |

If a path is missing, that category is skipped. Use `--skills`, `--subagents`, `--commands`, or `--hooks` to install only the categories you want.

---

## Folder layout (where agent-pkg installs)

| Kind      | Cursor (project / global)              | Claude (project / global)              |
|-----------|----------------------------------------|----------------------------------------|
| Skills    | `.agents/skills` / `~/.cursor/skills`  | `.claude/skills` / `~/.claude/skills`  |
| Subagents | `.cursor/agents` / `~/.cursor/agents`  | `.claude/agents` / `~/.claude/agents`  |
| Commands  | `.cursor/commands` / `~/.cursor/commands` | `.claude/commands` / `~/.claude/commands` |
| Hooks     | `.cursor/hooks.json` / `~/.cursor/hooks.json` (Cursor only) | — |

Claude’s global config root can be overridden with `CLAUDE_CONFIG_DIR` (default `~/.claude`).

---

## Development

TypeScript, build to `dist/`, tests with **vitest**.

```bash
pnpm install
pnpm build          # Compile src/ → dist/
pnpm dev -- --help  # Run from source (tsx)
pnpm test           # pretest runs build, then vitest
pnpm type-check     # tsc --noEmit
```

**Tests:** Lock file (read/write, version, `AGENT_PKG_HOME`), source resolution (stub, local path, literal), subagents and commands (list/add/remove), CLI (help, version, subagents list, commands list, config path).

### CI and publishing

- **CI** (`.github/workflows/ci.yml`): On push/PR to `main`, runs type-check, build, and tests. Ignores changes that only touch `*.md`.
- **Publish** (`.github/workflows/publish.yml`): Same model as the [skills](https://github.com/vercel-labs/skills) repo.
  - **Push to main**: Include `[patch]` or `[minor]` in a commit message; the workflow bumps the version, pushes the new commit and tag, publishes to npm, and creates a GitHub Release.
  - **Manual**: Actions → Publish → Run workflow, then choose **patch** or **minor** to bump and release.
  - **Tag push**: Pushing a tag `v*` triggers a publish-only run (no bump; the tag must already point to a commit with that version in `package.json`).

Add an **NPM_TOKEN** secret (Settings → Secrets and variables → Actions): create an [npm access token](https://www.npmjs.com/settings/~/tokens) (automation type) and add it as `NPM_TOKEN`.

---

## License

MIT
