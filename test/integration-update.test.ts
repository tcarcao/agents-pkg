/**
 * Integration tests for update.
 */

import { describe, it } from 'vitest';
import { rm } from 'fs/promises';
import {
  createFakeMarketplaceRepo,
  runWithEnv,
  createTempDir,
} from './integration-helpers.js';
import { expect } from 'vitest';

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
});
