/**
 * Integration tests for del-plugin.
 */

import { describe, it } from 'vitest';
import { rm } from 'fs/promises';
import {
  createFakeMarketplaceRepo,
  runWithEnv,
  listOutput,
  createTempDir,
} from './integration-helpers.js';
import { expect } from 'vitest';

describe('integration del-plugin', () => {
  it('removes one plugin; list shows remaining plugin', async () => {
    const homeDir = await createTempDir('agents-pkg-int-home-');
    const projectDir = await createTempDir('agents-pkg-int-project-');
    const repoDir = await createFakeMarketplaceRepo();
    try {
      runWithEnv(['add-plugin', repoDir, '--project'], projectDir, homeDir);
      let list = listOutput(projectDir, homeDir);
      expect(list).toContain('plugin-a');
      expect(list).toContain('plugin-b');

      const del = runWithEnv(
        ['del-plugin', 'test-marketplace', 'plugin-b'],
        projectDir,
        homeDir
      );
      expect(del.exitCode).toBe(0);
      expect(del.stdout).toContain('Removed plugin "plugin-b" from marketplace "test-marketplace"');

      list = listOutput(projectDir, homeDir);
      expect(list).toContain('test-marketplace');
      expect(list).toContain('plugin-a');
      expect(list).not.toContain('plugin-b');
    } finally {
      await rm(homeDir, { recursive: true, force: true });
      await rm(projectDir, { recursive: true, force: true });
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it('removing last plugin removes marketplace from list', async () => {
    const homeDir = await createTempDir('agents-pkg-int-home-');
    const projectDir = await createTempDir('agents-pkg-int-project-');
    const repoDir = await createFakeMarketplaceRepo();
    try {
      runWithEnv(['add-plugin', repoDir, '--project'], projectDir, homeDir);
      runWithEnv(['del-plugin', 'test-marketplace', 'plugin-b'], projectDir, homeDir);
      const del = runWithEnv(
        ['del-plugin', 'test-marketplace', 'plugin-a'],
        projectDir,
        homeDir
      );
      expect(del.exitCode).toBe(0);

      const list = listOutput(projectDir, homeDir);
      expect(list).toContain('No marketplaces installed');
    } finally {
      await rm(homeDir, { recursive: true, force: true });
      await rm(projectDir, { recursive: true, force: true });
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it('with unknown marketplace fails', async () => {
    const homeDir = await createTempDir('agents-pkg-int-home-');
    const projectDir = await createTempDir('agents-pkg-int-project-');
    try {
      const del = runWithEnv(
        ['del-plugin', 'nonexistent-marketplace', 'some-plugin'],
        projectDir,
        homeDir
      );
      expect(del.exitCode).toBe(1);
      expect(del.stdout + del.stderr).toContain('not installed');
    } finally {
      await rm(homeDir, { recursive: true, force: true });
      await rm(projectDir, { recursive: true, force: true });
    }
  });

  it('with unknown plugin name fails', async () => {
    const homeDir = await createTempDir('agents-pkg-int-home-');
    const projectDir = await createTempDir('agents-pkg-int-project-');
    const repoDir = await createFakeMarketplaceRepo();
    try {
      runWithEnv(['add-plugin', repoDir, '--project'], projectDir, homeDir);
      const del = runWithEnv(
        ['del-plugin', 'test-marketplace', 'nonexistent-plugin'],
        projectDir,
        homeDir
      );
      expect(del.exitCode).toBe(1);
      expect(del.stdout + del.stderr).toContain('not installed');
      expect(del.stdout + del.stderr).toContain('plugin-a');
    } finally {
      await rm(homeDir, { recursive: true, force: true });
      await rm(projectDir, { recursive: true, force: true });
      await rm(repoDir, { recursive: true, force: true });
    }
  });
});
