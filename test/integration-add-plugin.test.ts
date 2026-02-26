/**
 * Integration tests for add-plugin.
 */

import { describe, it } from 'vitest';
import { rm, readFile, access } from 'fs/promises';
import { join } from 'path';
import {
  createFakeMarketplaceRepo,
  createFakeMarketplaceRepoWithHooksAndMcp,
  runWithEnv,
  listOutput,
  createTempDir,
} from './integration-helpers.js';
import { expect } from 'vitest';
import { AGENTS_DIR, LOCK_FILE, MARKETPLACE_DIR } from '../src/lib/constants.js';

describe('integration add-plugin', () => {
  it('installs marketplace from local path and list shows it', async () => {
    const homeDir = await createTempDir('agents-pkg-int-home-');
    const projectDir = await createTempDir('agents-pkg-int-project-');
    const repoDir = await createFakeMarketplaceRepo();
    try {
      const add = runWithEnv(
        ['add-plugin', repoDir, '--project'],
        projectDir,
        homeDir
      );
      expect(add.exitCode).toBe(0);
      expect(add.stdout).toContain('Installed marketplace "test-marketplace"');
      expect(add.stdout).toContain('plugin-a');
      expect(add.stdout).toContain('plugin-b');

      const list = listOutput(projectDir, homeDir);
      expect(list).toContain('test-marketplace');
      expect(list).toContain('v0.1.0');
      expect(list).toContain('project');
      expect(list).toContain('plugin-a');
      expect(list).toContain('plugin-b');
    } finally {
      await rm(homeDir, { recursive: true, force: true });
      await rm(projectDir, { recursive: true, force: true });
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it('with plugin-name installs only that plugin', async () => {
    const homeDir = await createTempDir('agents-pkg-int-home-');
    const projectDir = await createTempDir('agents-pkg-int-project-');
    const repoDir = await createFakeMarketplaceRepo();
    try {
      const add = runWithEnv(
        ['add-plugin', repoDir, 'plugin-a', '--project'],
        projectDir,
        homeDir
      );
      expect(add.exitCode).toBe(0);
      expect(add.stdout).toContain('Installed marketplace "test-marketplace"');
      expect(add.stdout).toContain('plugin-a');
      expect(add.stdout).not.toContain('plugin-b');

      const list = listOutput(projectDir, homeDir);
      expect(list).toContain('test-marketplace');
      expect(list).toContain('plugin-a');
      expect(list).not.toContain('plugin-b');
    } finally {
      await rm(homeDir, { recursive: true, force: true });
      await rm(projectDir, { recursive: true, force: true });
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it('with multiple plugin names installs only those plugins', async () => {
    const homeDir = await createTempDir('agents-pkg-int-home-');
    const projectDir = await createTempDir('agents-pkg-int-project-');
    const repoDir = await createFakeMarketplaceRepo();
    try {
      const add = runWithEnv(
        ['add-plugin', repoDir, 'plugin-a', 'plugin-b', '--project'],
        projectDir,
        homeDir
      );
      expect(add.exitCode).toBe(0);
      expect(add.stdout).toContain('Installed marketplace "test-marketplace"');
      expect(add.stdout).toContain('plugin-a');
      expect(add.stdout).toContain('plugin-b');

      const list = listOutput(projectDir, homeDir);
      expect(list).toContain('test-marketplace');
      expect(list).toContain('plugin-a');
      expect(list).toContain('plugin-b');
    } finally {
      await rm(homeDir, { recursive: true, force: true });
      await rm(projectDir, { recursive: true, force: true });
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it('with multiple plugin names when one is invalid fails', async () => {
    const homeDir = await createTempDir('agents-pkg-int-home-');
    const projectDir = await createTempDir('agents-pkg-int-project-');
    const repoDir = await createFakeMarketplaceRepo();
    try {
      const add = runWithEnv(
        ['add-plugin', repoDir, 'plugin-a', 'nonexistent-plugin', '--project'],
        projectDir,
        homeDir
      );
      expect(add.exitCode).toBe(1);
      const out = add.stdout + add.stderr;
      expect(out).toMatch(/not found|Plugin\(s\) not found/i);
      expect(out).toContain('nonexistent-plugin');
      expect(out).toContain('Available:');
      expect(out).toContain('plugin-a');
      expect(out).toContain('plugin-b');
    } finally {
      await rm(homeDir, { recursive: true, force: true });
      await rm(projectDir, { recursive: true, force: true });
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it('with invalid source fails', async () => {
    const homeDir = await createTempDir('agents-pkg-int-home-');
    const projectDir = await createTempDir('agents-pkg-int-project-');
    try {
      const add = runWithEnv(
        ['add-plugin', '/nonexistent-path-xyz', '--project'],
        projectDir,
        homeDir
      );
      expect(add.exitCode).toBe(1);
      expect(add.stdout + add.stderr).toMatch(/source|path|not found|failed/i);
    } finally {
      await rm(homeDir, { recursive: true, force: true });
      await rm(projectDir, { recursive: true, force: true });
    }
  });

  it('creates store and lock file', async () => {
    const homeDir = await createTempDir('agents-pkg-int-home-');
    const projectDir = await createTempDir('agents-pkg-int-project-');
    const repoDir = await createFakeMarketplaceRepo();
    const lockPath = join(homeDir, AGENTS_DIR, LOCK_FILE);
    const storeRoot = join(homeDir, AGENTS_DIR, MARKETPLACE_DIR, 'test-marketplace');
    try {
      runWithEnv(['add-plugin', repoDir, '--project'], projectDir, homeDir);
      await access(lockPath);
      await access(storeRoot);
      await access(join(storeRoot, 'plugin-a'));
      await access(join(storeRoot, 'plugin-b'));

      const lock = JSON.parse(await readFile(lockPath, 'utf-8'));
      expect(lock.marketplaces['test-marketplace']).toBeDefined();
      expect(lock.marketplaces['test-marketplace'].pluginNames).toContain('plugin-a');
      expect(lock.marketplaces['test-marketplace'].pluginNames).toContain('plugin-b');
      expect(lock.marketplaces['test-marketplace'].pluginVersions).toBeDefined();
      expect(lock.marketplaces['test-marketplace'].pluginVersions['plugin-a']).toBeDefined();
      expect(lock.marketplaces['test-marketplace'].pluginVersions['plugin-b']).toBeDefined();
      expect(typeof lock.marketplaces['test-marketplace'].pluginVersions['plugin-a']).toBe('string');
      expect(typeof lock.marketplaces['test-marketplace'].pluginVersions['plugin-b']).toBe('string');
    } finally {
      await rm(homeDir, { recursive: true, force: true });
      await rm(projectDir, { recursive: true, force: true });
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it('with hooks and mcp writes pluginHooks to lock and merges into .cursor/hooks.json and .cursor/mcp.json', async () => {
    const homeDir = await createTempDir('agents-pkg-int-home-');
    const projectDir = await createTempDir('agents-pkg-int-project-');
    const repoDir = await createFakeMarketplaceRepoWithHooksAndMcp();
    const lockPath = join(homeDir, AGENTS_DIR, LOCK_FILE);
    const hooksPath = join(projectDir, '.cursor', 'hooks.json');
    const mcpPath = join(projectDir, '.cursor', 'mcp.json');
    try {
      const add = runWithEnv(
        ['add-plugin', repoDir, '--project'],
        projectDir,
        homeDir
      );
      expect(add.exitCode).toBe(0);
      expect(add.stdout).toContain('Installed marketplace "test-marketplace"');

      const lock = JSON.parse(await readFile(lockPath, 'utf-8'));
      expect(lock.marketplaces['test-marketplace'].pluginHooks).toBeDefined();
      expect(lock.marketplaces['test-marketplace'].pluginHooks['plugin-a']).toEqual([
        { hookName: 'pre-commit', command: '/repo/plugin-a/pre-commit' },
      ]);

      const hooks = JSON.parse(await readFile(hooksPath, 'utf-8'));
      expect(hooks.hooks['pre-commit']).toContainEqual({
        command: '/repo/plugin-a/pre-commit',
      });

      const mcp = JSON.parse(await readFile(mcpPath, 'utf-8'));
      const prefixedKey = 'agents-pkg:test-marketplace/plugin-a:github';
      expect(mcp.mcpServers[prefixedKey]).toEqual({
        command: 'npx',
        args: ['-y', 'github-mcp'],
      });
    } finally {
      await rm(homeDir, { recursive: true, force: true });
      await rm(projectDir, { recursive: true, force: true });
      await rm(repoDir, { recursive: true, force: true });
    }
  });
});
