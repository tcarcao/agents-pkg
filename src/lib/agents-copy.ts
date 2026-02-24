/**
 * Agent files are copied (not symlinked) into .cursor/agents so Cursor recognizes subagents.
 * This module handles copy on install and removal of those files on uninstall.
 */

import { readdir, copyFile, rm, mkdir } from 'fs/promises';
import { join } from 'path';
import { REPO_AGENTS_DIR } from './constants.js';

async function listAgentMdFiles(agentsDir: string): Promise<string[]> {
  try {
    const entries = await readdir(agentsDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith('.md'))
      .map((e) => e.name.replace(/\.md$/, ''));
  } catch {
    return [];
  }
}

/**
 * Copy agent .md files from plugin store to .cursor/agents (overwrites existing).
 * Ensures cursorAgentsDir exists.
 */
export async function copyAgentsFromPluginStore(
  pluginStorePath: string,
  cursorAgentsDir: string
): Promise<string[]> {
  const agentsDir = join(pluginStorePath, REPO_AGENTS_DIR);
  const names = await listAgentMdFiles(agentsDir);
  await mkdir(cursorAgentsDir, { recursive: true });
  for (const name of names) {
    const src = join(agentsDir, name + '.md');
    const dest = join(cursorAgentsDir, name + '.md');
    await copyFile(src, dest);
  }
  return names;
}

/**
 * Remove from cursorAgentsDir the agent files that belong to this plugin
 * (determined by listing the plugin store's agents dir). Call before deleting the store.
 */
export async function removeCopiedAgentsForPlugin(
  pluginStorePath: string,
  cursorAgentsDir: string
): Promise<void> {
  const agentsDir = join(pluginStorePath, REPO_AGENTS_DIR);
  const names = await listAgentMdFiles(agentsDir);
  for (const name of names) {
    const filePath = join(cursorAgentsDir, name + '.md');
    try {
      await rm(filePath, { force: true });
    } catch {
      // ignore missing or permission errors
    }
  }
}
