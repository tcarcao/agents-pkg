/**
 * del-marketplace — Uninstall a marketplace by name (remove symlinks, delete store, update lock).
 */

import { rm } from 'fs/promises';
import { getCursorAgentsDir, getCursorCommandsDir, getCursorSkillsDir, getCursorRulesDir } from './lib/paths.js';
import { getMarketplaceStorePath, getPluginStorePath } from './lib/marketplace.js';
import { removeSymlinksInDirPointingUnder } from './lib/symlink.js';
import { removeCopiedAgentsForPlugin } from './lib/agents-copy.js';
import { removeHookEntries } from './lib/hooks.js';
import { readLock, writeLock } from './lib/lock.js';
import { fatal } from './lib/errors.js';

export async function runDelMarketplace(args: string[]): Promise<void> {
  const name = args[0]?.trim();
  if (!name) {
    fatal('Usage: agents-pkg del-marketplace <name>\n  name = marketplace name (e.g. ai-engineering-kit).');
  }

  const lock = await readLock();
  const entry = lock.marketplaces[name];
  if (!entry) {
    fatal(`Marketplace "${name}" is not installed.`);
  }

  const storeRoot = getMarketplaceStorePath(name);
  const cwd = process.cwd();
  const global = entry.global !== false;
  const cursorAgentsDir = getCursorAgentsDir(global, cwd);
  const cursorCommandsDir = getCursorCommandsDir(global, cwd);
  const cursorSkillsDir = getCursorSkillsDir(global, cwd);
  const cursorRulesDir = getCursorRulesDir(global, cwd);

  for (const pluginName of entry.pluginNames ?? []) {
    if (entry.pluginHooks?.[pluginName]?.length) {
      await removeHookEntries(entry.pluginHooks[pluginName], global, cwd);
    }
  }

  for (const pluginName of entry.pluginNames ?? []) {
    const pluginStorePath = getPluginStorePath(name, pluginName);
    await removeCopiedAgentsForPlugin(pluginStorePath, cursorAgentsDir);
  }
  await removeSymlinksInDirPointingUnder(cursorAgentsDir, storeRoot);
  await removeSymlinksInDirPointingUnder(cursorCommandsDir, storeRoot);
  await removeSymlinksInDirPointingUnder(cursorSkillsDir, storeRoot);
  await removeSymlinksInDirPointingUnder(cursorRulesDir, storeRoot);

  try {
    await rm(storeRoot, { recursive: true, force: true });
  } catch (e) {
    console.warn(`Could not remove store at ${storeRoot}:`, e instanceof Error ? e.message : String(e));
  }

  delete lock.marketplaces[name];
  await writeLock(lock);
  console.log(`Removed marketplace "${name}".`);
}
