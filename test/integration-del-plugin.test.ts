/**
 * Integration tests for del-plugin.
 */

import { describe, it } from 'vitest';
import { rm, readFile } from 'fs/promises';
import { join } from 'path';
import {
  createFakeMarketplaceRepo,
  createFakeMarketplaceRepoWithHooksAndMcp,
  runWithEnv,
  listOutput,
  createTempDir,
} from './integration-helpers.js';
import { expect } from 'vitest';
import { getMcpKey } from '../src/lib/mcp.js';
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

  it('removes hook entries and MCP keys for the removed plugin', async () => {
    const homeDir = await createTempDir('agents-pkg-int-home-');
    const projectDir = await createTempDir('agents-pkg-int-project-');
    const repoDir = await createFakeMarketplaceRepoWithHooksAndMcp();
    const hooksPath = join(projectDir, '.cursor', 'hooks.json');
    const mcpPath = join(projectDir, '.cursor', 'mcp.json');
    try {
      runWithEnv(['add-plugin', repoDir, '--project'], projectDir, homeDir);
      expect((JSON.parse(await readFile(hooksPath, 'utf-8'))).hooks['pre-commit']).toBeDefined();
      expect((JSON.parse(await readFile(mcpPath, 'utf-8'))).mcpServers[getMcpKey('plugin-a', 'github')]).toBeDefined();

      const del = runWithEnv(
        ['del-plugin', 'test-marketplace', 'plugin-a'],
        projectDir,
        homeDir
      );
      expect(del.exitCode).toBe(0);

      const hooks = JSON.parse(await readFile(hooksPath, 'utf-8'));
      expect(hooks.hooks['pre-commit']).toBeUndefined();
      const mcp = JSON.parse(await readFile(mcpPath, 'utf-8'));
      expect(mcp.mcpServers[getMcpKey('plugin-a', 'github')]).toBeUndefined();
    } finally {
      await rm(homeDir, { recursive: true, force: true });
      await rm(projectDir, { recursive: true, force: true });
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it('removes legacy-format MCP key when lock has no pluginMcpKeys (migration)', async () => {
    const homeDir = await createTempDir('agents-pkg-int-home-');
    const projectDir = await createTempDir('agents-pkg-int-project-');
    const repoDir = await createFakeMarketplaceRepoWithHooksAndMcp();
    const lockPath = join(homeDir, AGENTS_DIR, LOCK_FILE);
    const mcpPath = join(projectDir, '.cursor', 'mcp.json');
    try {
      runWithEnv(['add-plugin', repoDir, '--project'], projectDir, homeDir);
      const lock = JSON.parse(await readFile(lockPath, 'utf-8'));
      const legacyKey = 'agents-pkg:test-marketplace/plugin-a:github';
      expect(lock.marketplaces['test-marketplace'].pluginMcpKeys?.['plugin-a']).toEqual(['plugin-a:github']);
      const mcpBefore = JSON.parse(await readFile(mcpPath, 'utf-8'));
      expect(mcpBefore.mcpServers[getMcpKey('plugin-a', 'github')]).toBeDefined();

      delete lock.marketplaces['test-marketplace'].pluginMcpKeys;
      await writeFile(lockPath, JSON.stringify(lock), 'utf-8');
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
      expect(mcpAfter.mcpServers[legacyKey]).toBeUndefined();
    } finally {
      await rm(homeDir, { recursive: true, force: true });
      await rm(projectDir, { recursive: true, force: true });
      await rm(repoDir, { recursive: true, force: true });
    }
  });
});
