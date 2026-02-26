/**
 * MCP = Cursor .cursor/mcp.json only.
 * Merge plugin mcp/mcp.json into single file with prefixed keys for clean removal.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';

export interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  auth?: Record<string, string>;
  type?: string;
  envFile?: string;
  [key: string]: unknown;
}

export interface McpJson {
  mcpServers?: Record<string, McpServerConfig>;
}

/** Build MCP server key from plugin name and original server key (new format). */
export function getMcpKey(pluginName: string, serverKey: string): string {
  return pluginName + ':' + serverKey;
}

/** Legacy prefix for migration removal (agents-pkg:marketplace/plugin:). */
export function getLegacyMcpPrefix(marketplaceName: string, pluginName: string): string {
  return `agents-pkg:${marketplaceName}/${pluginName}:`;
}

async function readMcpJson(path: string): Promise<McpJson> {
  try {
    const raw = await readFile(path, 'utf-8');
    const parsed = JSON.parse(raw) as McpJson;
    if (parsed.mcpServers && typeof parsed.mcpServers === 'object') {
      return { mcpServers: parsed.mcpServers };
    }
  } catch {
    // missing or invalid
  }
  return { mcpServers: {} };
}

async function writeMcpJson(path: string, data: McpJson): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    JSON.stringify({ mcpServers: data.mcpServers ?? {} }, null, 2),
    'utf-8'
  );
}

/**
 * Merge plugin's mcpServers into cursor mcp.json under prefixed keys.
 * Does not overwrite existing keys that already have the same prefix (idempotent).
 */
export async function mergeMcpIntoCursor(
  pluginMcp: McpJson,
  cursorPath: string,
  prefix: string
): Promise<void> {
  const existing = await readMcpJson(cursorPath);
  const servers = existing.mcpServers ?? {};
  for (const [key, config] of Object.entries(pluginMcp.mcpServers ?? {})) {
    const prefixedKey = prefix + key;
    if (!(prefixedKey in servers)) {
      servers[prefixedKey] = config;
    }
  }
  await writeMcpJson(cursorPath, { mcpServers: servers });
}

/**
 * Remove all mcpServers keys that start with the given prefix.
 */
export async function removeMcpServersByPrefix(
  cursorPath: string,
  prefix: string
): Promise<void> {
  const existing = await readMcpJson(cursorPath);
  const servers = existing.mcpServers ?? {};
  let changed = false;
  for (const key of Object.keys(servers)) {
    if (key.startsWith(prefix)) {
      delete servers[key];
      changed = true;
    }
  }
  if (changed) {
    await writeMcpJson(cursorPath, { mcpServers: servers });
  }
}

/**
 * Remove exactly the given mcpServers keys. Missing keys are skipped (no error).
 */
export async function removeMcpServersByKeys(
  cursorPath: string,
  keys: string[]
): Promise<void> {
  if (keys.length === 0) return;
  const existing = await readMcpJson(cursorPath);
  const servers = existing.mcpServers ?? {};
  let changed = false;
  for (const key of keys) {
    if (key in servers) {
      delete servers[key];
      changed = true;
    }
  }
  if (changed) {
    await writeMcpJson(cursorPath, { mcpServers: servers });
  }
}
