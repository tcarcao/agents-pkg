/**
 * MCP lib tests: mergeMcpIntoCursor, updateMcpServersInCursor, renameMcpKeys.
 * Uses temp dir for mcp.json so real ~/.cursor is untouched.
 */

import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, mkdir, access } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  mergeMcpIntoCursor,
  updateMcpServersInCursor,
  renameMcpKeys,
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
  describe('updateMcpServersInCursor', () => {
    it('updates existing key config', async () => {
      await withTempDir(async (dir) => {
        const cursorPath = join(dir, 'mcp.json');
        await mkdir(dir, { recursive: true });
        await writeFile(
          cursorPath,
          JSON.stringify({ mcpServers: { github: { command: 'old' } } }),
          'utf-8'
        );
        const pluginMcp: McpJson = { mcpServers: { github: { command: 'new' } } };
        await updateMcpServersInCursor(pluginMcp, cursorPath);
        const data = JSON.parse(await readFile(cursorPath, 'utf-8')) as McpJson;
        expect(data.mcpServers!.github).toEqual({ command: 'new' });
      });
    });

    it('updates only keys that already exist; does not add new keys', async () => {
      await withTempDir(async (dir) => {
        const cursorPath = join(dir, 'mcp.json');
        await mkdir(dir, { recursive: true });
        await writeFile(
          cursorPath,
          JSON.stringify({ mcpServers: { github: { command: 'a' } } }),
          'utf-8'
        );
        const pluginMcp: McpJson = {
          mcpServers: {
            github: { command: 'b' },
            slack: { command: 'c' },
          },
        };
        await updateMcpServersInCursor(pluginMcp, cursorPath);
        const data = JSON.parse(await readFile(cursorPath, 'utf-8')) as McpJson;
        expect(data.mcpServers!.github).toEqual({ command: 'b' });
        expect(data.mcpServers!.slack).toBeUndefined();
      });
    });

    it('is no-op when no plugin keys match cursor keys', async () => {
      await withTempDir(async (dir) => {
        const cursorPath = join(dir, 'mcp.json');
        await mkdir(dir, { recursive: true });
        const before = JSON.stringify({ mcpServers: { github: { command: 'keep' } } });
        await writeFile(cursorPath, before, 'utf-8');
        await updateMcpServersInCursor({ mcpServers: { slack: { command: 'x' } } }, cursorPath);
        expect(await readFile(cursorPath, 'utf-8')).toBe(before);
      });
    });

    it('when mcp.json missing, does not create a file', async () => {
      await withTempDir(async (dir) => {
        const cursorPath = join(dir, 'nested', 'mcp.json');
        await updateMcpServersInCursor({ mcpServers: { github: { command: 'x' } } }, cursorPath);
        await expect(access(cursorPath)).rejects.toThrow();
      });
    });
  });

  describe('renameMcpKeys', () => {
    it('renames prefixed keys to original names when new key is free', async () => {
      await withTempDir(async (dir) => {
        const cursorPath = join(dir, 'mcp.json');
        await mkdir(dir, { recursive: true });
        await writeFile(
          cursorPath,
          JSON.stringify({
            mcpServers: { 'plugin-a:github': { command: 'npx', args: ['-y', 'github-mcp'] } },
          }),
          'utf-8'
        );
        await renameMcpKeys(cursorPath, { 'plugin-a:github': 'github' });
        const data = JSON.parse(await readFile(cursorPath, 'utf-8')) as McpJson;
        expect(data.mcpServers!['plugin-a:github']).toBeUndefined();
        expect(data.mcpServers!.github).toEqual({ command: 'npx', args: ['-y', 'github-mcp'] });
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

    it('with non-empty prefix can produce keys like plugin-a:github', async () => {
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
        expect(data.mcpServers!['plugin-a:github']).toEqual({
          command: 'npx',
          args: ['-y', 'github-mcp'],
        });
      });
    });

    it('with empty prefix uses original server key names', async () => {
      await withTempDir(async (dir) => {
        const cursorPath = join(dir, 'mcp.json');
        const pluginMcp: McpJson = {
          mcpServers: { github: { command: 'npx', args: ['-y', 'github-mcp'] } },
        };
        await mergeMcpIntoCursor(pluginMcp, cursorPath, '');
        const data = JSON.parse(await readFile(cursorPath, 'utf-8')) as McpJson;
        expect(data.mcpServers!.github).toEqual({ command: 'npx', args: ['-y', 'github-mcp'] });
      });
    });
  });
});
