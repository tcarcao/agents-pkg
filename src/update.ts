/**
 * agents-pkg update: for each installed marketplace, re-fetch source, read .cursor-plugin/marketplace.json, reinstall if version changed.
 */

import { rm } from 'fs/promises';
import { resolveSourceToDir } from './lib/source-dir.js';
import { readMarketplaceManifest, getMarketplaceStorePath, getPluginStorePath, getPluginVersionFromSource } from './lib/marketplace.js';
import { removeSymlinksInDirPointingUnder } from './lib/symlink.js';
import { removeCopiedAgentsForPlugin } from './lib/agents-copy.js';
import { getCursorAgentsDir, getCursorCommandsDir, getCursorSkillsDir, getCursorRulesDir, getCursorMcpPath } from './lib/paths.js';
import { removeHookEntries } from './lib/hooks.js';
import { removeMcpServersByPrefix, removeMcpServersByKeys, getLegacyMcpPrefix } from './lib/mcp.js';
import { installMarketplaceFromDir } from './add-plugin.js';
import { readLock, writeLock } from './lib/lock.js';

export async function runUpdate(): Promise<void> {
  const lock = await readLock();
  const entries = Object.entries(lock.marketplaces ?? {});
  if (entries.length === 0) return;

  const cwd = process.cwd();

  let updated = 0;
  let lockModified = false;
  for (const [name, entry] of entries) {
    if (!entry || typeof entry.source !== 'string') continue;

    const global = entry.global !== false;
    const cursorAgentsDir = getCursorAgentsDir(global, cwd);
    const cursorCommandsDir = getCursorCommandsDir(global, cwd);
    const cursorSkillsDir = getCursorSkillsDir(global, cwd);
    const cursorRulesDir = getCursorRulesDir(global, cwd);

    const { path: sourceDir, cleanup } = await resolveSourceToDir(entry.source).catch(() => ({
      path: '',
      cleanup: undefined as (() => Promise<void>) | undefined,
    }));
    if (!sourceDir) continue;

    try {
      const manifest = await readMarketplaceManifest(sourceDir);
      const newVersion = manifest.metadata?.version ?? '0.0.0';
      const cursorMcpPath = getCursorMcpPath(global, cwd);

      if (newVersion !== entry.version) {
        console.log(`Updating marketplace ${name} (${entry.version} -> ${newVersion})...`);
        const storeRoot = getMarketplaceStorePath(name);
        for (const pluginName of entry.pluginNames ?? []) {
          if (entry.pluginHooks?.[pluginName]?.length) {
            await removeHookEntries(entry.pluginHooks[pluginName], global, cwd);
          }
          if (entry.pluginMcpKeys?.[pluginName]?.length) {
            await removeMcpServersByKeys(cursorMcpPath, entry.pluginMcpKeys[pluginName]);
          }
          await removeMcpServersByPrefix(cursorMcpPath, getLegacyMcpPrefix(name, pluginName));
        }
        for (const pluginName of entry.pluginNames ?? []) {
          const pluginStorePath = getPluginStorePath(name, pluginName);
          await removeCopiedAgentsForPlugin(pluginStorePath, cursorAgentsDir);
        }
        await removeSymlinksInDirPointingUnder(cursorAgentsDir, storeRoot);
        await removeSymlinksInDirPointingUnder(cursorCommandsDir, storeRoot);
        await removeSymlinksInDirPointingUnder(cursorSkillsDir, storeRoot);
        await removeSymlinksInDirPointingUnder(cursorRulesDir, storeRoot);
        await rm(storeRoot, { recursive: true, force: true }).catch(() => {});

        const { installed, pluginHooks, pluginMcpKeys } = await installMarketplaceFromDir(manifest, sourceDir, {
          global,
          existingPluginMcpKeys: entry.pluginMcpKeys,
        });
        entry.version = newVersion;
        entry.pluginNames = installed;
        entry.pluginHooks = Object.keys(pluginHooks).length > 0 ? pluginHooks : undefined;
        entry.pluginMcpKeys = Object.keys(pluginMcpKeys).length > 0 ? pluginMcpKeys : undefined;
        const pluginVersions: Record<string, string> = {};
        for (const pluginName of installed) {
          const plugin = manifest.plugins.find((p) => p.name === pluginName);
          pluginVersions[pluginName] = plugin
            ? await getPluginVersionFromSource(plugin, sourceDir)
            : '0.0.0';
        }
        entry.pluginVersions = pluginVersions;
        entry.updatedAt = new Date().toISOString();
        updated++;
      } else {
        if (!entry.pluginVersions) {
          // Backfill from source so future updates can do per-plugin version diff
          entry.pluginVersions = {};
          for (const pluginName of entry.pluginNames ?? []) {
            const plugin = manifest.plugins.find((p) => p.name === pluginName);
            entry.pluginVersions[pluginName] = plugin
              ? await getPluginVersionFromSource(plugin, sourceDir)
              : '0.0.0';
          }
          lockModified = true;
        }

        const manifestPluginNames = new Set(manifest.plugins.map((p) => p.name));

        for (const pluginName of [...(entry.pluginNames ?? [])]) {
          if (manifestPluginNames.has(pluginName)) continue;

          const pluginStorePath = getPluginStorePath(name, pluginName);
          if (entry.pluginHooks?.[pluginName]?.length) {
            await removeHookEntries(entry.pluginHooks[pluginName], global, cwd);
          }
          if (entry.pluginMcpKeys?.[pluginName]?.length) {
            await removeMcpServersByKeys(cursorMcpPath, entry.pluginMcpKeys[pluginName]);
          }
          await removeMcpServersByPrefix(cursorMcpPath, getLegacyMcpPrefix(name, pluginName));
          await removeCopiedAgentsForPlugin(pluginStorePath, cursorAgentsDir);
          await removeSymlinksInDirPointingUnder(cursorAgentsDir, pluginStorePath);
          await removeSymlinksInDirPointingUnder(cursorCommandsDir, pluginStorePath);
          await removeSymlinksInDirPointingUnder(cursorSkillsDir, pluginStorePath);
          await removeSymlinksInDirPointingUnder(cursorRulesDir, pluginStorePath);
          await rm(pluginStorePath, { recursive: true, force: true }).catch(() => {});

          entry.pluginNames = entry.pluginNames!.filter((n) => n !== pluginName);
          if (entry.pluginHooks) delete entry.pluginHooks[pluginName];
          if (entry.pluginMcpKeys) delete entry.pluginMcpKeys[pluginName];
          if (entry.pluginVersions) delete entry.pluginVersions[pluginName];
          if (entry.pluginNames.length === 0) {
            delete lock.marketplaces[name];
          }
          lockModified = true;
        }

        if (!lock.marketplaces[name]) continue;

        const newPluginVersions: Record<string, string> = {};
        for (const p of manifest.plugins) {
          newPluginVersions[p.name] = await getPluginVersionFromSource(p, sourceDir);
        }

        for (const pluginName of entry.pluginNames ?? []) {
          if (!manifest.plugins.some((p) => p.name === pluginName)) continue;
          const newVer = newPluginVersions[pluginName];
          const curVer = entry.pluginVersions?.[pluginName];
          if (newVer === curVer) continue;

          const pluginStorePath = getPluginStorePath(name, pluginName);
          if (entry.pluginHooks?.[pluginName]?.length) {
            await removeHookEntries(entry.pluginHooks[pluginName], global, cwd);
          }
          if (entry.pluginMcpKeys?.[pluginName]?.length) {
            await removeMcpServersByKeys(cursorMcpPath, entry.pluginMcpKeys[pluginName]);
          }
          await removeMcpServersByPrefix(cursorMcpPath, getLegacyMcpPrefix(name, pluginName));
          await removeCopiedAgentsForPlugin(pluginStorePath, cursorAgentsDir);
          await removeSymlinksInDirPointingUnder(cursorAgentsDir, pluginStorePath);
          await removeSymlinksInDirPointingUnder(cursorCommandsDir, pluginStorePath);
          await removeSymlinksInDirPointingUnder(cursorSkillsDir, pluginStorePath);
          await removeSymlinksInDirPointingUnder(cursorRulesDir, pluginStorePath);
          await rm(pluginStorePath, { recursive: true, force: true }).catch(() => {});

          const { installed, pluginHooks, pluginMcpKeys: pluginMcpKeysReturned } = await installMarketplaceFromDir(manifest, sourceDir, {
            pluginNames: [pluginName],
            global,
            existingPluginMcpKeys: entry.pluginMcpKeys,
          });
          if (installed.includes(pluginName)) {
            const plugin = manifest.plugins.find((p) => p.name === pluginName);
            const ver = plugin ? await getPluginVersionFromSource(plugin, sourceDir) : '0.0.0';
            if (!entry.pluginVersions) entry.pluginVersions = {};
            entry.pluginVersions[pluginName] = ver;
            if (pluginHooks[pluginName]?.length) {
              if (!entry.pluginHooks) entry.pluginHooks = {};
              entry.pluginHooks[pluginName] = pluginHooks[pluginName];
            }
            if (pluginMcpKeysReturned[pluginName]?.length) {
              if (!entry.pluginMcpKeys) entry.pluginMcpKeys = {};
              entry.pluginMcpKeys[pluginName] = pluginMcpKeysReturned[pluginName];
            }
          }
          entry.updatedAt = new Date().toISOString();
          lockModified = true;
        }
      }
    } catch (err) {
      console.error(`Failed to update ${name}:`, err instanceof Error ? err.message : String(err));
    } finally {
      if (cleanup) await cleanup();
    }
  }

  if (updated > 0 || lockModified) {
    await writeLock(lock);
    if (updated > 0) console.log(`Updated ${updated} marketplace(s).`);
  }
}
