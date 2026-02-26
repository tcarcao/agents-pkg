/**
 * add-plugin — Cursor only. Install marketplace from source.
 * Reads .cursor-plugin/marketplace.json inside the source; copies plugin dirs to store and symlinks into .cursor/*.
 */

import { join, resolve, sep } from 'path';
import { readdir, readFile, stat, cp } from 'fs/promises';
import { resolveSourceToDir } from './lib/source-dir.js';
import {
  readMarketplaceManifest,
  getPluginStorePath,
  type MarketplaceManifest,
} from './lib/marketplace.js';
import {
  REPO_SKILLS_DIR,
  REPO_COMMANDS_DIR,
  REPO_HOOKS_FILE,
  REPO_MCP_FILE,
  REPO_RULES_DIR,
} from './lib/constants.js';
import { getCursorAgentsDir, getCursorCommandsDir, getCursorSkillsDir, getCursorRulesDir, getCursorMcpPath } from './lib/paths.js';
import { createSymlink } from './lib/symlink.js';
import { copyAgentsFromPluginStore } from './lib/agents-copy.js';
import { mergeHooksInto } from './lib/hooks.js';
import type { HooksJson } from './lib/hooks.js';
import { mergeMcpIntoCursor } from './lib/mcp.js';
import type { McpJson } from './lib/mcp.js';
import { readLock, writeLock } from './lib/lock.js';
import { fatal } from './lib/errors.js';

function isContainedIn(childPath: string, parentPath: string): boolean {
  const normalizedParent = resolve(parentPath) + sep;
  const normalizedChild = resolve(childPath);
  return normalizedChild === resolve(parentPath) || normalizedChild.startsWith(normalizedParent);
}

async function listMdFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith('.md'))
      .map((e) => e.name.replace(/\.md$/, ''));
  } catch {
    return [];
  }
}

async function listSkillDirs(skillsDir: string): Promise<string[]> {
  try {
    const st = await stat(skillsDir);
    if (!st.isDirectory()) return [];
    const entries = await readdir(skillsDir, { withFileTypes: true });
    const names: string[] = [];
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      try {
        const st2 = await stat(join(skillsDir, e.name, 'SKILL.md'));
        if (st2.isFile()) names.push(e.name);
      } catch {
        // no SKILL.md
      }
    }
    return names;
  } catch {
    return [];
  }
}

