/**
 * agents-pkg lock file: ~/.agents/.agents-pkg-lock.json
 * Marketplace-only: tracks installed marketplaces by name.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import {
  AGENTS_DIR,
  LOCK_FILE,
  CURRENT_LOCK_VERSION,
} from './constants.js';
import type { LockFile } from './types.js';

export function getHome(): string {
  const env = process.env.AGENTS_PKG_HOME;
  if (env && typeof env === 'string' && env.trim()) return env.trim();
  return homedir();
}

export function getLockPath(): string {
  return join(getHome(), AGENTS_DIR, LOCK_FILE);
}

export function getAgentsDir(): string {
  return join(getHome(), AGENTS_DIR);
}

function createEmptyLock(): LockFile {
  return {
    version: CURRENT_LOCK_VERSION,
    marketplaces: {},
  };
}

/**
 * Read the agents-pkg lock file.
 * Returns empty lock if missing or invalid.
 */
export async function readLock(): Promise<LockFile> {
  const lockPath = getLockPath();
  try {
    const content = await readFile(lockPath, 'utf-8');
    const parsed = JSON.parse(content) as LockFile & { agents?: unknown; sources?: unknown; plugins?: unknown };
    if (typeof parsed.version !== 'number' || parsed.version !== CURRENT_LOCK_VERSION) {
      return createEmptyLock();
    }
    const marketplaces =
      parsed.marketplaces && typeof parsed.marketplaces === 'object' ? parsed.marketplaces : {};
    return { version: parsed.version, marketplaces };
  } catch {
    return createEmptyLock();
  }
}

/**
 * Write the lock file. Creates ~/.agents if needed.
 */
export async function writeLock(lock: LockFile): Promise<void> {
  const lockPath = getLockPath();
  const dir = getAgentsDir();
  await mkdir(dir, { recursive: true });
  const out: LockFile = {
    version: lock.version,
    marketplaces: lock.marketplaces ?? {},
  };
  await writeFile(lockPath, JSON.stringify(out, null, 2), 'utf-8');
}

export type { LockFile, MarketplaceEntry } from './types.js';
