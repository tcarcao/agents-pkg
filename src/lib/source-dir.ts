/**
 * Resolve a source (GitHub owner/repo, git URL, or local path) to a local directory path.
 * For remote sources, clones to a temp directory; caller must call cleanup() when done.
 *
 * Parsing of `source` (local vs. git, ref extraction) lives in `source-parser.ts`; this
 * module only does filesystem/network work (stat a local path, or clone a git remote).
 */

import { mkdtemp, rm, stat } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';
import { parseSource } from './source-parser.js';

export interface ResolveSourceToDirResult {
  path: string;
  /** Call when done to remove temp dir (only set when we cloned). */
  cleanup?: () => Promise<void>;
}

const DEFAULT_CLONE_TIMEOUT_MS = 300_000;

function getCloneTimeoutMs(): number {
  const raw = process.env.AGENTS_PKG_CLONE_TIMEOUT_MS;
  if (!raw) return DEFAULT_CLONE_TIMEOUT_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CLONE_TIMEOUT_MS;
}

/**
 * Clone `url` (optionally at `ref`) into a fresh temp directory and return its path.
 * Caller owns the returned directory and should remove it when done.
 */
export async function cloneRepo(url: string, ref?: string): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), 'agents-pkg-'));
  const cloneArgs = [
    // Never smudge git-lfs content on checkout: avoids hard failures when git-lfs isn't installed.
    '-c',
    'filter.lfs.required=false',
    '-c',
    'filter.lfs.smudge=',
    '-c',
    'filter.lfs.clean=',
    '-c',
    'filter.lfs.process=',
    'clone',
    '--depth',
    '1',
    ...(ref ? ['--branch', ref] : []),
    url,
    tempDir,
  ];

  const result = spawnSync('git', cloneArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf-8',
    timeout: getCloneTimeoutMs(),
    env: {
      ...process.env,
      // Never hang on an auth prompt; fail fast instead.
      GIT_TERMINAL_PROMPT: '0',
      GIT_LFS_SKIP_SMUDGE: '1',
    },
  });

  const target = ref ? `${url} (ref: ${ref})` : url;

  if (result.error && (result.error as NodeJS.ErrnoException).code === 'ETIMEDOUT') {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    throw new Error(`Timed out cloning ${target} after ${getCloneTimeoutMs()}ms`);
  }

  if (result.status !== 0) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    const stderr = (result.stderr || '').trim();
    throw new Error(`Failed to clone ${target}: ${stderr || result.error?.message || 'unknown error'}`);
  }

  return tempDir;
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

  const parsed = parseSource(trimmed);

  if (parsed.type === 'local') {
    const abs = parsed.localPath ?? parsed.url;
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

  const path = await cloneRepo(parsed.url, parsed.ref);
  return {
    path,
    cleanup: async () => {
      await rm(path, { recursive: true, force: true });
    },
  };
}
