/**
 * Remove a plugin from Cursor — global installs use plugins/local; project installs use flattened symlinks + store.
 */

import { rm } from 'fs/promises';
import { getPluginStorePath } from './marketplace.js';
import {
  getCursorAgentsDir,
  getCursorCommandsDir,
  getCursorSkillsDir,
  getCursorRulesDir,
} from './paths.js';
import { removeLocalPlugin } from './plugin-local.js';
import { removeSymlinksInDirPointingUnder } from './symlink.js';
import { removeCopiedAgentsForPlugin } from './agents-copy.js';
import { removeHookEntries } from './hooks.js';

export async function uninstallPluginFromCursor(options: {
  marketplaceName: string;
  pluginName: string;
  global: boolean;
  cwd: string;
  pluginHooks?: Array<{ hookName: string; command: string }>;
}): Promise<void> {
  const { marketplaceName, pluginName, global, cwd, pluginHooks } = options;

  if (global) {
    await removeLocalPlugin(pluginName);
    // Also remove leftovers from agents-pkg versions that installed global plugins
    // by flattening them into ~/.cursor/* from the marketplace store.
  }

  const pluginStorePath = getPluginStorePath(marketplaceName, pluginName);
  if (pluginHooks?.length) {
    await removeHookEntries(pluginHooks, global, cwd);
  }

  const cursorAgentsDir = getCursorAgentsDir(global, cwd);
  const cursorCommandsDir = getCursorCommandsDir(global, cwd);
  const cursorSkillsDir = getCursorSkillsDir(global, cwd);
  const cursorRulesDir = getCursorRulesDir(global, cwd);

  await removeCopiedAgentsForPlugin(pluginStorePath, cursorAgentsDir);
  await removeSymlinksInDirPointingUnder(cursorAgentsDir, pluginStorePath);
  await removeSymlinksInDirPointingUnder(cursorCommandsDir, pluginStorePath);
  await removeSymlinksInDirPointingUnder(cursorSkillsDir, pluginStorePath);
  await removeSymlinksInDirPointingUnder(cursorRulesDir, pluginStorePath);

  await rm(pluginStorePath, { recursive: true, force: true }).catch(() => {});
}
