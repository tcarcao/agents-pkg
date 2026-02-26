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
  readPluginVersion,
  getPluginVersionFromSource,
} from '../src/lib/marketplace.js';
import { expect } from 'vitest';

describe('marketplace', () => {
  describe('readMarketplaceManifest', () => {
    it('reads and parses valid manifest', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'agents-pkg-mp-'));
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

    it('parses optional version on plugin entries', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'agents-pkg-mp-'));
      try {
        await mkdir(join(dir, '.cursor-plugin'), { recursive: true });
        await writeFile(
          join(dir, '.cursor-plugin', 'marketplace.json'),
          JSON.stringify({
            name: 'x',
            plugins: [
              { name: 'p1', source: './p1', version: '1.0.0' },
              { name: 'p2', source: './p2' },
            ],
          }),
          'utf-8'
        );
        const out = await readMarketplaceManifest(dir);
        expect(out.plugins[0].version).toBe('1.0.0');
        expect(out.plugins[1].version).toBeUndefined();
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it('throws when .cursor-plugin/marketplace.json is missing', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'agents-pkg-mp-'));
      try {
        await expect(readMarketplaceManifest(dir)).rejects.toThrow(/marketplace manifest/);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it('throws when name is missing', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'agents-pkg-mp-'));
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
      const dir = await mkdtemp(join(tmpdir(), 'agents-pkg-mp-'));
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

  describe('readPluginVersion', () => {
    it('returns 0.0.0 when plugin.json is missing', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'agents-pkg-plugin-'));
      try {
        const version = await readPluginVersion(dir);
        expect(version).toBe('0.0.0');
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it('returns version when plugin.json exists with version field', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'agents-pkg-plugin-'));
      try {
        await mkdir(join(dir, '.cursor-plugin'), { recursive: true });
        await writeFile(join(dir, '.cursor-plugin', 'plugin.json'), JSON.stringify({ version: '1.2.3' }), 'utf-8');
        const version = await readPluginVersion(dir);
        expect(version).toBe('1.2.3');
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it('returns 0.0.0 when plugin.json exists only at plugin root (old location ignored)', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'agents-pkg-plugin-'));
      try {
        await writeFile(join(dir, 'plugin.json'), JSON.stringify({ version: '1.2.3' }), 'utf-8');
        const version = await readPluginVersion(dir);
        expect(version).toBe('0.0.0');
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it('returns version from .cursor-plugin/plugin.json when both locations exist', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'agents-pkg-plugin-'));
      try {
        await writeFile(join(dir, 'plugin.json'), JSON.stringify({ version: '0.0.0' }), 'utf-8');
        await mkdir(join(dir, '.cursor-plugin'), { recursive: true });
        await writeFile(join(dir, '.cursor-plugin', 'plugin.json'), JSON.stringify({ version: '2.0.0' }), 'utf-8');
        const version = await readPluginVersion(dir);
        expect(version).toBe('2.0.0');
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it('returns 0.0.0 when plugin.json is invalid or empty', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'agents-pkg-plugin-'));
      try {
        await mkdir(join(dir, '.cursor-plugin'), { recursive: true });
        await writeFile(join(dir, '.cursor-plugin', 'plugin.json'), 'not json', 'utf-8');
        const version = await readPluginVersion(dir);
        expect(version).toBe('0.0.0');
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });

  describe('getPluginVersionFromSource', () => {
    it('returns plugin.version when present on manifest plugin', async () => {
      const sourceDir = await mkdtemp(join(tmpdir(), 'agents-pkg-src-'));
      try {
        const plugin = { name: 'p', source: './p', version: '2.0.0' as string };
        const version = await getPluginVersionFromSource(plugin, sourceDir);
        expect(version).toBe('2.0.0');
      } finally {
        await rm(sourceDir, { recursive: true, force: true });
      }
    });

    it('returns readPluginVersion result when plugin has no version', async () => {
      const sourceDir = await mkdtemp(join(tmpdir(), 'agents-pkg-src-'));
      await mkdir(join(sourceDir, 'p', '.cursor-plugin'), { recursive: true });
      await writeFile(join(sourceDir, 'p', '.cursor-plugin', 'plugin.json'), JSON.stringify({ version: '3.0.0' }), 'utf-8');
      try {
        const plugin = { name: 'p', source: './p' };
        const version = await getPluginVersionFromSource(plugin, sourceDir);
        expect(version).toBe('3.0.0');
      } finally {
        await rm(sourceDir, { recursive: true, force: true });
      }
    });

    it('returns 0.0.0 when plugin has no version and no plugin.json', async () => {
      const sourceDir = await mkdtemp(join(tmpdir(), 'agents-pkg-src-'));
      await mkdir(join(sourceDir, 'p'), { recursive: true });
      try {
        const plugin = { name: 'p', source: './p' };
        const version = await getPluginVersionFromSource(plugin, sourceDir);
        expect(version).toBe('0.0.0');
      } finally {
        await rm(sourceDir, { recursive: true, force: true });
      }
    });
  });

  describe('getMarketplaceStorePath / getPluginStorePath', () => {
    it('returns paths under AGENTS_PKG_HOME', async () => {
      const orig = process.env.AGENTS_PKG_HOME;
      const dir = join(tmpdir(), 'agents-pkg-store-test');
      process.env.AGENTS_PKG_HOME = dir;
      try {
        const store = getMarketplaceStorePath('ai-kit');
        expect(store).toBe(join(dir, '.agents', 'agents-pkg', 'marketplace', 'ai-kit'));
        const pluginStore = getPluginStorePath('ai-kit', 'ai-kit-global');
        expect(pluginStore).toBe(join(dir, '.agents', 'agents-pkg', 'marketplace', 'ai-kit', 'ai-kit-global'));
      } finally {
        if (orig !== undefined) process.env.AGENTS_PKG_HOME = orig;
        else delete process.env.AGENTS_PKG_HOME;
      }
    });
  });
});
