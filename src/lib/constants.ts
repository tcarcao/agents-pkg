/**
 * Shared constants for agent-pkg (marketplace-only, Cursor).
 * Same parent dir as skills: ~/.agents/
 */

export const AGENTS_DIR = '.agents';
export const LOCK_FILE = '.agent-pkg-lock.json';
export const CURRENT_LOCK_VERSION = 1;

/** Marketplace store under ~/.agents/agent-pkg/marketplace/<name>/<plugin-name> */
export const MARKETPLACE_DIR = 'agent-pkg/marketplace';

/** Path relative to resolved source dir: .cursor-plugin/marketplace.json */
export const MARKETPLACE_JSON = '.cursor-plugin/marketplace.json';

/** Plugin layout inside each plugin dir (agents, commands, skills, hooks) */
export const REPO_SKILLS_DIR = 'skills';
export const REPO_AGENTS_DIR = 'agents';
export const REPO_COMMANDS_DIR = 'commands';
export const REPO_HOOKS_FILE = 'hooks/hooks.json';
