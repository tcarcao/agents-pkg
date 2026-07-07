/**
 * Integration tests for del-plugin.
 */

import { describe, it } from 'vitest';
import { rm, readFile, access, symlink } from 'fs/promises';
import { join } from 'path';
import {
  createFakeMarketplaceRepo,
  createFakeMarketplaceRepoWithHooksAndMcp,
  runWithEnv,
  globalInstallEnv,
  listOutput,
  createTempDir,
} from './integration-helpers.js';
import { expect } from 'vitest';
import { AGENTS_DIR, LOCK_FILE } from '../src/lib/constants.js';
import { mkdir, writeFile } from 'fs/promises';

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

  it('global del-plugin removes plugins/local directory', async () => {
    const homeDir = await createTempDir('agents-pkg-int-home-');
    const projectDir = await createTempDir('agents-pkg-int-project-');
    const repoDir = await createFakeMarketplaceRepo();
    const localPluginB = join(homeDir, '.cursor', 'plugins', 'local', 'plugin-b');
    try {
      runWithEnv(['add-plugin', repoDir], projectDir, homeDir, globalInstallEnv(homeDir));
      await access(localPluginB);

      const del = runWithEnv(
        ['del-plugin', 'test-marketplace', 'plugin-b'],
        projectDir,
        homeDir,
        globalInstallEnv(homeDir)
      );
      expect(del.exitCode).toBe(0);

      await expect(access(localPluginB)).rejects.toThrow();
      const list = listOutput(projectDir, homeDir);
      expect(list).toContain('plugin-a');
      expect(list).not.toContain('plugin-b');
    } finally {
      await rm(homeDir, { recursive: true, force: true });
      await rm(projectDir, { recursive: true, force: true });
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it('global del-plugin removes legacy flattened install leftovers', async () => {
    const homeDir = await createTempDir('agents-pkg-int-home-');
    const projectDir = await createTempDir('agents-pkg-int-project-');
    const repoDir = await createFakeMarketplaceRepo();
    const localPluginB = join(homeDir, '.cursor', 'plugins', 'local', 'plugin-b');
    const legacyStoreSkill = join(homeDir, AGENTS_DIR, 'agents-pkg', 'marketplace', 'test-marketplace', 'plugin-b', 'skills', 'baz');
    const legacySkillLink = join(homeDir, '.cursor', 'skills', 'baz');
    try {
      runWithEnv(['add-plugin', repoDir], projectDir, homeDir, globalInstallEnv(homeDir));
      await mkdir(legacyStoreSkill, { recursive: true });
      await writeFile(join(legacyStoreSkill, 'SKILL.md'), '# Legacy Baz skill\n', 'utf-8');
      await mkdir(join(homeDir, '.cursor', 'skills'), { recursive: true });
      await symlink(legacyStoreSkill, legacySkillLink);

      const del = runWithEnv(
        ['del-plugin', 'test-marketplace', 'plugin-b'],
        projectDir,
        homeDir,
        globalInstallEnv(homeDir)
      );
      expect(del.exitCode).toBe(0);

      await expect(access(localPluginB)).rejects.toThrow();
      await expect(access(legacySkillLink)).rejects.toThrow();
      await expect(access(join(homeDir, AGENTS_DIR, 'agents-pkg', 'marketplace', 'test-marketplace', 'plugin-b'))).rejects.toThrow();
    } finally {
      await rm(homeDir, { recursive: true, force: true });
      await rm(projectDir, { recursive: true, force: true });
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it('removes hook entries but leaves MCP server entries in mcp.json', async () => {
    const homeDir = await createTempDir('agents-pkg-int-home-');
    const projectDir = await createTempDir('agents-pkg-int-project-');
    const repoDir = await createFakeMarketplaceRepoWithHooksAndMcp();
    const hooksPath = join(projectDir, '.cursor', 'hooks.json');
    const mcpPath = join(projectDir, '.cursor', 'mcp.json');
    try {
      runWithEnv(['add-plugin', repoDir, '--project'], projectDir, homeDir);
      expect((JSON.parse(await readFile(hooksPath, 'utf-8'))).hooks['pre-commit']).toBeDefined();
      expect((JSON.parse(await readFile(mcpPath, 'utf-8'))).mcpServers.github).toBeDefined();

      const del = runWithEnv(
        ['del-plugin', 'test-marketplace', 'plugin-a'],
        projectDir,
        homeDir
      );
      expect(del.exitCode).toBe(0);

      const hooks = JSON.parse(await readFile(hooksPath, 'utf-8'));
      expect(hooks.hooks['pre-commit']).toBeUndefined();
      const mcp = JSON.parse(await readFile(mcpPath, 'utf-8'));
      expect(mcp.mcpServers.github).toEqual({
        command: 'npx',
        args: ['-y', 'github-mcp'],
      });
    } finally {
      await rm(homeDir, { recursive: true, force: true });
      await rm(projectDir, { recursive: true, force: true });
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it('does not remove legacy-format MCP key from mcp.json on del-plugin', async () => {
    const homeDir = await createTempDir('agents-pkg-int-home-');
    const projectDir = await createTempDir('agents-pkg-int-project-');
    const repoDir = await createFakeMarketplaceRepoWithHooksAndMcp();
    const lockPath = join(homeDir, AGENTS_DIR, LOCK_FILE);
    const mcpPath = join(projectDir, '.cursor', 'mcp.json');
    const legacyKey = 'agents-pkg:test-marketplace/plugin-a:github';
    try {
      runWithEnv(['add-plugin', repoDir, '--project'], projectDir, homeDir);
      await mkdir(join(projectDir, '.cursor'), { recursive: true });
      const mcpWithLegacyOnly: Record<string, unknown> = {
        mcpServers: { [legacyKey]: { command: 'npx', args: ['-y', 'github-mcp'] } },
      };
      await writeFile(mcpPath, JSON.stringify(mcpWithLegacyOnly), 'utf-8');

      const del = runWithEnv(
        ['del-plugin', 'test-marketplace', 'plugin-a'],
        projectDir,
        homeDir
      );
      expect(del.exitCode).toBe(0);

      const mcpAfter = JSON.parse(await readFile(mcpPath, 'utf-8'));
      expect(mcpAfter.mcpServers[legacyKey]).toEqual({ command: 'npx', args: ['-y', 'github-mcp'] });
      const lockAfter = JSON.parse(await readFile(lockPath, 'utf-8'));
      expect(lockAfter.marketplaces['test-marketplace'].pluginMcpKeys?.['plugin-a']).toBeUndefined();
    } finally {
      await rm(homeDir, { recursive: true, force: true });
      await rm(projectDir, { recursive: true, force: true });
      await rm(repoDir, { recursive: true, force: true });
    }
  });
});
