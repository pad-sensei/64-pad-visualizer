#!/bin/bash
# sw-assets-check.sh
# ------------------------------------------------------------
# Verify every versioned asset loaded by index.html is also
# precached by sw.js. Prevents the recurring "added a new
# script tag, forgot to add it to ASSETS" bug (occurred twice
# in the same session on 2026-04-13).
#
# Exit codes:
#   0 — index.html and sw.js ASSETS are in sync
#   1 — drift: at least one index.html asset is missing from
#       sw.js ASSETS, or one of the files cannot be read
#
# Usage:
#   ./tools/sw-assets-check.sh
#
# Already wired into .git/hooks/pre-commit on this machine.
# When cloning the repo on a new machine, copy the relevant
# block out of CLAUDE.md or call this script from the new
# pre-commit hook directly.
# ------------------------------------------------------------

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

INDEX="$ROOT/index.html"
SW="$ROOT/sw.js"

if [ ! -f "$INDEX" ]; then
  echo "[sw-assets-check] $INDEX not found" >&2
  exit 1
fi
if [ ! -f "$SW" ]; then
  echo "[sw-assets-check] $SW not found" >&2
  exit 1
fi

# Match the full query value: cache tags include suffixes such as
# ?v=1.8.1-alias-equation9, not only digits and periods.
INDEX_ASSETS=$(grep -oE '(src|href)="[A-Za-z0-9_/\.\-]+\.(js|css)\?v=[^"]+"' "$INDEX" \
  | sed -E 's/^(src|href)="//; s/"$//' | sort -u || true)
SW_ASSETS=$(grep -oE "'[A-Za-z0-9_/\.\-]+\.(js|css)\?v=[^']+'" "$SW" \
  | sed "s/^'//; s/'$//" | sort -u || true)

if [ -z "$INDEX_ASSETS" ]; then
  echo "[sw-assets-check] No versioned JS/CSS assets matched index.html; refusing a vacuous pass" >&2
  exit 1
fi
MISSING=$(comm -23 <(echo "$INDEX_ASSETS") <(echo "$SW_ASSETS"))

if [ -n "$MISSING" ]; then
  echo ""
  echo "============================================"
  echo " sw.js ASSETS DRIFT DETECTED"
  echo "============================================"
  echo ""
  echo " These assets are loaded by index.html but missing from sw.js ASSETS:"
  echo "$MISSING" | sed 's/^/   - /'
  echo ""
  echo " Fix: add the missing entries to the ASSETS array in sw.js,"
  echo "      then re-stage with 'git add sw.js'."
  echo " Why: PWA users would hit cache-miss on these URLs and the app"
  echo "      could fail to start offline. Recurrence of 2026-04-13 bug."
  echo "============================================"
  exit 1
fi


# Detect edits to a tracked indexed asset that did not bump its version tag.
# HEAD^ is the default baseline; SW_ASSETS_BASE_REF can pin the PR base.
BASE_REF="${SW_ASSETS_BASE_REF:-}"
if [ -z "$BASE_REF" ] && git -C "$ROOT" rev-parse --verify --quiet HEAD^ >/dev/null 2>&1; then
  BASE_REF=HEAD^
fi
if [ -n "$BASE_REF" ] && git -C "$ROOT" cat-file -e "${BASE_REF}:index.html" 2>/dev/null; then
  OLD_INDEX_ASSETS=$(git -C "$ROOT" show "${BASE_REF}:index.html" \
    | grep -oE '(src|href)="[A-Za-z0-9_/\.\-]+\.(js|css)\?v=[^"]+"' \
    | sed -E 's/^(src|href)="//; s/"$//' | sort -u || true)
  STALE_TAGS=""
  while IFS= read -r asset_url; do
    [ -n "$asset_url" ] || continue
    asset_path="${asset_url%%\?v=*}"
    # Submodule contents are not individual parent-repository blobs.
    if [ ! -f "$ROOT/$asset_path" ] ||
      ! git -C "$ROOT" cat-file -e "${BASE_REF}:${asset_path}" 2>/dev/null; then
      continue
    fi
    if printf '%s\n' "$OLD_INDEX_ASSETS" | grep -Fxq "$asset_url" &&
      ! git -C "$ROOT" diff --quiet "$BASE_REF" -- "$asset_path"; then
      STALE_TAGS="${STALE_TAGS}${asset_url}
"
    fi
  done <<< "$INDEX_ASSETS"
  if [ -n "$STALE_TAGS" ]; then
    echo "[sw-assets-check] Asset bytes changed without a matching index.html ?v= bump:" >&2
    printf '%s' "$STALE_TAGS" >&2
    exit 1
  fi
fi

echo "[sw-assets-check] OK — $(echo "$INDEX_ASSETS" | wc -l | tr -d ' ') index.html assets all present in sw.js"
exit 0
