/**
 * Integration tests for del-marketplace.
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
describe('integration del-marketplace', () => {
  it('removes entire marketplace; list shows empty', async () => {
    const homeDir = await createTempDir('agents-pkg-int-home-');
    const projectDir = await createTempDir('agents-pkg-int-project-');
    const repoDir = await createFakeMarketplaceRepo();
    try {
      runWithEnv(['add-plugin', repoDir, '--project'], projectDir, homeDir);
      const listBefore = listOutput(projectDir, homeDir);
      expect(listBefore).toContain('test-marketplace');

      const del = runWithEnv(
        ['del-marketplace', 'test-marketplace'],
        projectDir,
        homeDir
      );
      expect(del.exitCode).toBe(0);
      expect(del.stdout).toContain('Removed marketplace "test-marketplace"');

      const listAfter = listOutput(projectDir, homeDir);
      expect(listAfter).toContain('No marketplaces installed');
    } finally {
      await rm(homeDir, { recursive: true, force: true });
      await rm(projectDir, { recursive: true, force: true });
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it('with unknown name fails', async () => {
    const homeDir = await createTempDir('agents-pkg-int-home-');
    const projectDir = await createTempDir('agents-pkg-int-project-');
    try {
      const del = runWithEnv(
        ['del-marketplace', 'nonexistent-marketplace'],
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

  it('removes store and lock entry', async () => {
    const homeDir = await createTempDir('agents-pkg-int-home-');
    const projectDir = await createTempDir('agents-pkg-int-project-');
    const repoDir = await createFakeMarketplaceRepo();
    const lockPath = join(homeDir, AGENTS_DIR, LOCK_FILE);
    const storeRoot = join(homeDir, AGENTS_DIR, MARKETPLACE_DIR, 'test-marketplace');
    try {
      runWithEnv(['add-plugin', repoDir, '--project'], projectDir, homeDir);
      await access(storeRoot);

      runWithEnv(['del-marketplace', 'test-marketplace'], projectDir, homeDir);
      await expect(access(storeRoot)).rejects.toThrow();
      const lockAfter = JSON.parse(await readFile(lockPath, 'utf-8'));
      expect(lockAfter.marketplaces['test-marketplace']).toBeUndefined();
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

      runWithEnv(['del-marketplace', 'test-marketplace'], projectDir, homeDir);

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
});
