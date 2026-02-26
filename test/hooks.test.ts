/**
 * Hooks lib tests: mergeHooksInto (returns merged entries) and removeHookEntries.
 * Uses temp dir as cwd (project) or HOME (global) so real ~/.cursor is untouched.
 */

import { describe, it } from 'vitest';
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  mergeHooksInto,
  removeHookEntries,
  type HooksJson,
} from '../src/lib/hooks.js';
import { getCursorHooksPath } from '../src/lib/paths.js';

async function withTempCwd(fn: (cwd: string) => Promise<void>): Promise<void> {
  const cwd = await mkdtemp(join(tmpdir(), 'agents-pkg-hooks-'));
  try {
    await fn(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

async function withTempHomeForGlobal(fn: (homeDir: string) => Promise<void>): Promise<void> {
  const homeDir = await mkdtemp(join(tmpdir(), 'agents-pkg-hooks-global-'));
  const orig = process.env.HOME;
  process.env.HOME = homeDir;
  try {
    await fn(homeDir);
  } finally {
    if (orig !== undefined) process.env.HOME = orig;
    else delete process.env.HOME;
    await rm(homeDir, { recursive: true, force: true });
  }
}

describe('hooks', () => {
  describe('mergeHooksInto', () => {
    it('merges into project path and returns entries actually merged', async () => {
      await withTempCwd(async (cwd) => {
        const repoHooks: HooksJson = {
          version: 1,
          hooks: {
            'pre-commit': [{ command: '/bin/script-a' }],
            'post-merge': [{ command: '/bin/script-b' }],
          },
        };
        const merged = await mergeHooksInto(repoHooks, false, cwd);
        expect(merged).toEqual([
          { hookName: 'pre-commit', command: '/bin/script-a' },
          { hookName: 'post-merge', command: '/bin/script-b' },
        ]);

        const path = getCursorHooksPath(false, cwd);
        const raw = await readFile(path, 'utf-8');
        const data = JSON.parse(raw) as HooksJson;
        expect(data.hooks['pre-commit']).toEqual([{ command: '/bin/script-a' }]);
        expect(data.hooks['post-merge']).toEqual([{ command: '/bin/script-b' }]);
      });
    });

    it('does not return already-present commands (only new entries)', async () => {
      await withTempCwd(async (cwd) => {
        const path = getCursorHooksPath(false, cwd);
        await mkdir(join(cwd, '.cursor'), { recursive: true });
        await writeFile(
          path,
          JSON.stringify({
            version: 1,
            hooks: { 'pre-commit': [{ command: '/existing' }] },
          }),
          'utf-8'
        );

        const repoHooks: HooksJson = {
          version: 1,
          hooks: {
            'pre-commit': [{ command: '/existing' }, { command: '/new' }],
          },
        };
        const merged = await mergeHooksInto(repoHooks, false, cwd);
        expect(merged).toEqual([{ hookName: 'pre-commit', command: '/new' }]);

        const raw = await readFile(path, 'utf-8');
        const data = JSON.parse(raw) as HooksJson;
        expect(data.hooks['pre-commit']).toHaveLength(2);
        expect(data.hooks['pre-commit']).toContainEqual({ command: '/existing' });
        expect(data.hooks['pre-commit']).toContainEqual({ command: '/new' });
      });
    });

    it('merges into global path when global is true', async () => {
      await withTempHomeForGlobal(async (homeDir) => {
        const cwd = process.cwd();
        const repoHooks: HooksJson = {
          version: 1,
          hooks: { 'my-hook': [{ command: '/global/script' }] },
        };
        const merged = await mergeHooksInto(repoHooks, true, cwd);
        expect(merged).toEqual([{ hookName: 'my-hook', command: '/global/script' }]);

        const path = getCursorHooksPath(true, cwd);
        expect(path).toBe(join(homeDir, '.cursor', 'hooks.json'));
        const raw = await readFile(path, 'utf-8');
        const data = JSON.parse(raw) as HooksJson;
        expect(data.hooks['my-hook']).toEqual([{ command: '/global/script' }]);
      });
    });
  });

  describe('removeHookEntries', () => {
    it('removes only the given (hookName, command) pairs from project path', async () => {
      await withTempCwd(async (cwd) => {
        const path = getCursorHooksPath(false, cwd);
        await mkdir(join(cwd, '.cursor'), { recursive: true });
        await writeFile(
          path,
          JSON.stringify({
            version: 1,
            hooks: {
              'pre-commit': [
                { command: '/remove-me' },
                { command: '/keep' },
              ],
              'other': [{ command: '/also-keep' }],
            },
          }),
          'utf-8'
        );

        await removeHookEntries(
          [
            { hookName: 'pre-commit', command: '/remove-me' },
          ],
          false,
          cwd
        );

        const raw = await readFile(path, 'utf-8');
        const data = JSON.parse(raw) as HooksJson;
        expect(data.hooks['pre-commit']).toEqual([{ command: '/keep' }]);
        expect(data.hooks['other']).toEqual([{ command: '/also-keep' }]);
      });
    });

    it('removes hook key when array becomes empty', async () => {
      await withTempCwd(async (cwd) => {
        const path = getCursorHooksPath(false, cwd);
        await mkdir(join(cwd, '.cursor'), { recursive: true });
        await writeFile(
          path,
          JSON.stringify({
            version: 1,
            hooks: {
              'only-one': [{ command: '/only' }],
            },
          }),
          'utf-8'
        );

        await removeHookEntries(
          [{ hookName: 'only-one', command: '/only' }],
          false,
          cwd
        );

        const raw = await readFile(path, 'utf-8');
        const data = JSON.parse(raw) as HooksJson;
        expect(data.hooks['only-one']).toBeUndefined();
      });
    });

    it('removes from global path when global is true', async () => {
      await withTempHomeForGlobal(async (homeDir) => {
        const path = getCursorHooksPath(true, process.cwd());
        await mkdir(join(homeDir, '.cursor'), { recursive: true });
        await writeFile(
          path,
          JSON.stringify({
            version: 1,
            hooks: { 'global-hook': [{ command: '/global/rm' }] },
          }),
          'utf-8'
        );

        await removeHookEntries(
          [{ hookName: 'global-hook', command: '/global/rm' }],
          true,
          process.cwd()
        );

        const raw = await readFile(path, 'utf-8');
        const data = JSON.parse(raw) as HooksJson;
        expect(data.hooks['global-hook']).toBeUndefined();
      });
    });
  });
});
