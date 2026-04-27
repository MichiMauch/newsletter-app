#!/usr/bin/env bash
# Smart pre-push gate.
#
# Decides what to run based on what's actually being pushed:
#   - Nothing code-related changed?   → skip everything
#   - Only docs / markdown / config?  → skip everything
#   - Only test-files changed?        → vitest only
#   - App / lib / components changed? → tsc + vitest (always)
#   - + critical paths changed?       → also run Playwright E2E
#
# The goal is to make `git push` safe by default without forcing a 30s wait
# for a typo fix. To override the gate, push with: SKIP_PRE_PUSH=1 git push

set -e

if [ "${SKIP_PRE_PUSH:-0}" = "1" ]; then
  echo "[pre-push] SKIP_PRE_PUSH=1 set, skipping checks."
  exit 0
fi

# Files changed between local HEAD and the remote tip we're pushing to.
# Falls back to a comparison against origin/main if the remote ref is missing
# (first push of a new branch).
upstream=$(git rev-parse --abbrev-ref --symbolic-full-name '@{push}' 2>/dev/null || true)
if [ -z "$upstream" ]; then
  upstream="origin/main"
fi

if git rev-parse --verify --quiet "$upstream" >/dev/null; then
  changed=$(git diff --name-only "$upstream"...HEAD)
else
  # Brand-new branch with no upstream yet: check the last commit only.
  changed=$(git diff --name-only HEAD~1...HEAD 2>/dev/null || git diff --name-only --cached)
fi

if [ -z "$changed" ]; then
  echo "[pre-push] No file changes detected, skipping."
  exit 0
fi

# Categorise.
needs_tsc=0
needs_vitest=0
needs_e2e=0
only_noise=1

while IFS= read -r f; do
  [ -z "$f" ] && continue

  case "$f" in
    # Docs and lockfiles — ignore.
    *.md|LICENSE|.gitignore|.editorconfig|.gitattributes|README*) ;;
    # Test files only — vitest is enough.
    tests/lib/*|tests/e2e/*)
      needs_vitest=1
      only_noise=0
      ;;
    # Code that lives in compiled paths — full check.
    app/*|lib/*|components/*|hooks/*|emails/*|drizzle/*)
      needs_tsc=1
      needs_vitest=1
      needs_e2e=1
      only_noise=0
      ;;
    # Config that affects build/typecheck.
    next.config.*|tsconfig*.json|drizzle.config.*|proxy.ts|vitest.config.*|playwright.config.*|sentry.*|instrumentation*.ts)
      needs_tsc=1
      needs_vitest=1
      needs_e2e=1
      only_noise=0
      ;;
    # package.json / lockfiles — full check (deps moved).
    package.json|package-lock.json|pnpm-lock.yaml|yarn.lock)
      needs_tsc=1
      needs_vitest=1
      needs_e2e=1
      only_noise=0
      ;;
    # Migrations / scripts — typecheck at minimum.
    scripts/*)
      needs_tsc=1
      needs_vitest=1
      only_noise=0
      ;;
    *)
      # Unknown file — be cautious, run unit suite.
      needs_vitest=1
      only_noise=0
      ;;
  esac
done <<< "$changed"

if [ "$only_noise" = "1" ]; then
  echo "[pre-push] Only docs/config-noise changed — skipping checks."
  exit 0
fi

echo "[pre-push] Running checks for $(echo "$changed" | wc -l | tr -d ' ') changed file(s)…"

if [ "$needs_tsc" = "1" ]; then
  echo "[pre-push] → tsc --noEmit"
  npx tsc --noEmit
fi

if [ "$needs_vitest" = "1" ]; then
  echo "[pre-push] → vitest run"
  npx vitest run
fi

if [ "$needs_e2e" = "1" ]; then
  echo "[pre-push] → playwright"
  npx playwright test
fi

echo "[pre-push] All checks passed."
