/**
 * Pure unit tests for parseSource: no filesystem/network access, no git.
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { parseSource, looksLikeGitSource } from '../src/lib/source-parser.js';

describe('parseSource - local paths', () => {
  it('resolves "." to absolute cwd', () => {
    const out = parseSource('.');
    expect(out.type).toBe('local');
    expect(out.localPath).toBe(resolve('.'));
    expect(out.url).toBe(resolve('.'));
    expect(out.ref).toBeUndefined();
  });

  it('resolves "./x" relative path', () => {
    const out = parseSource('./x');
    expect(out.type).toBe('local');
    expect(out.localPath).toBe(resolve('./x'));
  });

  it('resolves "../x" relative path', () => {
    const out = parseSource('../x');
    expect(out.type).toBe('local');
    expect(out.localPath).toBe(resolve('../x'));
  });

  it('resolves an absolute path as-is', () => {
    const out = parseSource('/tmp/some-dir');
    expect(out.type).toBe('local');
    expect(out.localPath).toBe(resolve('/tmp/some-dir'));
  });

  it('resolves a windows-style absolute path as local', () => {
    const out = parseSource('C:\\Users\\me\\project');
    expect(out.type).toBe('local');
  });

  it('does not treat "#" in a local path as a ref', () => {
    const out = parseSource('./weird#dir');
    expect(out.type).toBe('local');
    expect(out.ref).toBeUndefined();
  });
});

describe('parseSource - bare owner/repo shorthand', () => {
  it('bare owner/repo -> github https url, no ref', () => {
    const out = parseSource('owner/repo');
    expect(out.type).toBe('github');
    expect(out.url).toBe('https://github.com/owner/repo.git');
    expect(out.ref).toBeUndefined();
  });

  it('owner/repo#v1.2.3 -> github url + ref v1.2.3', () => {
    const out = parseSource('owner/repo#v1.2.3');
    expect(out.type).toBe('github');
    expect(out.url).toBe('https://github.com/owner/repo.git');
    expect(out.ref).toBe('v1.2.3');
  });
});

describe('parseSource - bare github.com/gitlab.com host shorthand (no scheme)', () => {
  it('github.com/owner/repo -> github https url', () => {
    const out = parseSource('github.com/owner/repo');
    expect(out.type).toBe('github');
    expect(out.url).toBe('https://github.com/owner/repo.git');
  });

  it('gitlab.com/group/sub/repo#tag -> gitlab https url + ref', () => {
    const out = parseSource('gitlab.com/group/sub/repo#tag');
    expect(out.type).toBe('gitlab');
    expect(out.url).toBe('https://gitlab.com/group/sub/repo.git');
    expect(out.ref).toBe('tag');
  });
});

describe('parseSource - prefix shorthand', () => {
  it('github:owner/repo#main -> github url + ref main', () => {
    const out = parseSource('github:owner/repo#main');
    expect(out.type).toBe('github');
    expect(out.url).toBe('https://github.com/owner/repo.git');
    expect(out.ref).toBe('main');
  });

  it('gitlab:group/sub/repo#tag -> gitlab url + ref', () => {
    const out = parseSource('gitlab:group/sub/repo#tag');
    expect(out.type).toBe('gitlab');
    expect(out.url).toBe('https://gitlab.com/group/sub/repo.git');
    expect(out.ref).toBe('tag');
  });
});

describe('parseSource - github.com URLs', () => {
  it('https://github.com/o/r -> github url', () => {
    const out = parseSource('https://github.com/o/r');
    expect(out.type).toBe('github');
    expect(out.url).toBe('https://github.com/o/r.git');
    expect(out.ref).toBeUndefined();
  });

  it('https://github.com/o/r.git -> github url unchanged', () => {
    const out = parseSource('https://github.com/o/r.git');
    expect(out.type).toBe('github');
    expect(out.url).toBe('https://github.com/o/r.git');
  });

  it('https://github.com/o/r#ref -> ref parsed', () => {
    const out = parseSource('https://github.com/o/r#ref');
    expect(out.type).toBe('github');
    expect(out.ref).toBe('ref');
  });

  it('https://github.com/o/r/tree/re-aidlc/stable -> ambiguous ref, first segment wins, rest dropped as subpath', () => {
    // Matches vercel-labs/skills: a ref containing a slash is indistinguishable from
    // "ref/subpath", so the first path segment after /tree/ is always the ref.
    const out = parseSource('https://github.com/o/r/tree/re-aidlc/stable');
    expect(out.type).toBe('github');
    expect(out.url).toBe('https://github.com/o/r.git');
    expect(out.ref).toBe('re-aidlc');
  });

  it('https://github.com/o/r/tree/main/skills/foo -> ref main, subpath dropped', () => {
    const out = parseSource('https://github.com/o/r/tree/main/skills/foo');
    expect(out.type).toBe('github');
    expect(out.url).toBe('https://github.com/o/r.git');
    expect(out.ref).toBe('main');
  });

  it('path ref takes precedence over fragment ref', () => {
    const out = parseSource('https://github.com/o/r/tree/main#other');
    expect(out.ref).toBe('main');
  });
});

describe('parseSource - gitlab.com tree URLs', () => {
  it('single-segment ref, no subpath', () => {
    const out = parseSource('https://gitlab.com/group/sub/repo/-/tree/main');
    expect(out.type).toBe('gitlab');
    expect(out.url).toBe('https://gitlab.com/group/sub/repo.git');
    expect(out.ref).toBe('main');
  });

  it('with subpath -> ref main, subpath dropped', () => {
    const out = parseSource('https://gitlab.com/group/sub/repo/-/tree/main/path/to');
    expect(out.type).toBe('gitlab');
    expect(out.url).toBe('https://gitlab.com/group/sub/repo.git');
    expect(out.ref).toBe('main');
  });
});

describe('parseSource - our primary use case: generic https host with #ref', () => {
  it('non-github/gitlab https URL with #ref parses ref (extended looksLikeGitSource)', () => {
    const out = parseSource(
      'https://git.naspersclassifieds.com/olxeu/ecosystem/tooling/ai-engineering-kit#re-aidlc/stable'
    );
    expect(out.type).toBe('git');
    expect(out.ref).toBe('re-aidlc/stable');
    expect(out.url).toBe('https://git.naspersclassifieds.com/olxeu/ecosystem/tooling/ai-engineering-kit');
  });

  it('same generic https URL without # behaves like today: clone url as-is, no ref', () => {
    const out = parseSource('https://git.naspersclassifieds.com/olxeu/ecosystem/tooling/ai-engineering-kit');
    expect(out.type).toBe('git');
    expect(out.ref).toBeUndefined();
    expect(out.url).toBe('https://git.naspersclassifieds.com/olxeu/ecosystem/tooling/ai-engineering-kit');
  });

  it('gitlab-style tree URL on a non-gitlab.com host is treated as gitlab type (ambiguous ref, first segment wins)', () => {
    const out = parseSource(
      'https://git.naspersclassifieds.com/olxeu/ecosystem/tooling/ai-engineering-kit/-/tree/re-aidlc/stable'
    );
    expect(out.type).toBe('gitlab');
    expect(out.url).toBe('https://git.naspersclassifieds.com/olxeu/ecosystem/tooling/ai-engineering-kit.git');
    expect(out.ref).toBe('re-aidlc');
  });

  it('gitlab-style tree URL on a non-gitlab.com host with subpath drops subpath', () => {
    const out = parseSource(
      'https://git.naspersclassifieds.com/olxeu/ecosystem/tooling/ai-engineering-kit/-/tree/main/path/to'
    );
    expect(out.type).toBe('gitlab');
    expect(out.url).toBe('https://git.naspersclassifieds.com/olxeu/ecosystem/tooling/ai-engineering-kit.git');
    expect(out.ref).toBe('main');
  });
});

describe('parseSource - file:// urls (used to clone local git repos, e.g. in tests/CI)', () => {
  it('file:///tmp/repo -> git type, no ref', () => {
    const out = parseSource('file:///tmp/repo');
    expect(out.type).toBe('git');
    expect(out.url).toBe('file:///tmp/repo');
    expect(out.ref).toBeUndefined();
  });

  it('file:///tmp/repo#re-aidlc/stable -> ref with slash preserved', () => {
    const out = parseSource('file:///tmp/repo#re-aidlc/stable');
    expect(out.type).toBe('git');
    expect(out.url).toBe('file:///tmp/repo');
    expect(out.ref).toBe('re-aidlc/stable');
  });
});

describe('parseSource - ssh style', () => {
  it('git@host:owner/repo.git#ref -> ref parsed', () => {
    const out = parseSource('git@github.com:owner/repo.git#ref');
    expect(out.type).toBe('git');
    expect(out.ref).toBe('ref');
    expect(out.url).toBe('git@github.com:owner/repo.git');
  });

  it('ssh:// style url with .git#ref', () => {
    const out = parseSource('ssh://git@host.example.com/owner/repo.git#v2');
    expect(out.type).toBe('git');
    expect(out.ref).toBe('v2');
  });
});

describe('parseSource - URL decoding of ref', () => {
  it('owner/repo#feat%2Fx -> ref feat/x', () => {
    const out = parseSource('owner/repo#feat%2Fx');
    expect(out.ref).toBe('feat/x');
  });

  it('falls back to raw ref when decodeURIComponent throws', () => {
    const out = parseSource('owner/repo#%E0%A4%A');
    expect(out.ref).toBe('%E0%A4%A');
  });
});

describe('parseSource - skill filter ignored (out of scope)', () => {
  it('ignores everything after @ in the fragment', () => {
    const out = parseSource('owner/repo#main@some-skill');
    expect(out.ref).toBe('main');
  });
});

describe('looksLikeGitSource', () => {
  it('returns true for github: prefix', () => {
    expect(looksLikeGitSource('github:owner/repo')).toBe(true);
  });

  it('returns true for gitlab: prefix', () => {
    expect(looksLikeGitSource('gitlab:owner/repo')).toBe(true);
  });

  it('returns true for git@ ssh shorthand', () => {
    expect(looksLikeGitSource('git@github.com:owner/repo.git')).toBe(true);
  });

  it('returns true for ssh:// urls ending in .git', () => {
    expect(looksLikeGitSource('ssh://git@host.example.com/owner/repo.git')).toBe(true);
  });

  it('returns true for file:// urls', () => {
    expect(looksLikeGitSource('file:///tmp/repo')).toBe(true);
  });

  it('returns true for bare owner/repo shorthand', () => {
    expect(looksLikeGitSource('owner/repo')).toBe(true);
  });

  it('returns false for local-looking paths', () => {
    expect(looksLikeGitSource('./owner/repo')).toBe(false);
    expect(looksLikeGitSource('/owner/repo')).toBe(false);
  });

  it('returns false for a bare word with no slash', () => {
    expect(looksLikeGitSource('justaword')).toBe(false);
  });
});
