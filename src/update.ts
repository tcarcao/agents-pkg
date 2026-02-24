/**
 * agents-pkg update: for each installed marketplace, re-fetch source, read .cursor-plugin/marketplace.json, reinstall if version changed.
 */

import { rm } from 'fs/promises';
import { resolveSourceToDir } from './lib/source-dir.js';
import { readMarketplaceManifest, getMarketplaceStorePath } from './lib/marketplace.js';
import { removeSymlinksInDirPointingUnder } from './lib/symlink.js';
import { getCursorAgentsDir, getCursorCommandsDir, getCursorSkillsDir } from './lib/paths.js';
import { installMarketplaceFromDir } from './add-plugin.js';
import { readLock, writeLock } from './lib/lock.js';

export async function runUpdate(): Promise<void> {
  const lock = await readLock();
  const entries = Object.entries(lock.marketplaces ?? {});
  if (entries.length === 0) return;

  const cwd = process.cwd();
  const cursorAgentsDir = getCursorAgentsDir(false, cwd);
  const cursorCommandsDir = getCursorCommandsDir(false, cwd);
  const cursorSkillsDir = getCursorSkillsDir(true, cwd);

  let updated = 0;
  for (const [name, entry] of entries) {
    if (!entry || typeof entry.source !== 'string') continue;

    const { path: sourceDir, cleanup } = await resolveSourceToDir(entry.source).catch(() => ({
      path: '',
      cleanup: undefined as (() => Promise<void>) | undefined,
    }));
    if (!sourceDir) continue;

    try {
      const manifest = await readMarketplaceManifest(sourceDir);
      const newVersion = manifest.metadata?.version ?? '0.0.0';
      if (newVersion === entry.version) continue;

      console.log(`Updating marketplace ${name} (${entry.version} -> ${newVersion})...`);
      const storeRoot = getMarketplaceStorePath(name);
      await removeSymlinksInDirPointingUnder(cursorAgentsDir, storeRoot);
      await removeSymlinksInDirPointingUnder(cursorCommandsDir, storeRoot);
      await removeSymlinksInDirPointingUnder(cursorSkillsDir, storeRoot);
      await rm(storeRoot, { recursive: true, force: true }).catch(() => {});

      const installed = await installMarketplaceFromDir(manifest, sourceDir);
      entry.version = newVersion;
      entry.pluginNames = installed;
      entry.updatedAt = new Date().toISOString();
      updated++;
    } catch (err) {
      console.error(`Failed to update ${name}:`, err instanceof Error ? err.message : String(err));
    } finally {
      if (cleanup) await cleanup();
    }
  }

  if (updated > 0) {
    await writeLock(lock);
    console.log(`Updated ${updated} marketplace(s).`);
  }
}
