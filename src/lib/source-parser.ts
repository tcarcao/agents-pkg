/**
 * Pure parsing of a `source` string (as passed to `add-plugin` / stored in the lock file)
 * into a structured description of where to get the code from: a local directory, or a
 * git remote (with an optional ref) to clone.
 *
 * No filesystem or network access happens here; see `source-dir.ts` for resolution.
 *
 * Modeled after vercel-labs/skills' `parseSource`, with two deliberate deviations for
 * agents-pkg (documented at their point of divergence below):
 *   - No skill-filter support (`#ref@skill` / `owner/repo@skill`); we select plugins via
 *     separate CLI args, so anything after `@` in a fragment is ignored.
 *   - No subpath support; a `tree/<ref>/<subpath>` (or gitlab `-/tree/<ref>/<subpath>`) only
 *     ever yields a ref, the subpath is dropped, since our installer always reads
 *     `.cursor-plugin/marketplace.json` at the repo root.
 */

import { resolve } from 'path';

export interface ParsedSource {
  type: 'local' | 'github' | 'gitlab' | 'git';
  url: string;
  ref?: string;
  localPath?: string;
}

function isLocalPath(input: string): boolean {
  const t = input.trim();
  return (
    t.startsWith('./') ||
    t.startsWith('../') ||
    t === '.' ||
    t === '..' ||
    t.startsWith('/') ||
    /^[a-zA-Z]:[/\\]/.test(t)
  );
}

/**
 * SSH-style URL without git@ prefix: host:path (e.g. git.example.com:owner/repo.git).
 * Single colon, host-like left part, path-like right part.
 */
function isSshStyleUrl(input: string): boolean {
  const colonIdx = input.indexOf(':');
  if (colonIdx <= 0 || colonIdx !== input.lastIndexOf(':')) return false;
  const host = input.slice(0, colonIdx);
  const path = input.slice(colonIdx + 1);
  const hostLooksValid = host.includes('.') || host === 'github' || host === 'gitlab';
  const pathLooksValid = path.length > 0 && (path.includes('/') || path.endsWith('.git'));
  return hostLooksValid && pathLooksValid;
}

const GITHUB_TREE_RE = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)$/;
const GITHUB_TREE_SUBPATH_RE = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+)$/;
const GITLAB_TREE_RE = /^(https?):\/\/([^/]+)\/(.+?)\/-\/tree\/([^/]+)$/;
const GITLAB_TREE_SUBPATH_RE = /^(https?):\/\/([^/]+)\/(.+?)\/-\/tree\/([^/]+)\/(.+)$/;

/**
 * Whether `input` (the base, with any `#ref` already stripped) "looks like" a git source,
 * i.e. the `#` fragment (if present) should be treated as a git ref rather than left as
 * part of an opaque string.
 *
 * DEVIATION from vercel-labs/skills: they only treat http(s) URLs as git-like when they
 * are github.com/gitlab.com or end in `.git`. agents-pkg only ever resolves git remotes
 * (there's no other kind of http(s) source), so we additionally treat any plain
 * `https?://<host>/<path>` (with at least one path segment) as git-like. This is what
 * makes our primary internal use case (self-hosted GitLab URLs without a `.git` suffix,
 * e.g. `https://git.example.com/group/subgroup/repo#branch/name`) parse the `#ref`
 * fragment correctly.
 */
export function looksLikeGitSource(input: string): boolean {
  const t = input.trim();
  if (isLocalPath(t)) return false;
  if (t.startsWith('github:') || t.startsWith('gitlab:') || t.startsWith('git@')) return true;
  // file:// URLs are a git-clonable remote (used for local git repos in tests/CI), not a plain local path.
  if (t.startsWith('file://')) return true;
  if (/^ssh:\/\/.+\.git$/.test(t)) return true;
  if (GITHUB_TREE_RE.test(t) || GITHUB_TREE_SUBPATH_RE.test(t)) return true;
  if (GITLAB_TREE_RE.test(t) || GITLAB_TREE_SUBPATH_RE.test(t)) return true;
  if (/^https?:\/\/.+\.git$/.test(t)) return true;
  if (t.startsWith('http://') || t.startsWith('https://')) {
    // Extended beyond vercel-labs/skills: see doc comment above.
    try {
      const u = new URL(t);
      return u.pathname.replace(/^\/+/, '').length > 0;
    } catch {
      return false;
    }
  }
  if (isSshStyleUrl(t)) return true;
  // Bare owner/repo shorthand: no colon, not starting with `.` or `/`.
  if (!t.includes(':') && !t.startsWith('.') && !t.startsWith('/') && /^[^/]+\/[^/]+$/.test(t)) {
    return true;
  }
  return false;
}

/** Split an optional `#ref` (or `#ref@skillFilter`, skillFilter ignored) fragment off a source string. */
function splitFragmentRef(input: string): { base: string; fragmentRef?: string } {
  const hashIdx = input.indexOf('#');
  if (hashIdx === -1) return { base: input };
  const base = input.slice(0, hashIdx);
  let fragment = input.slice(hashIdx + 1).trim();
  if (fragment.length === 0) return { base };
  const atIdx = fragment.indexOf('@');
  if (atIdx !== -1) fragment = fragment.slice(0, atIdx);
  if (fragment.length === 0) return { base };
  let decoded = fragment;
  try {
    decoded = decodeURIComponent(fragment);
  } catch {
    decoded = fragment;
  }
  return { base, fragmentRef: decoded };
}

