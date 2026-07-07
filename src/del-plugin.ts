/**
 * del-plugin — Remove a single plugin from an installed marketplace.
 */

import { readLock, writeLock } from './lib/lock.js';
import { uninstallPluginFromCursor } from './lib/uninstall-plugin.js';
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

  const cwd = process.cwd();
  const global = entry.global !== false;

  await uninstallPluginFromCursor({
    marketplaceName,
    pluginName,
    global,
    cwd,
    pluginHooks: entry.pluginHooks?.[pluginName],
  });

  entry.pluginNames = entry.pluginNames.filter((n) => n !== pluginName);
  if (entry.pluginHooks) delete entry.pluginHooks[pluginName];
  if (entry.pluginMcpKeys) delete entry.pluginMcpKeys[pluginName];
  if (entry.pluginVersions) delete entry.pluginVersions[pluginName];
  if (entry.pluginNames.length === 0) {
    delete lock.marketplaces[marketplaceName];
  }
  await writeLock(lock);
  console.log(`Removed plugin "${pluginName}" from marketplace "${marketplaceName}".`);
}
