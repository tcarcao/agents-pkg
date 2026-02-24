/**
 * Paths for Cursor and Claude (project and global).
 * Subagents = .cursor/agents, .claude/agents (both support them).
 * Commands = .cursor/commands, .claude/commands.
 */

import { join } from 'path';
import { homedir } from 'os';

export function getCursorAgentsDir(global: boolean, cwd?: string): string {
  const base = global ? homedir() : (cwd || process.cwd());
  return join(base, '.cursor', 'agents');
}

export function getClaudeAgentsDir(global: boolean, cwd?: string): string {
  const home = homedir();
  const claudeHome = process.env.CLAUDE_CONFIG_DIR?.trim() || join(home, '.claude');
  const base = global ? claudeHome : (cwd || process.cwd());
  return join(base, '.claude', 'agents');
}

export function getCursorCommandsDir(global: boolean, cwd?: string): string {
  const base = global ? homedir() : (cwd || process.cwd());
  return join(base, '.cursor', 'commands');
}

export function getClaudeCommandsDir(global: boolean, cwd?: string): string {
  const home = homedir();
  const claudeHome = process.env.CLAUDE_CONFIG_DIR?.trim() || join(home, '.claude');
  const base = global ? claudeHome : (cwd || process.cwd());
  return join(base, '.claude', 'commands');
}

/** Cursor only: path to .cursor/hooks.json */
export function getCursorHooksPath(global: boolean, cwd?: string): string {
  const base = global ? homedir() : (cwd || process.cwd());
  return join(base, '.cursor', 'hooks.json');
}

/** Cursor only: path to .cursor/skills (global = ~/.cursor/skills) */
export function getCursorSkillsDir(global: boolean, cwd?: string): string {
  const base = global ? homedir() : (cwd || process.cwd());
  return join(base, '.cursor', 'skills');
}
