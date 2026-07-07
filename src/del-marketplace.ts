/**
 * del-marketplace — Uninstall a marketplace by name.
 */

import { rm } from 'fs/promises';
import { getMarketplaceStorePath } from './lib/marketplace.js';
import { uninstallPluginFromCursor } from './lib/uninstall-plugin.js';
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

  const cwd = process.cwd();
  const global = entry.global !== false;

  for (const pluginName of entry.pluginNames ?? []) {
    await uninstallPluginFromCursor({
      marketplaceName: name,
      pluginName,
      global,
      cwd,
      pluginHooks: entry.pluginHooks?.[pluginName],
    });
  }

  if (!global) {
    const storeRoot = getMarketplaceStorePath(name);
    await rm(storeRoot, { recursive: true, force: true }).catch((e) => {
      console.warn(`Could not remove store at ${storeRoot}:`, e instanceof Error ? e.message : String(e));
    });
  }

  delete lock.marketplaces[name];
  await writeLock(lock);
  console.log(`Removed marketplace "${name}".`);
}
