/**
 * Shared types for agents-pkg (marketplace-only).
 */

/** Tracked marketplace: name, source (user-passed), version from manifest, installed plugin names. */
export interface MarketplaceEntry {
  name: string;
  source: string;
  version: string;
  pluginNames: string[];
  updatedAt: string;
}

export interface LockFile {
  version: number;
  /** Marketplaces tracked for update (key = marketplace name). */
  marketplaces: Record<string, MarketplaceEntry>;
}
