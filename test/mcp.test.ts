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
