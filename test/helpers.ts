/**
 * Test helpers: temp dir, run CLI, strip ANSI.
 * CLI is run via built dist/cli.js (run `pnpm build` before tests).
 */

import { mkdtemp, rm } from 'fs/promises';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CLI_PATH = join(ROOT, 'dist', 'cli.js');

export function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Create a temporary directory. Caller should rm it when done.
 */
export async function createTempDir(prefix = 'agents-pkg-test-'): Promise<string> {
  return await mkdtemp(join(tmpdir(), prefix));
}

export interface RunCliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Run agents-pkg CLI with args; returns { stdout, stderr, exitCode }.
 * Uses compiled dist/cli.js.
 */
export function runCli(
  args: string[],
  cwd: string = ROOT,
  env: Record<string, string> = {}
): RunCliResult {
  const result = spawnSync(process.execPath, [CLI_PATH, ...args], {
    encoding: 'utf-8',
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
    timeout: 15000,
  });
  return {
    stdout: stripAnsi(result.stdout || ''),
    stderr: stripAnsi(result.stderr || ''),
    exitCode: result.status ?? (result.signal ? 1 : 0),
  };
}

export function runCliOutput(args: string[], cwd: string = ROOT): string {
  const r = runCli(args, cwd);
  return (r.stdout || r.stderr).trim();
}

export { ROOT };
