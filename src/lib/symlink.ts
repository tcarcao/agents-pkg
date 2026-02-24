/**
 * Symlink helpers for marketplace install: create symlinks, remove symlinks pointing into store.
 */

import { symlink, readlink, lstat, rm, mkdir } from 'fs/promises';
import { dirname, resolve, relative, join, sep } from 'path';
import { platform } from 'os';

/**
 * Create a symlink at linkPath pointing to target.
 * Ensures parent dir exists. Uses relative path when possible.
 * If linkPath already exists and points to the same target, no-op.
 * On Windows uses 'junction' for directory symlinks.
 */
export async function createSymlink(target: string, linkPath: string): Promise<void> {
  const resolvedTarget = resolve(target);
  const linkDir = dirname(linkPath);
  await mkdir(linkDir, { recursive: true });

  try {
    const stats = await lstat(linkPath);
    if (stats.isSymbolicLink()) {
      const existing = await readlink(linkPath);
      const resolvedExisting = resolve(linkDir, existing);
      if (resolve(resolvedExisting) === resolvedTarget) return;
      await rm(linkPath);
    } else {
      await rm(linkPath, { recursive: true, force: true });
    }
  } catch {
    // ENOENT or other: proceed to create
  }

  const relativePath = relative(linkDir, resolvedTarget);
  const symlinkType = platform() === 'win32' ? 'junction' : undefined;
  await symlink(relativePath, linkPath, symlinkType);
}

/**
 * Remove symlinks in dir that point to a path under storePathRoot.
 * Scans one directory level (does not recurse into subdirs).
 */
export async function removeSymlinksInDirPointingUnder(
  dir: string,
  storePathRoot: string
): Promise<void> {
  const normalizedStore = resolve(storePathRoot);
  try {
    const { readdir } = await import('fs/promises');
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const linkPath = join(dir, e.name);
      try {
        const st = await lstat(linkPath);
        if (!st.isSymbolicLink()) continue;
        const target = await readlink(linkPath);
        const resolvedTarget = resolve(dirname(linkPath), target);
        const normalizedTarget = resolve(resolvedTarget);
        if (normalizedTarget === normalizedStore || normalizedTarget.startsWith(normalizedStore + sep)) {
          await rm(linkPath);
        }
      } catch {
        // ignore per-entry errors
      }
    }
  } catch {
    // dir does not exist or not readable
  }
}
