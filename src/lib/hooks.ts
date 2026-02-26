/**
 * Hooks = Cursor .cursor/hooks.json only.
 * Claude uses a different setup (.claude/settings.json, different format); not managed here.
 * Format: { "version": 1, "hooks": { "hookName": [ { "command": "path/to/script" } ] } }
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import { getCursorHooksPath } from './paths.js';

export interface HooksJson {
  version?: number;
  hooks: Record<string, Array<{ command: string }>>;
}

export interface HooksOptions {
  cwd?: string;
  global?: boolean;
}

export interface ListHooksResult {
  project: string[];
  global: string[];
  all: string[];
}

const DEFAULT_HOOKS: HooksJson = { version: 1, hooks: {} };

async function readHooksJson(path: string): Promise<HooksJson> {
  try {
    const raw = await readFile(path, 'utf-8');
    const parsed = JSON.parse(raw) as HooksJson;
    if (parsed.hooks && typeof parsed.hooks === 'object') {
      return { version: parsed.version ?? 1, hooks: parsed.hooks };
    }
  } catch {
    // missing or invalid
  }
  return { ...DEFAULT_HOOKS };
}

async function writeHooksJson(path: string, data: HooksJson): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify({ version: data.version ?? 1, hooks: data.hooks }, null, 2), 'utf-8');
}

export async function listHooks(options: HooksOptions = {}): Promise<ListHooksResult> {
  const cwd = options.cwd ?? process.cwd();
  const projectPath = getCursorHooksPath(false, cwd);
  const globalPath = getCursorHooksPath(true, cwd);
  const [projectData, globalData] = await Promise.all([
    readHooksJson(projectPath),
    readHooksJson(globalPath),
  ]);
  const project = Object.keys(projectData.hooks);
  const global = Object.keys(globalData.hooks);
  const all = [...new Set([...project, ...global])];
  return { project, global, all };
}

export async function addHook(
  hookName: string,
  command: string,
  options: HooksOptions = {}
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const includeGlobal = options.global ?? false;
  const path = getCursorHooksPath(includeGlobal, cwd);
  const data = await readHooksJson(path);
  const entries = data.hooks[hookName] ?? [];
  if (!entries.some((e) => e.command === command)) {
    entries.push({ command });
  }
  data.hooks[hookName] = entries;
  await writeHooksJson(path, data);
}

export async function removeHook(hookName: string, options: HooksOptions = {}): Promise<boolean> {
  const cwd = options.cwd ?? process.cwd();
  let removed = false;
  for (const global of [false, true]) {
    const path = getCursorHooksPath(global, cwd);
    const data = await readHooksJson(path);
    if (hookName in data.hooks) {
      delete data.hooks[hookName];
      await writeHooksJson(path, data);
      removed = true;
    }
  }
  return removed;
}

/**
 * Merge repo hooks into project or global .cursor/hooks.json (Cursor only).
 * Returns the list of (hookName, command) entries that were actually merged (not already present).
 */
export async function mergeHooksInto(
  repoHooks: HooksJson,
  global: boolean,
  cwd: string
): Promise<Array<{ hookName: string; command: string }>> {
  const path = getCursorHooksPath(global, cwd);
  const existing = await readHooksJson(path);
  const merged: Array<{ hookName: string; command: string }> = [];
  for (const [name, entries] of Object.entries(repoHooks.hooks ?? {})) {
    const existingEntries = existing.hooks[name] ?? [];
    const seen = new Set(existingEntries.map((e) => e.command));
    for (const e of entries) {
      if (!seen.has(e.command)) {
        existingEntries.push(e);
        seen.add(e.command);
        merged.push({ hookName: name, command: e.command });
      }
    }
    existing.hooks[name] = existingEntries;
  }
  await writeHooksJson(path, existing);
  return merged;
}

/**
 * Remove specific (hookName, command) entries from project or global .cursor/hooks.json.
 */
export async function removeHookEntries(
  entries: Array<{ hookName: string; command: string }>,
  global: boolean,
  cwd: string
): Promise<void> {
  if (entries.length === 0) return;
  const path = getCursorHooksPath(global, cwd);
  const data = await readHooksJson(path);
  const toRemove = new Set(entries.map((e) => `${e.hookName}\0${e.command}`));
  for (const key of Object.keys(data.hooks)) {
    const arr = data.hooks[key].filter(
      (e) => !toRemove.has(`${key}\0${e.command}`)
    );
    if (arr.length === 0) delete data.hooks[key];
    else data.hooks[key] = arr;
  }
  await writeHooksJson(path, data);
}

/**
 * Merge repo hooks into project .cursor/hooks.json (Cursor only).
 * @deprecated Use mergeHooksInto(repoHooks, false, cwd) for project scope.
 */
export async function mergeHooksIntoProject(repoHooks: HooksJson, cwd: string): Promise<void> {
  await mergeHooksInto(repoHooks, false, cwd);
}
