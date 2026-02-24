/**
 * Marketplace manifest and store path tests.
 */

import { describe, it } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  readMarketplaceManifest,
  getMarketplaceStorePath,
  getPluginStorePath,
} from '../src/lib/marketplace.js';
import { expect } from 'vitest';

describe('marketplace', () => {
  describe('readMarketplaceManifest', () => {
    it('reads and parses valid manifest', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'agent-pkg-mp-'));
      try {
        await mkdir(join(dir, '.cursor-plugin'), { recursive: true });
        const manifest = {
          name: 'ai-engineering-kit',
          owner: { name: 'OLX' },
          metadata: { description: 'AI kit', version: '0.1.0' },
          plugins: [
            { name: 'ai-kit-global', source: './global', description: 'Global plugin' },
            { name: 'ai-kit-backend', source: './backend' },
          ],
        };
        await writeFile(
          join(dir, '.cursor-plugin', 'marketplace.json'),
          JSON.stringify(manifest),
          'utf-8'
        );
        const out = await readMarketplaceManifest(dir);
        expect(out.name).toBe('ai-engineering-kit');
        expect(out.metadata?.version).toBe('0.1.0');
        expect(out.plugins).toHaveLength(2);
        expect(out.plugins[0].name).toBe('ai-kit-global');
        expect(out.plugins[0].source).toBe('./global');
        expect(out.plugins[1].name).toBe('ai-kit-backend');
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it('throws when .cursor-plugin/marketplace.json is missing', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'agent-pkg-mp-'));
      try {
        await expect(readMarketplaceManifest(dir)).rejects.toThrow(/marketplace manifest/);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it('throws when name is missing', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'agent-pkg-mp-'));
      try {
        await mkdir(join(dir, '.cursor-plugin'), { recursive: true });
        await writeFile(
          join(dir, '.cursor-plugin', 'marketplace.json'),
          JSON.stringify({ plugins: [] }),
          'utf-8'
        );
        await expect(readMarketplaceManifest(dir)).rejects.toThrow(/name/);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it('throws when plugins is not an array', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'agent-pkg-mp-'));
      try {
        await mkdir(join(dir, '.cursor-plugin'), { recursive: true });
        await writeFile(
          join(dir, '.cursor-plugin', 'marketplace.json'),
          JSON.stringify({ name: 'x', plugins: {} }),
          'utf-8'
        );
        await expect(readMarketplaceManifest(dir)).rejects.toThrow(/plugins/);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });

  describe('getMarketplaceStorePath / getPluginStorePath', () => {
    it('returns paths under AGENT_PKG_HOME', async () => {
      const orig = process.env.AGENT_PKG_HOME;
      const dir = join(tmpdir(), 'agent-pkg-store-test');
      process.env.AGENT_PKG_HOME = dir;
      try {
        const store = getMarketplaceStorePath('ai-kit');
        expect(store).toBe(join(dir, '.agents', 'agent-pkg', 'marketplace', 'ai-kit'));
        const pluginStore = getPluginStorePath('ai-kit', 'ai-kit-global');
        expect(pluginStore).toBe(join(dir, '.agents', 'agent-pkg', 'marketplace', 'ai-kit', 'ai-kit-global'));
      } finally {
        if (orig !== undefined) process.env.AGENT_PKG_HOME = orig;
        else delete process.env.AGENT_PKG_HOME;
      }
    });
  });
});