/**
 * Convert bare shorthand to an HTTPS clone URL.
 * owner/repo -> https://github.com/owner/repo.git
 * github.com/owner/repo, gitlab.com/owner/repo -> https://<host>/owner/repo.git
 */
function ownerRepoToUrl(ownerRepo: string): { type: 'github' | 'gitlab'; url: string } | undefined {
  const trimmed = ownerRepo.trim();
  if (trimmed.includes(':')) return undefined;
  const parts = trimmed.split('/').filter(Boolean);
  if (parts.length === 2) {
    const [owner, repo] = parts;
    if (owner!.includes('.')) return undefined;
    return { type: 'github', url: `https://github.com/${owner}/${(repo ?? '').replace(/\.git$/, '')}.git` };
  }
  if (parts.length >= 3 && (parts[0] === 'github.com' || parts[0] === 'gitlab.com')) {
    const host = parts[0]!;
    const rest = parts.slice(1);
    const repo = rest.pop()!.replace(/\.git$/, '');
    return { type: host === 'github.com' ? 'github' : 'gitlab', url: `https://${host}/${rest.join('/')}/${repo}.git` };
  }
  return undefined;
}

export function parseSource(input: string): ParsedSource {
  const trimmed = input.trim();

  if (isLocalPath(trimmed)) {
    const abs = resolve(trimmed);
    return { type: 'local', url: abs, localPath: abs };
  }

  // github:owner/repo / gitlab:group/sub/repo prefix shorthand, optionally with #ref.
  if (trimmed.startsWith('github:') || trimmed.startsWith('gitlab:')) {
    const isGithub = trimmed.startsWith('github:');
    const rest = trimmed.slice(isGithub ? 'github:'.length : 'gitlab:'.length);
    const { base, fragmentRef } = splitFragmentRef(rest);
    const parts = base.split('/').filter(Boolean);
    const repo = (parts.pop() ?? '').replace(/\.git$/, '');
    const url = isGithub
      ? `https://github.com/${parts.join('/')}/${repo}.git`
      : `https://gitlab.com/${parts.join('/')}/${repo}.git`;
    return { type: isGithub ? 'github' : 'gitlab', url, ref: fragmentRef };
  }

  const { base, fragmentRef } = splitFragmentRef(trimmed);

  // Browse-URL ref extraction takes precedence over a `#ref` fragment.
  const ghSubpath = base.match(GITHUB_TREE_SUBPATH_RE);
  const ghBranchOnly = base.match(GITHUB_TREE_RE);
  if (ghBranchOnly) {
    const [, owner, repo, ref] = ghBranchOnly;
    return { type: 'github', url: `https://github.com/${owner}/${repo}.git`, ref };
  }
  if (ghSubpath) {
    const [, owner, repo, ref] = ghSubpath;
    return { type: 'github', url: `https://github.com/${owner}/${repo}.git`, ref };
  }

  const glSubpath = base.match(GITLAB_TREE_SUBPATH_RE);
  const glBranchOnly = base.match(GITLAB_TREE_RE);
  if (glBranchOnly) {
    const [, proto, host, repoPath, ref] = glBranchOnly;
    return { type: 'gitlab', url: `${proto}://${host}/${repoPath}.git`, ref };
  }
  if (glSubpath) {
    const [, proto, host, repoPath, ref] = glSubpath;
    return { type: 'gitlab', url: `${proto}://${host}/${repoPath}.git`, ref };
  }

  // Bare owner/repo shorthand, or owner/repo prefixed with a bare github.com/gitlab.com
  // host (no scheme). Tried before the looksLikeGitSource guard below since these forms
  // are unambiguously our own shorthand, not a generic opaque string.
  const shorthand = ownerRepoToUrl(base);
  if (shorthand) {
    return { type: shorthand.type, url: shorthand.url, ref: fragmentRef };
  }

  if (!looksLikeGitSource(base)) {
    // Base doesn't look git-like: leave the `#` as part of the string (not a ref).
    return { type: 'git', url: trimmed };
  }

  if (base.startsWith('git@') || isSshStyleUrl(base) || base.startsWith('ssh://') || base.startsWith('file://')) {
    return { type: 'git', url: base, ref: fragmentRef };
  }

  if (base.startsWith('http://') || base.startsWith('https://')) {
    let host = '';
    try {
      host = new URL(base).hostname;
    } catch {
      host = '';
    }
    if (host === 'github.com') {
      const withGit = base.endsWith('.git') ? base : `${base.replace(/\/$/, '')}.git`;
      return { type: 'github', url: withGit, ref: fragmentRef };
    }
    if (host === 'gitlab.com') {
      const withGit = base.endsWith('.git') ? base : `${base.replace(/\/$/, '')}.git`;
      return { type: 'gitlab', url: withGit, ref: fragmentRef };
    }
    // Generic git host (our extension): keep URL as-is, don't force a `.git` suffix.
    return { type: 'git', url: base, ref: fragmentRef };
  }

  return { type: 'git', url: base, ref: fragmentRef };
}
