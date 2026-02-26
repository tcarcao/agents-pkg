/**
 * Marketplace manifest (.cursor-plugin/marketplace.json inside source) and store paths.
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { getHome } from './lock.js';
import { AGENTS_DIR, MARKETPLACE_DIR, MARKETPLACE_JSON, PLUGIN_JSON } from './constants.js';

export interface MarketplacePlugin {
  name: string;
  source: string;
  description?: string;
  version?: string;
}

export interface MarketplaceManifest {
  name: string;
  owner?: { name?: string };
  metadata?: { description?: string; version?: string };
  plugins: MarketplacePlugin[];
}

/**
 * Read marketplace manifest from resolved source dir.
 * Path: join(sourceDir, '.cursor-plugin', 'marketplace.json')
 */
export async function readMarketplaceManifest(sourceDir: string): Promise<MarketplaceManifest> {
  const path = join(sourceDir, MARKETPLACE_JSON);
  let raw: string;
  try {
    raw = await readFile(path, 'utf-8');
  } catch (e) {
    throw new Error(
      `No marketplace manifest at ${path}. Expected .cursor-plugin/marketplace.json in the source.`
    );
  }
  const manifest = JSON.parse(raw) as Record<string, unknown>;
  if (typeof manifest.name !== 'string' || !manifest.name.trim()) {
    throw new Error('marketplace.json must contain a "name" field (string).');
  }
  if (!Array.isArray(manifest.plugins)) {
    throw new Error('marketplace.json must contain a "plugins" array.');
  }
  const plugins: MarketplacePlugin[] = [];
  for (const p of manifest.plugins) {
    if (typeof p !== 'object' || p === null) continue;
    const o = p as Record<string, unknown>;
    if (typeof o.name !== 'string' || typeof o.source !== 'string') continue;
    plugins.push({
      name: o.name.trim(),
      source: o.source.trim(),
      description: o.description != null ? String(o.description) : undefined,
      version: typeof o.version === 'string' && o.version.trim() ? o.version.trim() : undefined,
    });
  }
  return {
    name: String(manifest.name).trim(),
    owner: manifest.owner && typeof manifest.owner === 'object' ? (manifest.owner as { name?: string }) : undefined,
    metadata: manifest.metadata && typeof manifest.metadata === 'object' ? (manifest.metadata as { description?: string; version?: string }) : undefined,
    plugins,
  };
}

/**
 * Store path for a marketplace: ~/.agents/agents-pkg/marketplace/<name>
 */
export function getMarketplaceStorePath(name: string): string {
  return join(getHome(), AGENTS_DIR, MARKETPLACE_DIR, name);
}

/**
 * Store path for a plugin: ~/.agents/agents-pkg/marketplace/<marketplaceName>/<pluginName>
 */
export function getPluginStorePath(marketplaceName: string, pluginName: string): string {
  return join(getMarketplaceStorePath(marketplaceName), pluginName);
}

/**
 * Read plugin version from optional plugin.json at pluginDir/.cursor-plugin/plugin.json.
 * Returns top-level "version" or '0.0.0' if missing/invalid.
 */
export async function readPluginVersion(pluginDir: string): Promise<string> {
  try {
    const path = join(pluginDir, PLUGIN_JSON);
    const raw = await readFile(path, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.version === 'string' && parsed.version.trim()) {
      return parsed.version.trim();
    }
  } catch {
    // missing or invalid
  }
  return '0.0.0';
}

/**
 * Resolved version for a plugin: manifest plugin.version ?? readPluginVersion(plugin dir) ?? '0.0.0'.
 */
export async function getPluginVersionFromSource(
  plugin: MarketplacePlugin,
  sourceDir: string
): Promise<string> {
  if (plugin.version != null && plugin.version.trim() !== '') {
    return plugin.version.trim();
  }
  const pluginDir = join(sourceDir, plugin.source);
  return readPluginVersion(pluginDir);
}
