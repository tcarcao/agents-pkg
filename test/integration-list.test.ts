/**
 * Integration tests for list.
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

describe('integration list', () => {
  it('shows no marketplaces when none installed', async () => {
    const homeDir = await createTempDir('agents-pkg-int-home-');
    const projectDir = await createTempDir('agents-pkg-int-project-');
    try {
      const list = listOutput(projectDir, homeDir);
      expect(list).toContain('No marketplaces installed');
    } finally {
      await rm(homeDir, { recursive: true, force: true });
      await rm(projectDir, { recursive: true, force: true });
    }
  });

  it('shows marketplace name, version, scope, source and plugins after add-plugin', async () => {
    const homeDir = await createTempDir('agents-pkg-int-home-');
    const projectDir = await createTempDir('agents-pkg-int-project-');
    const repoDir = await createFakeMarketplaceRepo();
    try {
      runWithEnv(['add-plugin', repoDir, '--project'], projectDir, homeDir);
      const list = listOutput(projectDir, homeDir);
      expect(list).toContain('test-marketplace');
      expect(list).toContain('v0.1.0');
      expect(list).toContain('project');
      expect(list).toContain('source:');
      expect(list).toContain('plugin-a');
      expect(list).toContain('plugin-b');
    } finally {
      await rm(homeDir, { recursive: true, force: true });
      await rm(projectDir, { recursive: true, force: true });
      await rm(repoDir, { recursive: true, force: true });
    }
  });
});
