/**
 * MCP lib tests: mergeMcpIntoCursor (prefixed keys, idempotent) and removeMcpServersByPrefix.
 * Uses temp dir for mcp.json so real ~/.cursor is untouched.
 */

import { describe, it } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  mergeMcpIntoCursor,
  removeMcpServersByPrefix,
  removeMcpServersByKeys,
  getMcpKey,
  getLegacyMcpPrefix,
  type McpJson,
} from '../src/lib/mcp.js';

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'agents-pkg-mcp-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('mcp', () => {
  describe('getMcpKey', () => {
    it('returns pluginName:serverKey', () => {
      expect(getMcpKey('my-plugin', 'github')).toBe('my-plugin:github');
    });
  });

  describe('getLegacyMcpPrefix', () => {
    it('returns agents-pkg:marketplace/plugin:', () => {
      expect(getLegacyMcpPrefix('mk', 'pl')).toBe('agents-pkg:mk/pl:');
    });
  });

  describe('removeMcpServersByKeys', () => {
    it('removes only the given keys and leaves others', async () => {
      await withTempDir(async (dir) => {
        const cursorPath = join(dir, 'mcp.json');
        await mkdir(dir, { recursive: true });
        await writeFile(
          cursorPath,
          JSON.stringify({
            mcpServers: {
              keyA: { command: 'a' },
              keyB: { command: 'b' },
              keyC: { command: 'keep' },
            },
          }),
          'utf-8'
        );
        await removeMcpServersByKeys(cursorPath, ['keyA', 'keyB']);
        const raw = await readFile(cursorPath, 'utf-8');
        const data = JSON.parse(raw) as McpJson;
        expect(data.mcpServers!['keyA']).toBeUndefined();
        expect(data.mcpServers!['keyB']).toBeUndefined();
        expect(data.mcpServers!['keyC']).toEqual({ command: 'keep' });
      });
    });

    it('is no-op when keys array is empty (file unchanged)', async () => {
      await withTempDir(async (dir) => {
        const cursorPath = join(dir, 'mcp.json');
        await mkdir(dir, { recursive: true });
        const content = JSON.stringify({ mcpServers: { only: { command: 'x' } } });
        await writeFile(cursorPath, content, 'utf-8');
        await removeMcpServersByKeys(cursorPath, []);
        const raw = await readFile(cursorPath, 'utf-8');
        expect(raw).toBe(content);
      });
    });

    it('skips missing key without error, leaves others unchanged', async () => {
      await withTempDir(async (dir) => {
        const cursorPath = join(dir, 'mcp.json');
        await mkdir(dir, { recursive: true });
        await writeFile(
          cursorPath,
          JSON.stringify({
            mcpServers: {
              present: { command: 'keep' },
            },
          }),
          'utf-8'
        );
        await removeMcpServersByKeys(cursorPath, ['not-present']);
        const raw = await readFile(cursorPath, 'utf-8');
        const data = JSON.parse(raw) as McpJson;
        expect(data.mcpServers!['present']).toEqual({ command: 'keep' });
      });
    });
  });

  describe('mergeMcpIntoCursor', () => {
    it('merges plugin mcpServers with prefix into cursor mcp.json', async () => {
      await withTempDir(async (dir) => {
        const cursorPath = join(dir, 'mcp.json');
        const pluginMcp: McpJson = {
          mcpServers: {
            github: { command: 'npx', args: ['-y', 'github-mcp'] },
            linear: { url: 'https://mcp.linear.app/mcp' },
          },
        };
        const prefix = 'agents-pkg:my-marketplace/my-plugin:';

        await mergeMcpIntoCursor(pluginMcp, cursorPath, prefix);

        const raw = await readFile(cursorPath, 'utf-8');
        const data = JSON.parse(raw) as McpJson;
        expect(data.mcpServers!['agents-pkg:my-marketplace/my-plugin:github']).toEqual({
          command: 'npx',
          args: ['-y', 'github-mcp'],
        });
        expect(data.mcpServers!['agents-pkg:my-marketplace/my-plugin:linear']).toEqual({
          url: 'https://mcp.linear.app/mcp',
        });
      });
    });

    it('does not overwrite existing keys (idempotent reinstall)', async () => {
      await withTempDir(async (dir) => {
        const cursorPath = join(dir, 'mcp.json');
        await writeFile(
          cursorPath,
          JSON.stringify({
            mcpServers: {
              'agents-pkg:mk/pl:server': { command: 'existing' },
            },
          }),
          'utf-8'
        );
        const pluginMcp: McpJson = {
          mcpServers: {
            server: { command: 'new' },
          },
        };
        const prefix = 'agents-pkg:mk/pl:';

        await mergeMcpIntoCursor(pluginMcp, cursorPath, prefix);

        const raw = await readFile(cursorPath, 'utf-8');
        const data = JSON.parse(raw) as McpJson;
        expect(data.mcpServers!['agents-pkg:mk/pl:server']).toEqual({ command: 'existing' });
      });
    });

    it('creates file and dir if missing', async () => {
      await withTempDir(async (dir) => {
        const cursorPath = join(dir, 'sub', 'mcp.json');
        const pluginMcp: McpJson = {
          mcpServers: { s: { command: 'x' } },
        };
        await mergeMcpIntoCursor(pluginMcp, cursorPath, 'ap:');
        const raw = await readFile(cursorPath, 'utf-8');
        const data = JSON.parse(raw) as McpJson;
        expect(data.mcpServers!['ap:s']).toEqual({ command: 'x' });
      });
    });

    it('with plugin name prefix produces keys like plugin-a:github', async () => {
      await withTempDir(async (dir) => {
        const cursorPath = join(dir, 'mcp.json');
        const pluginMcp: McpJson = {
          mcpServers: {
            github: { command: 'npx', args: ['-y', 'github-mcp'] },
          },
        };
        const prefix = 'plugin-a:';
        await mergeMcpIntoCursor(pluginMcp, cursorPath, prefix);
        const raw = await readFile(cursorPath, 'utf-8');
        const data = JSON.parse(raw) as McpJson;
        expect(data.mcpServers![getMcpKey('plugin-a', 'github')]).toEqual({
          command: 'npx',
          args: ['-y', 'github-mcp'],
        });
      });
    });
  });

  describe('removeMcpServersByPrefix', () => {
    it('removes only keys starting with prefix', async () => {
      await withTempDir(async (dir) => {
        const cursorPath = join(dir, 'mcp.json');
        await mkdir(dir, { recursive: true });
        await writeFile(
          cursorPath,
          JSON.stringify({
            mcpServers: {
              'agents-pkg:mk/pl:one': { command: 'a' },
              'agents-pkg:mk/pl:two': { command: 'b' },
              'other-server': { command: 'keep' },
            },
          }),
          'utf-8'
        );

        await removeMcpServersByPrefix(cursorPath, 'agents-pkg:mk/pl:');

        const raw = await readFile(cursorPath, 'utf-8');
        const data = JSON.parse(raw) as McpJson;
        expect(data.mcpServers!['agents-pkg:mk/pl:one']).toBeUndefined();
        expect(data.mcpServers!['agents-pkg:mk/pl:two']).toBeUndefined();
        expect(data.mcpServers!['other-server']).toEqual({ command: 'keep' });
      });
    });

    it('leaves empty mcpServers object when all keys removed', async () => {
      await withTempDir(async (dir) => {
        const cursorPath = join(dir, 'mcp.json');
        await writeFile(
          cursorPath,
          JSON.stringify({
            mcpServers: {
              'agents-pkg:mk/pl:only': { command: 'x' },
            },
          }),
          'utf-8'
        );

        await removeMcpServersByPrefix(cursorPath, 'agents-pkg:mk/pl:');

        const raw = await readFile(cursorPath, 'utf-8');
        const data = JSON.parse(raw) as McpJson;
        expect(data.mcpServers).toEqual({});
      });
    });
  });
});
