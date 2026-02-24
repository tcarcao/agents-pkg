/**
 * Lock file tests (~/.agents/.agent-pkg-lock.json).
 * Uses AGENT_PKG_HOME to avoid touching real home.
 */

import { describe, it } from 'vitest';
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { getLockPath, getAgentsDir, readLock, writeLock } from '../src/lib/lock.js';
import { expect } from 'vitest';

async function withTempHome(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'agent-pkg-lock-'));
  const orig = process.env.AGENT_PKG_HOME;
  process.env.AGENT_PKG_HOME = dir;
  try {
    await fn(dir);
  } finally {
    if (orig !== undefined) process.env.AGENT_PKG_HOME = orig;
    else delete process.env.AGENT_PKG_HOME;
    await rm(dir, { recursive: true, force: true });
  }
}

describe('lock', () => {
  describe('getLockPath', () => {
    it('returns path under AGENT_PKG_HOME when set', async () => {
      await withTempHome(async (dir) => {
        expect(getLockPath()).toBe(join(dir, '.agents', '.agent-pkg-lock.json'));
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
        expect(lock.version).toBe(1);
        expect(lock.marketplaces).toEqual({});
      });
    });

    it('returns empty lock when version is old', async () => {
      await withTempHome(async (dir) => {
        const agentsDir = join(dir, '.agents');
        await mkdir(agentsDir, { recursive: true });
        await writeFile(
          join(agentsDir, '.agent-pkg-lock.json'),
          JSON.stringify({ version: 0, marketplaces: {} }),
          'utf-8'
        );
        const lock = await readLock();
        expect(lock.version).toBe(1);
        expect(lock.marketplaces).toEqual({});
      });
    });

    it('reads valid lock file', async () => {
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
        await writeFile(join(dir, '.agents', '.agent-pkg-lock.json'), JSON.stringify(content), 'utf-8');
        const lock = await readLock();
        expect(lock.version).toBe(1);
        expect(lock.marketplaces['ai-kit'].version).toBe('0.1.0');
        expect(lock.marketplaces['ai-kit'].pluginNames).toEqual(['ai-kit-global']);
      });
    });
  });

  describe('writeLock', () => {
    it('writes lock and creates directory', async () => {
      await withTempHome(async (dir) => {
        await writeLock({
          version: 1,
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
        expect(lock.version).toBe(1);
        expect(lock.marketplaces.foo.source).toBe('./foo');
      });
    });
  });
});
