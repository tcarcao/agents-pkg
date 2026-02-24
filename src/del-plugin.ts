/**
 * del-plugin — Uninstall a marketplace by name (remove symlinks, delete store, update lock).
 */

import { rm } from 'fs/promises';
import { getCursorAgentsDir, getCursorCommandsDir, getCursorSkillsDir } from './lib/paths.js';
import { getMarketplaceStorePath } from './lib/marketplace.js';
import { removeSymlinksInDirPointingUnder } from './lib/symlink.js';
import { readLock, writeLock } from './lib/lock.js';
import { fatal } from './lib/errors.js';

export async function runDelPlugin(args: string[]): Promise<void> {
  const name = args[0]?.trim();
  if (!name) {
    fatal('Usage: agent-pkg del-plugin <name>\n  name = marketplace name (e.g. ai-engineering-kit).');
  }

  const lock = await readLock();
  const entry = lock.marketplaces[name];
  if (!entry) {
    fatal(`Marketplace "${name}" is not installed.`);
  }

  const storeRoot = getMarketplaceStorePath(name);
  const cwd = process.cwd();
  const cursorAgentsDir = getCursorAgentsDir(false, cwd);
  const cursorCommandsDir = getCursorCommandsDir(false, cwd);
  const cursorSkillsDir = getCursorSkillsDir(true, cwd);

  await removeSymlinksInDirPointingUnder(cursorAgentsDir, storeRoot);
  await removeSymlinksInDirPointingUnder(cursorCommandsDir, storeRoot);
  await removeSymlinksInDirPointingUnder(cursorSkillsDir, storeRoot);

  try {
    await rm(storeRoot, { recursive: true, force: true });
  } catch (e) {
    console.warn(`Could not remove store at ${storeRoot}:`, e instanceof Error ? e.message : String(e));
  }

  delete lock.marketplaces[name];
  await writeLock(lock);
  console.log(`Removed marketplace "${name}".`);
}
