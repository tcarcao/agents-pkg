/**
 * Sync marketplace plugins into Cursor's local plugin directory (~/.cursor/plugins/local).
 */

import { cp, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

/** Root for Cursor local plugins (override in tests via CURSOR_LOCAL_PLUGINS). */
export function getCursorLocalPluginsDir(): string {
  const override = process.env.CURSOR_LOCAL_PLUGINS?.trim();
  if (override) return override;
  return join(homedir(), '.cursor', 'plugins', 'local');
}

export function getCursorLocalPluginPath(pluginName: string): string {
  return join(getCursorLocalPluginsDir(), pluginName);
}

/** Replace plugins/local/<name>/ with a fresh copy of the plugin source tree. */
export async function syncPluginToLocal(sourceDir: string, pluginName: string): Promise<void> {
  const dest = getCursorLocalPluginPath(pluginName);
  await mkdir(getCursorLocalPluginsDir(), { recursive: true });
  await rm(dest, { recursive: true, force: true });
  await cp(sourceDir, dest, { recursive: true });
}

export async function removeLocalPlugin(pluginName: string): Promise<void> {
  await rm(getCursorLocalPluginPath(pluginName), { recursive: true, force: true });
}
