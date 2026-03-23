/**
 * Lock file tests (~/.agents/.agents-pkg-lock.json).
 * Uses AGENTS_PKG_HOME to avoid touching real home.
 */

import { describe, it } from 'vitest';
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { getLockPath, getAgentsDir, readLock, writeLock } from '../src/lib/lock.js';
import { CURRENT_LOCK_VERSION } from '../src/lib/constants.js';
import { expect } from 'vitest';

async function withTempHome(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'agents-pkg-lock-'));
  const orig = process.env.AGENTS_PKG_HOME;
  process.env.AGENTS_PKG_HOME = dir;
  try {
    await fn(dir);
  } finally {
    if (orig !== undefined) process.env.AGENTS_PKG_HOME = orig;
    else delete process.env.AGENTS_PKG_HOME;
    await rm(dir, { recursive: true, force: true });
  }
}

describe('lock', () => {
  it('CURRENT_LOCK_VERSION is 2', () => {
    expect(CURRENT_LOCK_VERSION).toBe(2);
  });

  describe('getLockPath', () => {
    it('returns path under AGENTS_PKG_HOME when set', async () => {
      await withTempHome(async (dir) => {
        expect(getLockPath()).toBe(join(dir, '.agents', '.agents-pkg-lock.json'));
      });
    });

    it('getAgentsDir returns .agents under home', async () => {
      await withTempHome(async (dir) => {
        expect(getAgentsDir()).toBe(join(dir, '.agents'));
      });
    });
  });

  describe('readLock', () => {
    it('returns empty lock when file does not exist', async () => {
      await withTempHome(async () => {
        const lock = await readLock();
        expect(lock.version).toBe(CURRENT_LOCK_VERSION);
        expect(lock.marketplaces).toEqual({});
      });
    });

    it('returns empty lock when version is old or unknown', async () => {
      await withTempHome(async (dir) => {
        const agentsDir = join(dir, '.agents');
        await mkdir(agentsDir, { recursive: true });
        await writeFile(
          join(agentsDir, '.agents-pkg-lock.json'),
          JSON.stringify({ version: 0, marketplaces: {} }),
          'utf-8'
        );
        const lock = await readLock();
        expect(lock.version).toBe(CURRENT_LOCK_VERSION);
        expect(lock.marketplaces).toEqual({});
      });
    });

    it('returns empty lock when version is unsupported', async () => {
      await withTempHome(async (dir) => {
        const agentsDir = join(dir, '.agents');
        await mkdir(agentsDir, { recursive: true });
        await writeFile(
          join(agentsDir, '.agents-pkg-lock.json'),
          JSON.stringify({ version: 99, marketplaces: { x: { name: 'x', source: 's', version: '1', pluginNames: [], updatedAt: '' } } }),
          'utf-8'
        );
        const lock = await readLock();
        expect(lock.version).toBe(CURRENT_LOCK_VERSION);
        expect(lock.marketplaces).toEqual({});
      });
    });

    it('migrates v1 lock and strips plugin prefix from pluginMcpKeys', async () => {
      await withTempHome(async (dir) => {
        await mkdir(join(dir, '.agents'), { recursive: true });
        const content = {
          version: 1,
          marketplaces: {
            mk: {
              name: 'mk',
              source: './src',
              version: '1.0.0',
              pluginNames: ['plugin-a'],
              updatedAt: new Date().toISOString(),
              pluginMcpKeys: { 'plugin-a': ['plugin-a:github'] },
            },
          },
        };
        await writeFile(join(dir, '.agents', '.agents-pkg-lock.json'), JSON.stringify(content), 'utf-8');
        const lock = await readLock();
        expect(lock.version).toBe(2);
        expect(lock.marketplaces.mk.pluginMcpKeys?.['plugin-a']).toEqual(['github']);
        expect(lock.marketplaces.mk.source).toBe('./src');
      });
    });

    it('reads v2 lock file as-is', async () => {
      await withTempHome(async (dir) => {
        await mkdir(join(dir, '.agents'), { recursive: true });
        const content = {
          version: 2,
          marketplaces: {
            'ai-kit': {
              name: 'ai-kit',
              source: 'https://gitlab.com/org/ai-kit',
              version: '0.1.0',
              pluginNames: ['ai-kit-global'],
              updatedAt: new Date().toISOString(),
            },
          },
        };
        await writeFile(join(dir, '.agents', '.agents-pkg-lock.json'), JSON.stringify(content), 'utf-8');
        const lock = await readLock();
        expect(lock.version).toBe(2);
        expect(lock.marketplaces['ai-kit'].version).toBe('0.1.0');
        expect(lock.marketplaces['ai-kit'].pluginNames).toEqual(['ai-kit-global']);
      });
    });

    it('migrates v1 lock on disk to v2 shape when reading', async () => {
      await withTempHome(async (dir) => {
        await mkdir(join(dir, '.agents'), { recursive: true });
        const content = {
          version: 1,
          marketplaces: {
            'ai-kit': {
              name: 'ai-kit',
              source: 'https://gitlab.com/org/ai-kit',
              version: '0.1.0',
              pluginNames: ['ai-kit-global'],
              updatedAt: new Date().toISOString(),
            },
          },
        };
        await writeFile(join(dir, '.agents', '.agents-pkg-lock.json'), JSON.stringify(content), 'utf-8');
        const lock = await readLock();
        expect(lock.version).toBe(2);
        expect(lock.marketplaces['ai-kit'].version).toBe('0.1.0');
        expect(lock.marketplaces['ai-kit'].pluginNames).toEqual(['ai-kit-global']);
      });
    });
  });

  describe('writeLock', () => {
    it('writes lock and creates directory', async () => {
      await withTempHome(async (dir) => {
        await writeLock({
          version: CURRENT_LOCK_VERSION,
          marketplaces: {
            foo: {
              name: 'foo',
              source: './foo',
              version: '1.0.0',
              pluginNames: ['foo-plugin'],
              updatedAt: new Date().toISOString(),
            },
          },
        });
        const lockPath = getLockPath();
        const raw = await readFile(lockPath, 'utf-8');
        const lock = JSON.parse(raw) as { version: number; marketplaces: Record<string, { name: string; source: string }> };
        expect(lock.version).toBe(CURRENT_LOCK_VERSION);
        expect(lock.marketplaces.foo.source).toBe('./foo');
      });
    });
  });
});
