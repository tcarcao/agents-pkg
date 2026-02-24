/**
 * Integration tests for add-plugin.
 */

import { describe, it } from 'vitest';
import { rm, readFile, access } from 'fs/promises';
import { join } from 'path';
import {
  createFakeMarketplaceRepo,
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
    } finally {
      await rm(homeDir, { recursive: true, force: true });
      await rm(projectDir, { recursive: true, force: true });
      await rm(repoDir, { recursive: true, force: true });
    }
  });
});
