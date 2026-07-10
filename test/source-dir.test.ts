/**
 * Source resolution tests, including cloning a specific git ref (tag/branch)
 * passed as a `#ref` fragment on the source URL.
 */

import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';
import { resolveSourceToDir } from '../src/lib/source-dir.js';

function git(args: string[], cwd: string): void {
  const res = spawnSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (res.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${(res.stderr || '').trim()}`);
  }
}

async function writeManifest(dir: string, version: string): Promise<void> {
  await mkdir(join(dir, '.cursor-plugin'), { recursive: true });
  await writeFile(
    join(dir, '.cursor-plugin', 'marketplace.json'),
    JSON.stringify({
      name: 'test-marketplace',
      metadata: { version },
      plugins: [{ name: 'plugin-a', source: './plugin-a' }],
    }),
    'utf-8'
  );
}

/**
 * Create a local git repo with:
 *  - default branch `main` at marketplace version 0.1.0
 *  - branch `re-aidlc/stable` at marketplace version 0.2.0
 */
async function createRepoWithRef(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'agents-pkg-gitrepo-'));
  git(['init', '-b', 'main'], dir);
  git(['config', 'user.email', 'test@example.com'], dir);
  git(['config', 'user.name', 'Test'], dir);

  await writeManifest(dir, '0.1.0');
  git(['add', '-A'], dir);
  git(['commit', '-m', 'v0.1.0'], dir);

  git(['checkout', '-b', 're-aidlc/stable'], dir);
  await writeManifest(dir, '0.2.0');
  git(['add', '-A'], dir);
  git(['commit', '-m', 'v0.2.0'], dir);

  git(['checkout', 'main'], dir);

  // A tag (with a slash) pointing at a v0.3.0 commit, created off main.
  await writeManifest(dir, '0.3.0');
  git(['add', '-A'], dir);
  git(['commit', '-m', 'v0.3.0'], dir);
  git(['tag', 're-aidlc/stable-tag'], dir);

  // Reset main back to the v0.1.0 commit so the tag is the only way to reach v0.3.0.
  git(['reset', '--hard', 'HEAD~1'], dir);
  return dir;
}

async function readVersion(dir: string): Promise<string> {
  const raw = await readFile(join(dir, '.cursor-plugin', 'marketplace.json'), 'utf-8');
  return JSON.parse(raw).metadata.version;
}

describe('resolveSourceToDir with #ref', () => {
  it('clones the branch specified in the #ref fragment (ref with slash)', async () => {
    const repo = await createRepoWithRef();
    let resolved: { path: string; cleanup?: () => Promise<void> } | undefined;
    try {
      resolved = await resolveSourceToDir(`file://${repo}#re-aidlc/stable`);
      expect(await readVersion(resolved.path)).toBe('0.2.0');
    } finally {
      if (resolved?.cleanup) await resolved.cleanup();
      await rm(repo, { recursive: true, force: true });
    }
  });

  it('clones the tag specified in the #ref fragment (tag with slash)', async () => {
    const repo = await createRepoWithRef();
    let resolved: { path: string; cleanup?: () => Promise<void> } | undefined;
    try {
      resolved = await resolveSourceToDir(`file://${repo}#re-aidlc/stable-tag`);
      expect(await readVersion(resolved.path)).toBe('0.3.0');
    } finally {
      if (resolved?.cleanup) await resolved.cleanup();
      await rm(repo, { recursive: true, force: true });
    }
  });

  it('clones the default branch when no #ref is given', async () => {
    const repo = await createRepoWithRef();
    let resolved: { path: string; cleanup?: () => Promise<void> } | undefined;
    try {
      resolved = await resolveSourceToDir(`file://${repo}`);
      expect(await readVersion(resolved.path)).toBe('0.1.0');
    } finally {
      if (resolved?.cleanup) await resolved.cleanup();
      await rm(repo, { recursive: true, force: true });
    }
  });
});
