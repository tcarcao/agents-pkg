/**
 * Shared types for agents-pkg (marketplace-only).
 */

/** Tracked marketplace: name, source (user-passed), version from manifest, installed plugin names, global vs project symlinks. */
export interface MarketplaceEntry {
  name: string;
  source: string;
  version: string;
  pluginNames: string[];
  updatedAt: string;
  /** If true (default), symlinks go to ~/.cursor/*; if false, to project .cursor/*. */
  global?: boolean;
  /** Hook entries we merged per plugin (for removal on uninstall). */
  pluginHooks?: Record<string, Array<{ hookName: string; command: string }>>;
}

export interface LockFile {
  version: number;
  /** Marketplaces tracked for update (key = marketplace name). */
  marketplaces: Record<string, MarketplaceEntry>;
}