/** List rule file names (.md and .mdc) in rules dir (top-level only). */
async function listRuleFiles(rulesDir: string): Promise<string[]> {
  try {
    const st = await stat(rulesDir);
    if (!st.isDirectory()) return [];
    const entries = await readdir(rulesDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && (e.name.endsWith('.md') || e.name.endsWith('.mdc')))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

/**
 * Copy plugin dir to store, then create symlinks for agents, commands, skills, rules; merge hooks and mcp.
 * Returns { done, hookEntries } so caller can store pluginHooks in lock.
 */
async function installPlugin(
  pluginStorePath: string,
  cursorAgentsDir: string,
  cursorCommandsDir: string,
  cursorSkillsDir: string,
  cursorRulesDir: string,
  cwd: string,
  global: boolean,
  marketplaceName: string,
  pluginName: string
): Promise<{ done: string[]; hookEntries: Array<{ hookName: string; command: string }> }> {
  const done: string[] = [];
  let hookEntries: Array<{ hookName: string; command: string }> = [];

  // Agents are copied (not symlinked) so Cursor recognizes subagents
  const agentNames = await copyAgentsFromPluginStore(pluginStorePath, cursorAgentsDir);
  if (agentNames.length > 0) done.push('agents');

  const commandsDir = join(pluginStorePath, REPO_COMMANDS_DIR);
  const commandNames = await listMdFiles(commandsDir);
  for (const name of commandNames) {
    const target = join(commandsDir, name + '.md');
    const linkPath = join(cursorCommandsDir, name + '.md');
    await createSymlink(target, linkPath);
  }
  if (commandNames.length > 0) done.push('commands');

  const skillsDir = join(pluginStorePath, REPO_SKILLS_DIR);
  const skillNames = await listSkillDirs(skillsDir);
  for (const name of skillNames) {
    const target = join(skillsDir, name);
    const linkPath = join(cursorSkillsDir, name);
    await createSymlink(target, linkPath);
  }
  if (skillNames.length > 0) done.push('skills');

  const rulesDir = join(pluginStorePath, REPO_RULES_DIR);
  const ruleNames = await listRuleFiles(rulesDir);
  for (const name of ruleNames) {
    const target = join(rulesDir, name);
    const linkPath = join(cursorRulesDir, name);
    await createSymlink(target, linkPath);
  }
  if (ruleNames.length > 0) done.push('rules');

  const hooksPath = join(pluginStorePath, REPO_HOOKS_FILE);
  try {
    const raw = await readFile(hooksPath, 'utf-8');
    const repoHooks = JSON.parse(raw) as HooksJson;
    if (repoHooks.hooks && typeof repoHooks.hooks === 'object' && Object.keys(repoHooks.hooks).length > 0) {
      hookEntries = await mergeHooksInto(repoHooks, global, cwd);
      done.push('hooks');
    }
  } catch {
    // no hooks or invalid
  }

  const mcpPath = join(pluginStorePath, REPO_MCP_FILE);
  try {
    const raw = await readFile(mcpPath, 'utf-8');
    const pluginMcp = JSON.parse(raw) as McpJson;
    if (pluginMcp.mcpServers && typeof pluginMcp.mcpServers === 'object' && Object.keys(pluginMcp.mcpServers).length > 0) {
      const cursorMcpPath = getCursorMcpPath(global, cwd);
      const prefix = `agents-pkg:${marketplaceName}/${pluginName}:`;
      await mergeMcpIntoCursor(pluginMcp, cursorMcpPath, prefix);
      done.push('mcp');
    }
  } catch {
    // no mcp or invalid
  }

  return { done, hookEntries };
}

/**
 * Install marketplace from an already-resolved source dir. Used by add-plugin and update.
 * Returns { installed, pluginHooks } so caller can write lock.
 */
export async function installMarketplaceFromDir(
  manifest: MarketplaceManifest,
  sourceDir: string,
  options: { pluginNames?: string[]; global?: boolean } = {}
): Promise<{ installed: string[]; pluginHooks: Record<string, Array<{ hookName: string; command: string }>> }> {
  let pluginsToInstall = manifest.plugins;
  if (options.pluginNames && options.pluginNames.length > 0) {
    const requested = new Set(options.pluginNames);
    pluginsToInstall = manifest.plugins.filter((p) => requested.has(p.name));
    const found = new Set(pluginsToInstall.map((p) => p.name));
    const missing = options.pluginNames.filter((n) => !found.has(n));
    if (missing.length > 0) {
      fatal(
        `Plugin(s) not found in marketplace: ${missing.join(', ')}. Available: ${manifest.plugins.map((p) => p.name).join(', ')}`
      );
    }
  }

  const global = options.global !== false;
  const absSourceDir = resolve(sourceDir);
  const cwd = process.cwd();
  const cursorAgentsDir = getCursorAgentsDir(global, cwd);
  const cursorCommandsDir = getCursorCommandsDir(global, cwd);
  const cursorSkillsDir = getCursorSkillsDir(global, cwd);
  const cursorRulesDir = getCursorRulesDir(global, cwd);

  const installed: string[] = [];
  const pluginHooks: Record<string, Array<{ hookName: string; command: string }>> = {};
  for (const plugin of pluginsToInstall) {
    const pluginDir = join(sourceDir, plugin.source);
    const absPluginDir = resolve(pluginDir);
    if (!isContainedIn(absPluginDir, absSourceDir)) {
      fatal(`Plugin source "${plugin.source}" is outside the marketplace directory.`);
    }
    const storePath = getPluginStorePath(manifest.name, plugin.name);
    const { mkdir } = await import('fs/promises');
    await mkdir(storePath, { recursive: true });
    await cp(pluginDir, storePath, { recursive: true });

    const { done, hookEntries } = await installPlugin(
      storePath,
      cursorAgentsDir,
      cursorCommandsDir,
      cursorSkillsDir,
      cursorRulesDir,
      cwd,
      global,
      manifest.name,
      plugin.name
    );
    if (done.length > 0) {
      installed.push(plugin.name);
      if (hookEntries.length > 0) pluginHooks[plugin.name] = hookEntries;
    }
  }
  return { installed, pluginHooks };
}

function parseAddPluginArgs(args: string[]): { source: string; pluginNames?: string[]; global: boolean } {
  let global = true;
  const positionals: string[] = [];
  for (const arg of args) {
    if (arg === '--project') {
      global = false;
    } else if (arg === '--global') {
      global = true;
    } else if (arg.startsWith('--')) {
      fatal(`Unknown option: ${arg}. Use --global (default) or --project.`);
    } else {
      positionals.push(arg.trim());
    }
  }
  const source = positionals[0] ?? '';
  const pluginNames =
    positionals.length > 1 ? positionals.slice(1).filter((s) => s.length > 0) : undefined;
  return { source, pluginNames, global };
}

export async function runAddPlugin(args: string[]): Promise<void> {
  const { source, pluginNames, global } = parseAddPluginArgs(args);
  if (!source) {
    fatal(
      'Usage: agents-pkg add-plugin <source> [plugin-name...] [--global | --project]\n  source = repo URL or local path; optional plugin names = install only those plugins (default: all).\n  --global (default) = symlinks in ~/.cursor/*; --project = symlinks in project .cursor/*.'
    );
  }

  const { path: sourceDir, cleanup } = await resolveSourceToDir(source).catch((e) => {
    fatal(e instanceof Error ? e.message : String(e));
  });

  try {
    const manifest = await readMarketplaceManifest(sourceDir);
    const version = manifest.metadata?.version ?? '0.0.0';
    const { installed, pluginHooks } = await installMarketplaceFromDir(manifest, sourceDir, {
      pluginNames,
      global,
    });

    if (installed.length === 0) {
      console.log(`No agents, commands, skills, rules, hooks, or mcp found in the selected plugin(s).`);
      return;
    }

    console.log(`Installed marketplace "${manifest.name}" (v${version}): ${installed.join(', ')}.`);

    const lock = await readLock();
    lock.marketplaces[manifest.name] = {
      name: manifest.name,
      source,
      version,
      pluginNames: installed,
      updatedAt: new Date().toISOString(),
      global,
      pluginHooks: Object.keys(pluginHooks).length > 0 ? pluginHooks : undefined,
    };
    await writeLock(lock);
  } finally {
    if (cleanup) await cleanup();
  }
}
