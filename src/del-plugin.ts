/**
 * del-plugin — Remove a single plugin from an installed marketplace.
 * Removes that plugin's symlinks and store dir; updates lock. If the last plugin is removed, the marketplace entry is removed.
 */

import { rm } from 'fs/promises';
import { getCursorAgentsDir, getCursorCommandsDir, getCursorSkillsDir, getCursorRulesDir, getCursorMcpPath } from './lib/paths.js';
import { getPluginStorePath } from './lib/marketplace.js';
import { removeSymlinksInDirPointingUnder } from './lib/symlink.js';
import { removeCopiedAgentsForPlugin } from './lib/agents-copy.js';
import { removeHookEntries } from './lib/hooks.js';
import { removeMcpServersByPrefix } from './lib/mcp.js';
import { readLock, writeLock } from './lib/lock.js';
import { fatal } from './lib/errors.js';

export async function runDelPlugin(args: string[]): Promise<void> {
  const marketplaceName = args[0]?.trim();
  const pluginName = args[1]?.trim();
  if (!marketplaceName || !pluginName) {
    fatal('Usage: agents-pkg del-plugin <marketplace-name> <plugin-name>\n  Removes one plugin from an installed marketplace. Use "agents-pkg list" to see names.');
  }

  const lock = await readLock();
  const entry = lock.marketplaces[marketplaceName];
  if (!entry) {
    fatal(`Marketplace "${marketplaceName}" is not installed.`);
  }
  if (!entry.pluginNames?.includes(pluginName)) {
    fatal(`Plugin "${pluginName}" is not installed from marketplace "${marketplaceName}". Installed: ${entry.pluginNames?.join(', ') ?? '(none)'}.`);
  }

  const pluginStorePath = getPluginStorePath(marketplaceName, pluginName);
  const cwd = process.cwd();
  const global = entry.global !== false;
  const cursorAgentsDir = getCursorAgentsDir(global, cwd);
  const cursorCommandsDir = getCursorCommandsDir(global, cwd);
  const cursorSkillsDir = getCursorSkillsDir(global, cwd);
  const cursorRulesDir = getCursorRulesDir(global, cwd);

  if (entry.pluginHooks?.[pluginName]?.length) {
    await removeHookEntries(entry.pluginHooks[pluginName], global, cwd);
  }
  const cursorMcpPath = getCursorMcpPath(global, cwd);
  await removeMcpServersByPrefix(cursorMcpPath, `agents-pkg:${marketplaceName}/${pluginName}:`);

  await removeCopiedAgentsForPlugin(pluginStorePath, cursorAgentsDir);
  await removeSymlinksInDirPointingUnder(cursorAgentsDir, pluginStorePath);
  await removeSymlinksInDirPointingUnder(cursorCommandsDir, pluginStorePath);
  await removeSymlinksInDirPointingUnder(cursorSkillsDir, pluginStorePath);
  await removeSymlinksInDirPointingUnder(cursorRulesDir, pluginStorePath);

  try {
    await rm(pluginStorePath, { recursive: true, force: true });
  } catch (e) {
    console.warn(`Could not remove store at ${pluginStorePath}:`, e instanceof Error ? e.message : String(e));
  }

  entry.pluginNames = entry.pluginNames.filter((n) => n !== pluginName);
  if (entry.pluginHooks) delete entry.pluginHooks[pluginName];
  if (entry.pluginNames.length === 0) {
    delete lock.marketplaces[marketplaceName];
  }
  await writeLock(lock);
  console.log(`Removed plugin "${pluginName}" from marketplace "${marketplaceName}".`);
}
