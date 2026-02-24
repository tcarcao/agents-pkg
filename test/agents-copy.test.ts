/**
 * Unit tests for agents-copy: agents are copied as real files (not symlinks)
 * and removed as physical files on uninstall.
 */

import { describe, it } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, lstat, access } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  copyAgentsFromPluginStore,
  removeCopiedAgentsForPlugin,
} from '../src/lib/agents-copy.js';
import { REPO_AGENTS_DIR } from '../src/lib/constants.js';
import { expect } from 'vitest';

describe('agents-copy', () => {
  it('copies agent .md files as regular files (not symlinks)', async () => {
    const base = await mkdtemp(join(tmpdir(), 'agents-copy-test-'));
    const pluginStorePath = join(base, 'plugin');
    const cursorAgentsDir = join(base, '.cursor', 'agents');
    try {
      await mkdir(join(pluginStorePath, REPO_AGENTS_DIR), { recursive: true });
      await writeFile(
        join(pluginStorePath, REPO_AGENTS_DIR, 'foo.md'),
        '# Foo agent\n',
        'utf-8'
      );
      await writeFile(
        join(pluginStorePath, REPO_AGENTS_DIR, 'bar.md'),
        '# Bar agent\n',
        'utf-8'
      );

      const names = await copyAgentsFromPluginStore(pluginStorePath, cursorAgentsDir);

      expect(names).toHaveLength(2);
      expect(names).toContain('foo');
      expect(names).toContain('bar');

      const fooPath = join(cursorAgentsDir, 'foo.md');
      const barPath = join(cursorAgentsDir, 'bar.md');
      const fooStat = await lstat(fooPath);
      const barStat = await lstat(barPath);

      expect(fooStat.isFile()).toBe(true);
      expect(fooStat.isSymbolicLink()).toBe(false);
      expect(barStat.isFile()).toBe(true);
      expect(barStat.isSymbolicLink()).toBe(false);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it('removeCopiedAgentsForPlugin deletes the copied agent files', async () => {
    const base = await mkdtemp(join(tmpdir(), 'agents-copy-remove-test-'));
    const pluginStorePath = join(base, 'plugin');
    const cursorAgentsDir = join(base, '.cursor', 'agents');
    try {
      await mkdir(join(pluginStorePath, REPO_AGENTS_DIR), { recursive: true });
      await writeFile(
        join(pluginStorePath, REPO_AGENTS_DIR, 'baz.md'),
        '# Baz\n',
        'utf-8'
      );
      await copyAgentsFromPluginStore(pluginStorePath, cursorAgentsDir);

      const bazPath = join(cursorAgentsDir, 'baz.md');
      await access(bazPath);

      await removeCopiedAgentsForPlugin(pluginStorePath, cursorAgentsDir);

      await expect(access(bazPath)).rejects.toThrow(/ENOENT|no such file/);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it('copyAgentsFromPluginStore returns empty when plugin has no agents dir', async () => {
    const base = await mkdtemp(join(tmpdir(), 'agents-copy-empty-'));
    const pluginStorePath = join(base, 'plugin');
    const cursorAgentsDir = join(base, '.cursor', 'agents');
    try {
      await mkdir(pluginStorePath, { recursive: true });

      const names = await copyAgentsFromPluginStore(pluginStorePath, cursorAgentsDir);

      expect(names).toEqual([]);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});
