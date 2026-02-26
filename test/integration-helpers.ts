/**
 * Shared helpers for integration tests.
 * Uses AGENTS_PKG_HOME and --project so tests don't touch real home or project.
 */

import { mkdtemp, mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { runCli, createTempDir } from './helpers.js';

/** Create a minimal marketplace repo: manifest + two plugins with agents/commands/skills so install succeeds. */
export async function createFakeMarketplaceRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'agents-pkg-repo-'));
  await mkdir(join(dir, '.cursor-plugin'), { recursive: true });
  await writeFile(
    join(dir, '.cursor-plugin', 'marketplace.json'),
    JSON.stringify({
      name: 'test-marketplace',
      metadata: { version: '0.1.0' },
      plugins: [
        { name: 'plugin-a', source: './plugin-a' },
        { name: 'plugin-b', source: './plugin-b' },
      ],
    }),
    'utf-8'
  );
  await mkdir(join(dir, 'plugin-a', 'agents'), { recursive: true });
  await mkdir(join(dir, 'plugin-a', 'commands'), { recursive: true });
  await writeFile(join(dir, 'plugin-a', 'agents', 'foo.md'), '# Foo agent\n', 'utf-8');
  await writeFile(join(dir, 'plugin-a', 'commands', 'bar.md'), '# Bar command\n', 'utf-8');
  await mkdir(join(dir, 'plugin-b', 'skills', 'baz'), { recursive: true });
  await writeFile(join(dir, 'plugin-b', 'skills', 'baz', 'SKILL.md'), '# Baz skill\n', 'utf-8');
  return dir;
}

/** Same as createFakeMarketplaceRepo but plugin-a also has hooks/hooks.json and mcp/mcp.json. */
export async function createFakeMarketplaceRepoWithHooksAndMcp(): Promise<string> {
  const dir = await createFakeMarketplaceRepo();
  await mkdir(join(dir, 'plugin-a', 'hooks'), { recursive: true });
  await writeFile(
    join(dir, 'plugin-a', 'hooks', 'hooks.json'),
    JSON.stringify({
      version: 1,
      hooks: {
        'pre-commit': [{ command: '/repo/plugin-a/pre-commit' }],
      },
    }),
    'utf-8'
  );
  await mkdir(join(dir, 'plugin-a', 'mcp'), { recursive: true });
  await writeFile(
    join(dir, 'plugin-a', 'mcp', 'mcp.json'),
    JSON.stringify({
      mcpServers: {
        github: { command: 'npx', args: ['-y', 'github-mcp'] },
      },
    }),
    'utf-8'
  );
  return dir;
}

/** Add optional plugin.json with version to a plugin dir (for update tests that need per-plugin version). */
export async function addPluginJsonVersion(repoDir: string, pluginName: string, version: string): Promise<void> {
  await mkdir(join(repoDir, pluginName, '.cursor-plugin'), { recursive: true });
  await writeFile(
    join(repoDir, pluginName, '.cursor-plugin', 'plugin.json'),
    JSON.stringify({ version }),
    'utf-8'
  );
}

/** Set version on a plugin entry in the marketplace manifest (for update tests). */
export async function setPluginVersionInManifest(repoDir: string, pluginName: string, version: string): Promise<void> {
  const { readFile } = await import('fs/promises');
  const path = join(repoDir, '.cursor-plugin', 'marketplace.json');
  const manifest = JSON.parse(await readFile(path, 'utf-8'));
  const plugin = manifest.plugins?.find((p: { name: string }) => p.name === pluginName);
  if (plugin) plugin.version = version;
  await writeFile(path, JSON.stringify(manifest), 'utf-8');
}

export function runWithEnv(args: string[], cwd: string, home: string) {
  return runCli(args, cwd, { AGENTS_PKG_HOME: home });
}

export function listOutput(cwd: string, home: string): string {
  const r = runWithEnv(['list'], cwd, home);
  return (r.stdout || r.stderr).trim();
}

export { createTempDir };
