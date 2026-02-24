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
  REPO_AGENTS_DIR,
  REPO_COMMANDS_DIR,
  REPO_HOOKS_FILE,
} from './lib/constants.js';
import { getCursorAgentsDir, getCursorCommandsDir, getCursorSkillsDir } from './lib/paths.js';
import { createSymlink } from './lib/symlink.js';
import { mergeHooksIntoProject } from './lib/hooks.js';
import type { HooksJson } from './lib/hooks.js';
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

/**
 * Copy plugin dir to store, then create symlinks for agents, commands, skills; merge hooks.
 */
async function installPlugin(
  pluginStorePath: string,
  cursorAgentsDir: string,
  cursorCommandsDir: string,
  cursorSkillsDir: string,
  cwd: string
): Promise<string[]> {
  const done: string[] = [];

  const agentsDir = join(pluginStorePath, REPO_AGENTS_DIR);
  const agentNames = await listMdFiles(agentsDir);
  for (const name of agentNames) {
    const target = join(agentsDir, name + '.md');
    const linkPath = join(cursorAgentsDir, name + '.md');
    await createSymlink(target, linkPath);
  }
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

  const hooksPath = join(pluginStorePath, REPO_HOOKS_FILE);
  try {
    const raw = await readFile(hooksPath, 'utf-8');
    const repoHooks = JSON.parse(raw) as HooksJson;
    if (repoHooks.hooks && typeof repoHooks.hooks === 'object' && Object.keys(repoHooks.hooks).length > 0) {
      await mergeHooksIntoProject(repoHooks, cwd);
      done.push('hooks');
    }
  } catch {
    // no hooks or invalid
  }

  return done;
}

/**
 * Install marketplace from an already-resolved source dir. Used by add-plugin and update.
 * Returns list of installed plugin names.
 */
export async function installMarketplaceFromDir(
  manifest: MarketplaceManifest,
  sourceDir: string,
  options: { pluginNameFilter?: string } = {}
): Promise<string[]> {
  let pluginsToInstall = manifest.plugins;
  if (options.pluginNameFilter) {
    pluginsToInstall = manifest.plugins.filter((p) => p.name === options.pluginNameFilter);
    if (pluginsToInstall.length === 0) {
      fatal(`Plugin "${options.pluginNameFilter}" not found in marketplace. Available: ${manifest.plugins.map((p) => p.name).join(', ')}`);
    }
  }

  const absSourceDir = resolve(sourceDir);
  const cwd = process.cwd();
  const cursorAgentsDir = getCursorAgentsDir(false, cwd);
  const cursorCommandsDir = getCursorCommandsDir(false, cwd);
  const cursorSkillsDir = getCursorSkillsDir(true, cwd);

  const installed: string[] = [];
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

    const done = await installPlugin(
      storePath,
      cursorAgentsDir,
      cursorCommandsDir,
      cursorSkillsDir,
      cwd
    );
    if (done.length > 0) installed.push(plugin.name);
  }
  return installed;
}

export async function runAddPlugin(args: string[]): Promise<void> {
  const source = args[0]?.trim();
  if (!source) {
    fatal('Usage: agent-pkg add-plugin <source> [plugin-name]\n  source = repo URL or local path; optional plugin-name = install only that plugin.');
  }
  const pluginNameFilter = args[1]?.trim();

  const { path: sourceDir, cleanup } = await resolveSourceToDir(source).catch((e) => {
    fatal(e instanceof Error ? e.message : String(e));
  });

  try {
    const manifest = await readMarketplaceManifest(sourceDir);
    const version = manifest.metadata?.version ?? '0.0.0';
    const installed = await installMarketplaceFromDir(manifest, sourceDir, {
      pluginNameFilter: pluginNameFilter || undefined,
    });

    if (installed.length === 0) {
      console.log(`No agents, commands, skills, or hooks found in the selected plugin(s).`);
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
    };
    await writeLock(lock);
  } finally {
    if (cleanup) await cleanup();
  }
}
