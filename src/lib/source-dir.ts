/**
 * Resolve a source (GitHub owner/repo, git URL, or local path) to a local directory path.
 * For remote sources, clones to a temp directory; caller must call cleanup() when done.
 */

import { resolve } from 'path';
import { mkdtemp, rm, stat } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';

function isLocalPath(input: string): boolean {
  const t = input.trim();
  return (
    t.startsWith('./') ||
    t.startsWith('../') ||
    t === '.' ||
    t === '..' ||
    t.startsWith('/') ||
    /^[a-zA-Z]:[/\\]/.test(t)
  );
}

function isGitUrl(input: string): boolean {
  const t = input.trim();
  return t.startsWith('http://') || t.startsWith('https://') || t.startsWith('git@');
}

/**
 * Convert shorthand to HTTPS clone URL.
 * owner/repo -> https://github.com/owner/repo.git
 * gitlab.com/owner/repo -> https://gitlab.com/owner/repo.git
 * Other hosts require a full git URL.
 */
function ownerRepoToUrl(ownerRepo: string): string {
  const trimmed = ownerRepo.trim();
  if (trimmed.includes(':')) return '';
  const parts = trimmed.split('/').filter(Boolean);
  if (parts.length === 2) {
    const [owner, repo] = parts;
    if (owner!.includes('.')) return '';
    return `https://github.com/${owner}/${(repo ?? '').replace(/\.git$/, '')}.git`;
  }
  if (parts.length === 3 && (parts[0] === 'github.com' || parts[0] === 'gitlab.com')) {
    const [host, owner, repo] = parts;
    return `https://${host}/${owner}/${(repo ?? '').replace(/\.git$/, '')}.git`;
  }
  return '';
}

export interface ResolveSourceToDirResult {
  path: string;
  /** Call when done to remove temp dir (only set when we cloned). */
  cleanup?: () => Promise<void>;
}

/**
 * Resolve source to a local directory. For remote sources, clones to a temp dir.
 * Call cleanup() when finished to remove the temp dir.
 */
export async function resolveSourceToDir(source: string): Promise<ResolveSourceToDirResult> {
  const trimmed = source.trim();
  if (!trimmed) {
    throw new Error('Source is required');
  }

  // Local path
  if (isLocalPath(trimmed)) {
    const abs = resolve(trimmed);
    try {
      const st = await stat(abs);
      if (!st.isDirectory()) {
        throw new Error(`Not a directory: ${abs}`);
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('Not a directory')) throw e;
      throw new Error(`Path not found or not a directory: ${trimmed}`);
    }
    return { path: abs };
  }

  // Remote: git URL or owner/repo
  let cloneUrl: string;
  if (isGitUrl(trimmed)) {
    cloneUrl = trimmed;
  } else {
    cloneUrl = ownerRepoToUrl(trimmed);
    if (!cloneUrl) {
      throw new Error(`Invalid source: ${trimmed}. Use a local path, owner/repo, or a git URL.`);
    }
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'agent-pkg-'));
  const result = spawnSync('git', ['clone', '--depth', '1', cloneUrl, tempDir], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf-8',
  });

  if (result.status !== 0) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    const stderr = (result.stderr || '').trim();
    throw new Error(`Failed to clone ${cloneUrl}: ${stderr || result.error?.message || 'unknown error'}`);
  }

  return {
    path: tempDir,
    cleanup: async () => {
      await rm(tempDir, { recursive: true, force: true });
    },
  };
}
