#!/usr/bin/env bash
# Release script for agents-pkg.
# Bumps version (patch/minor/major), pushes main + tag; .github/workflows/publish.yml
# runs on tag push and publishes to npm and creates the GitHub release.

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[release]${NC} $*"; }
warn()  { echo -e "${YELLOW}[release]${NC} $*"; }
err()   { echo -e "${RED}[release]${NC} $*"; }

usage() {
  echo "Usage: $0 [--skip-tests] [--yes]"
  echo ""
  echo "  --skip-tests   Skip build and tests before releasing"
  echo "  --yes          Non-interactive: use patch bump and do not prompt"
  echo ""
  echo "Otherwise, you will be prompted for bump type (patch/minor/major) and confirmation."
  exit 0
}

SKIP_TESTS=
NON_INTERACTIVE=
while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-tests) SKIP_TESTS=1; shift ;;
    --yes)        NON_INTERACTIVE=1; shift ;;
    -h|--help)    usage ;;
    *)            err "Unknown option: $1"; usage ;;
  esac
done

# Ensure we're on main
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$BRANCH" != "main" ]]; then
  err "Not on main (current branch: $BRANCH). Release from main."
  exit 1
fi

# Ensure clean working tree (allow untracked files)
if ! git diff --quiet HEAD --; then
  err "Working tree has uncommitted changes. Commit or stash them first."
  git status -sb
  exit 1
fi

# Optional: ensure we're up to date with origin
if git rev-parse --verify origin/main &>/dev/null; then
  BEHIND=$(git rev-list --count origin/main..HEAD)
  AHEAD=$(git rev-list --count HEAD..origin/main)
  if [[ "$AHEAD" -gt 0 ]]; then
    warn "You are behind origin/main by $AHEAD commit(s). Consider: git pull --rebase origin main"
    if [[ -z "$NON_INTERACTIVE" ]]; then
      read -r -p "Continue anyway? [y/N] " r
      [[ "${r,,}" != "y" && "${r,,}" != "yes" ]] && exit 1
    fi
  fi
fi

CURRENT_VERSION=$(node -p "require('./package.json').version")
if [[ -z "$CURRENT_VERSION" ]]; then
  err "Could not read version from package.json"
  exit 1
fi

# Compute next version (simple semver x.y.z)
next_version() {
  local bump="$1"
  node -e "
    const version = process.argv[1];
    const bump = process.argv[2];
    const v = version.split('.').map(Number);
    if (bump === 'patch') { v[2]++; }
    else if (bump === 'minor') { v[1]++; v[2] = 0; }
    else if (bump === 'major') { v[0]++; v[1] = 0; v[2] = 0; }
    else throw new Error('Invalid bump: ' + bump);
    console.log(v.join('.'));
  " "$CURRENT_VERSION" "$bump"
}

BUMP=
if [[ -n "$NON_INTERACTIVE" ]]; then
  BUMP=patch
  info "Non-interactive: using bump type 'patch'"
else
  echo ""
  echo "Current version: ${GREEN}${CURRENT_VERSION}${NC}"
  echo "Choose bump type:"
  echo "  1) patch  (e.g. $CURRENT_VERSION → $(next_version patch))"
  echo "  2) minor  (e.g. $CURRENT_VERSION → $(next_version minor))"
  echo "  3) major  (e.g. $CURRENT_VERSION → $(next_version major))"
  echo "  q) quit"
  echo ""
  read -r -p "Choice [1/2/3/q]: " choice
  case "$choice" in
    1) BUMP=patch ;;
    2) BUMP=minor ;;
    3) BUMP=major ;;
    q|Q) info "Aborted."; exit 0 ;;
    *)  err "Invalid choice."; exit 1 ;;
  esac
fi

NEW_VERSION=$(next_version "$BUMP")
info "Bump: $BUMP  →  new version: $NEW_VERSION"

if [[ -z "$NON_INTERACTIVE" ]]; then
  read -r -p "Proceed with release v$NEW_VERSION? [y/N] " r
  [[ "${r,,}" != "y" && "${r,,}" != "yes" ]] && { info "Aborted."; exit 0; }
fi

if [[ -z "$SKIP_TESTS" ]]; then
  info "Running build and tests..."
  pnpm install --frozen-lockfile
  pnpm run type-check
  pnpm run build
  pnpm test
else
  warn "Skipping tests (--skip-tests)."
fi

info "Bumping version to $NEW_VERSION..."
npm version "$BUMP" -m "v%s"

info "Pushing main and tag v$NEW_VERSION..."
git push origin main --follow-tags

echo ""
info "Done. The GitHub Actions workflow will:"
echo "  - Publish \`agents-pkg@$NEW_VERSION\` to npm"
echo "  - Create GitHub release \`v$NEW_VERSION\` with notes"
echo ""
echo "Monitor: https://github.com/$(git remote get-url origin | sed -E 's/.*[:/]([^/]+\/[^/.]+)(\.git)?/\1/')/actions"
