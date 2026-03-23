/**
 * MCP = Cursor .cursor/mcp.json only.
 * Install merges new server keys (original names); update overwrites only keys that already exist.
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

export async function readMcpJson(path: string): Promise<McpJson> {
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
 * For each server key in pluginMcp, if that key already exists in cursor mcp.json, replace its config.
 * Does not add new keys. Missing mcp.json is a no-op (no file created).
 */
export async function updateMcpServersInCursor(pluginMcp: McpJson, cursorPath: string): Promise<void> {
  const existing = await readMcpJson(cursorPath);
  const servers = existing.mcpServers ?? {};
  let changed = false;
  for (const [key, config] of Object.entries(pluginMcp.mcpServers ?? {})) {
    if (key in servers) {
      servers[key] = config;
      changed = true;
    }
  }
  if (changed) {
    await writeMcpJson(cursorPath, { mcpServers: servers });
  }
}

/**
 * Rename mcpServers keys (e.g. legacy prefixed → original). Skips if newKey already exists.
 */
export async function renameMcpKeys(cursorPath: string, renames: Record<string, string>): Promise<void> {
  const existing = await readMcpJson(cursorPath);
  const servers = existing.mcpServers ?? {};
  let changed = false;
  for (const [oldKey, newKey] of Object.entries(renames)) {
    if (oldKey in servers && !(newKey in servers)) {
      servers[newKey] = servers[oldKey];
      delete servers[oldKey];
      changed = true;
    }
  }
  if (changed) {
    await writeMcpJson(cursorPath, { mcpServers: servers });
  }
}
