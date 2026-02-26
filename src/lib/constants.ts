/**
 * Shared constants for agents-pkg (marketplace-only, Cursor).
 * Same parent dir as skills: ~/.agents/
 */

export const AGENTS_DIR = '.agents';
export const LOCK_FILE = '.agents-pkg-lock.json';
export const CURRENT_LOCK_VERSION = 1;

/** Marketplace store under ~/.agents/agents-pkg/marketplace/<name>/<plugin-name> */
export const MARKETPLACE_DIR = 'agents-pkg/marketplace';

/** Path relative to resolved source dir: .cursor-plugin/marketplace.json */
export const MARKETPLACE_JSON = '.cursor-plugin/marketplace.json';

/** Plugin manifest at plugin root: plugin.json with top-level version */
export const PLUGIN_JSON = 'plugin.json';

/** Plugin layout inside each plugin dir (agents, commands, skills, hooks, rules) */
export const REPO_SKILLS_DIR = 'skills';
export const REPO_AGENTS_DIR = 'agents';
export const REPO_COMMANDS_DIR = 'commands';
export const REPO_HOOKS_FILE = 'hooks/hooks.json';
export const REPO_MCP_FILE = 'mcp/mcp.json';
export const REPO_RULES_DIR = 'rules';
