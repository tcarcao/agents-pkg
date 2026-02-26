/**
 * Integration tests for update.
 */

import { describe, it } from 'vitest';
import { rm, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import {
  createFakeMarketplaceRepo,
  createFakeMarketplaceRepoWithHooksAndMcp,
  runWithEnv,
  createTempDir,
  addPluginJsonVersion,
} from './integration-helpers.js';
import { expect } from 'vitest';
import { AGENTS_DIR, LOCK_FILE, MARKETPLACE_DIR } from '../src/lib/constants.js';
import { getMcpKey } from '../src/lib/mcp.js';

describe('integration update', () => {
  it('does not reinstall when version unchanged', async () => {
    const homeDir = await createTempDir('agents-pkg-int-home-');
    const projectDir = await createTempDir('agents-pkg-int-project-');
    const repoDir = await createFakeMarketplaceRepo();
    try {
      runWithEnv(['add-plugin', repoDir, '--project'], projectDir, homeDir);
      const update = runWithEnv(['update'], projectDir, homeDir);
      expect(update.exitCode).toBe(0);
      expect(update.stdout).not.toContain('Updating marketplace');
    } finally {
      await rm(homeDir, { recursive: true, force: true });
      await rm(projectDir, { recursive: true, force: true });
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it('on version bump removes hooks/MCP then reinstalls and refreshes pluginHooks', async () => {
    const homeDir = await createTempDir('agents-pkg-int-home-');
    const projectDir = await createTempDir('agents-pkg-int-project-');
    const repoDir = await createFakeMarketplaceRepoWithHooksAndMcp();
    const lockPath = join(homeDir, AGENTS_DIR, LOCK_FILE);
    const hooksPath = join(projectDir, '.cursor', 'hooks.json');
    const mcpPath = join(projectDir, '.cursor', 'mcp.json');
    const manifestPath = join(repoDir, '.cursor-plugin', 'marketplace.json');
    try {
      runWithEnv(['add-plugin', repoDir, '--project'], projectDir, homeDir);
      const lockBefore = JSON.parse(await readFile(lockPath, 'utf-8'));
      expect(lockBefore.marketplaces['test-marketplace'].pluginHooks?.['plugin-a']).toHaveLength(1);

      const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
      manifest.metadata = { version: '0.2.0' };
      await writeFile(manifestPath, JSON.stringify(manifest), 'utf-8');

      const update = runWithEnv(['update'], projectDir, homeDir);
      expect(update.exitCode).toBe(0);
      expect(update.stdout).toContain('Updating marketplace test-marketplace');
      expect(update.stdout).toContain('0.1.0 -> 0.2.0');

      const lockAfter = JSON.parse(await readFile(lockPath, 'utf-8'));
      expect(lockAfter.marketplaces['test-marketplace'].version).toBe('0.2.0');
      expect(lockAfter.marketplaces['test-marketplace'].pluginHooks?.['plugin-a']).toHaveLength(1);

      const hooks = JSON.parse(await readFile(hooksPath, 'utf-8'));
      expect(hooks.hooks['pre-commit']).toContainEqual({ command: '/repo/plugin-a/pre-commit' });
      const mcp = JSON.parse(await readFile(mcpPath, 'utf-8'));
      expect(mcp.mcpServers[getMcpKey('plugin-a', 'github')]).toBeDefined();
    } finally {
      await rm(homeDir, { recursive: true, force: true });
      await rm(projectDir, { recursive: true, force: true });
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it('when marketplace version unchanged and plugin removed from manifest, uninstalls that plugin', async () => {
    const homeDir = await createTempDir('agents-pkg-int-home-');
    const projectDir = await createTempDir('agents-pkg-int-project-');
    const repoDir = await createFakeMarketplaceRepo();
    const lockPath = join(homeDir, AGENTS_DIR, LOCK_FILE);
    const storeRoot = join(homeDir, AGENTS_DIR, MARKETPLACE_DIR, 'test-marketplace');
    const manifestPath = join(repoDir, '.cursor-plugin', 'marketplace.json');
    try {
      runWithEnv(['add-plugin', repoDir, '--project'], projectDir, homeDir);
      const lockBefore = JSON.parse(await readFile(lockPath, 'utf-8'));
      expect(lockBefore.marketplaces['test-marketplace'].pluginNames).toContain('plugin-a');
      expect(lockBefore.marketplaces['test-marketplace'].pluginNames).toContain('plugin-b');

      const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
      manifest.plugins = manifest.plugins.filter((p: { name: string }) => p.name !== 'plugin-b');
      await writeFile(manifestPath, JSON.stringify(manifest), 'utf-8');

      const update = runWithEnv(['update'], projectDir, homeDir);
      expect(update.exitCode).toBe(0);

      const lockAfter = JSON.parse(await readFile(lockPath, 'utf-8'));
      expect(lockAfter.marketplaces['test-marketplace'].pluginNames).not.toContain('plugin-b');
      expect(lockAfter.marketplaces['test-marketplace'].pluginNames).toContain('plugin-a');
      if (lockAfter.marketplaces['test-marketplace'].pluginVersions) {
        expect(lockAfter.marketplaces['test-marketplace'].pluginVersions['plugin-b']).toBeUndefined();
      }
      const { access } = await import('fs/promises');
      await expect(access(join(storeRoot, 'plugin-b'))).rejects.toThrow();
      await access(join(storeRoot, 'plugin-a'));
    } finally {
      await rm(homeDir, { recursive: true, force: true });
      await rm(projectDir, { recursive: true, force: true });
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it('when marketplace version unchanged and plugin version changed, reinstalls only that plugin', async () => {
    const homeDir = await createTempDir('agents-pkg-int-home-');
    const projectDir = await createTempDir('agents-pkg-int-project-');
    const repoDir = await createFakeMarketplaceRepo();
    const lockPath = join(homeDir, AGENTS_DIR, LOCK_FILE);
    const storeRoot = join(homeDir, AGENTS_DIR, MARKETPLACE_DIR, 'test-marketplace');
    try {
      runWithEnv(['add-plugin', repoDir, '--project'], projectDir, homeDir);
      const lockBefore = JSON.parse(await readFile(lockPath, 'utf-8'));
      expect(lockBefore.marketplaces['test-marketplace'].pluginVersions['plugin-a']).toBe('0.0.0');

      await addPluginJsonVersion(repoDir, 'plugin-a', '1.0.0');

      const update = runWithEnv(['update'], projectDir, homeDir);
      expect(update.exitCode).toBe(0);
      expect(update.stdout).not.toContain('Updating marketplace test-marketplace');

      const lockAfter = JSON.parse(await readFile(lockPath, 'utf-8'));
      expect(lockAfter.marketplaces['test-marketplace'].pluginVersions['plugin-a']).toBe('1.0.0');
      expect(lockAfter.marketplaces['test-marketplace'].pluginVersions['plugin-b']).toBe('0.0.0');
      const { access } = await import('fs/promises');
      await access(join(storeRoot, 'plugin-a'));
      await access(join(storeRoot, 'plugin-b'));
    } finally {
      await rm(homeDir, { recursive: true, force: true });
      await rm(projectDir, { recursive: true, force: true });
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it('when lock has no pluginMcpKeys (old install), update migrates MCP to new format and writes pluginMcpKeys to lock', async () => {
    const homeDir = await createTempDir('agents-pkg-int-home-');
    const projectDir = await createTempDir('agents-pkg-int-project-');
    const repoDir = await createFakeMarketplaceRepoWithHooksAndMcp();
    const lockPath = join(homeDir, AGENTS_DIR, LOCK_FILE);
    const mcpPath = join(projectDir, '.cursor', 'mcp.json');
    const legacyKey = 'agents-pkg:test-marketplace/plugin-a:github';
    try {
      runWithEnv(['add-plugin', repoDir, '--project'], projectDir, homeDir);
      const lock = JSON.parse(await readFile(lockPath, 'utf-8'));
      expect(lock.marketplaces['test-marketplace'].pluginMcpKeys?.['plugin-a']).toEqual(['plugin-a:github']);
      delete lock.marketplaces['test-marketplace'].pluginMcpKeys;
      await writeFile(lockPath, JSON.stringify(lock), 'utf-8');
      // Replicate real issue: mcp.json still has legacy-format key (e.g. from before the short-prefix fix)
      await writeFile(
        mcpPath,
        JSON.stringify({
          mcpServers: {
            [legacyKey]: { command: 'npx', args: ['-y', 'github-mcp'] },
          },
        }),
        'utf-8'
      );

      const update = runWithEnv(['update'], projectDir, homeDir);
      expect(update.exitCode).toBe(0);
      expect(update.stdout).not.toContain('Updating marketplace');

      // MCP file must have new-format key and must NOT have legacy key (fixes 60-char filter)
      const mcp = JSON.parse(await readFile(mcpPath, 'utf-8'));
      expect(mcp.mcpServers[legacyKey]).toBeUndefined();
      expect(mcp.mcpServers[getMcpKey('plugin-a', 'github')]).toBeDefined();
      expect(mcp.mcpServers[getMcpKey('plugin-a', 'github')]).toEqual({
        command: 'npx',
        args: ['-y', 'github-mcp'],
      });
      const lockAfter = JSON.parse(await readFile(lockPath, 'utf-8'));
      expect(lockAfter.marketplaces['test-marketplace'].pluginMcpKeys).toBeDefined();
      expect(lockAfter.marketplaces['test-marketplace'].pluginMcpKeys['plugin-a']).toEqual(['plugin-a:github']);
    } finally {
      await rm(homeDir, { recursive: true, force: true });
      await rm(projectDir, { recursive: true, force: true });
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it('when lock has no pluginVersions, update backfills from source and persists lock', async () => {
    const homeDir = await createTempDir('agents-pkg-int-home-');
    const projectDir = await createTempDir('agents-pkg-int-project-');
    const repoDir = await createFakeMarketplaceRepo();
    const lockPath = join(homeDir, AGENTS_DIR, LOCK_FILE);
    try {
      await addPluginJsonVersion(repoDir, 'plugin-a', '1.2.0');
      await addPluginJsonVersion(repoDir, 'plugin-b', '0.5.0');

      runWithEnv(['add-plugin', repoDir, '--project'], projectDir, homeDir);

      const lock = JSON.parse(await readFile(lockPath, 'utf-8'));
      expect(lock.marketplaces['test-marketplace'].pluginVersions).toBeDefined();
      delete lock.marketplaces['test-marketplace'].pluginVersions;
      await writeFile(lockPath, JSON.stringify(lock), 'utf-8');

      const update = runWithEnv(['update'], projectDir, homeDir);
      expect(update.exitCode).toBe(0);

      const lockAfter = JSON.parse(await readFile(lockPath, 'utf-8'));
      expect(lockAfter.marketplaces['test-marketplace'].pluginVersions).toBeDefined();
      expect(lockAfter.marketplaces['test-marketplace'].pluginVersions['plugin-a']).toBe('1.2.0');
      expect(lockAfter.marketplaces['test-marketplace'].pluginVersions['plugin-b']).toBe('0.5.0');
    } finally {
      await rm(homeDir, { recursive: true, force: true });
      await rm(projectDir, { recursive: true, force: true });
      await rm(repoDir, { recursive: true, force: true });
    }
  });
});
