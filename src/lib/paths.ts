/**
 * Paths for Cursor and Claude (project and global).
 * Agents (subagents) = .cursor/agents (global; marketplace plugins install here).
 * Commands = .cursor/commands, .claude/commands.
 */

import { join } from 'path';
import { homedir } from 'os';

/** Cursor only: path to .cursor/agents (global = ~/.cursor/agents) */
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

/** Cursor only: path to .cursor/rules (global = ~/.cursor/rules) */
export function getCursorRulesDir(global: boolean, cwd?: string): string {
  const base = global ? homedir() : (cwd || process.cwd());
  return join(base, '.cursor', 'rules');
}
