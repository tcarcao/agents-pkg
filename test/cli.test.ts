/**
 * CLI tests: help, version, unknown command, add-plugin, del-plugin, update.
 * Runs the built dist/cli.js — run `pnpm build` before tests.
 */

import { describe, it } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runCli, runCliOutput, ROOT } from './helpers.js';
import { expect } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(__dirname, '..');

describe('agents-pkg CLI', () => {
  describe('--help', () => {
    it('displays usage with add-plugin, del-plugin, update', () => {
      const output = runCliOutput(['--help'], ROOT);
      expect(output).toContain('Usage: agents-pkg <command>');
      expect(output).toContain('add-plugin');
      expect(output).toContain('del-plugin');
      expect(output).toContain('update');
      expect(output).toContain('.cursor-plugin/marketplace.json');
    });

    it('same output for -h', () => {
      const h = runCliOutput(['-h'], ROOT);
      const help = runCliOutput(['--help'], ROOT);
      expect(h).toBe(help);
    });
  });

  describe('--version', () => {
    it('displays version number', () => {
      const output = runCliOutput(['--version'], ROOT);
      expect(output.trim()).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('matches package.json version', () => {
      const output = runCliOutput(['--version'], ROOT);
      const pkg = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf-8')) as { version: string };
      expect(output.trim()).toBe(pkg.version);
    });
  });

  describe('no arguments', () => {
    it('displays banner with add-plugin and update', () => {
      const output = runCliOutput([], ROOT);
      expect(output).toContain('agents-pkg');
      expect(output).toContain('add-plugin');
      expect(output).toContain('del-plugin');
      expect(output).toContain('update');
    });
  });

  describe('unknown command', () => {
    it('exits non-zero and prints error', () => {
      const result = runCli(['unknown-command'], ROOT);
      expect(result.exitCode).toBe(1);
      expect(result.stdout.includes('Unknown command') || result.stderr.includes('Unknown command')).toBe(true);
    });
  });

  describe('add-plugin', () => {
    it('with no args exits non-zero and prints usage', () => {
      const result = runCli(['add-plugin'], ROOT);
      expect(result.exitCode).toBe(1);
      expect(result.stdout + result.stderr).toContain('Usage: agents-pkg add-plugin <source>');
    });
  });

  describe('del-plugin', () => {
    it('with no args exits non-zero and prints usage', () => {
      const result = runCli(['del-plugin'], ROOT);
      expect(result.exitCode).toBe(1);
      expect(result.stdout + result.stderr).toContain('Usage: agents-pkg del-plugin <name>');
    });
  });

  describe('update', () => {
    it('runs without error when no marketplaces installed', () => {
      const result = runCli(['update'], ROOT);
      expect(result.exitCode).toBe(0);
    });
  });
});
