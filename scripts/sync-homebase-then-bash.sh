#!/usr/bin/env bash
# Use only if you accidentally edited templates/mapping under pdf-backend/CID_HomeBase.
# Normal lane: edit in STANDALONE ~/GitHub/CID_HomeBase/templates (see scripts/WHERE_TO_EDIT.md).
# This script copies pdf-backend/CID_HomeBase → standalone so the double bash can push.
#
# Run from pdf-backend root:  bash scripts/sync-homebase-then-bash.sh
# Then run the two command blocks it prints.

set -e
GITHUB="${GITHUB_ROOT:-$HOME/GitHub}"
if [[ -n "$1" ]]; then GITHUB="$1"; fi

BACKEND_HB="$(cd "$(dirname "$0")/.." && pwd)/CID_HomeBase"
STANDALONE_HB="${GITHUB}/CID_HomeBase"

if [[ ! -d "$BACKEND_HB" ]]; then
  echo "ERROR: Not found: $BACKEND_HB (run from pdf-backend root)"
  exit 1
fi
if [[ ! -d "$STANDALONE_HB" ]]; then
  echo "ERROR: Not found: $STANDALONE_HB (set GITHUB_ROOT or pass path)"
  exit 1
fi

echo "Syncing: pdf-backend/CID_HomeBase → standalone CID_HomeBase"
rsync -a --delete \
  --exclude='.git' \
  --exclude='.DS_Store' \
  --exclude='node_modules' \
  "$BACKEND_HB/" "$STANDALONE_HB/"

echo ""
echo "Done. Now run these two blocks in order:"
echo ""
echo "--- Bash 1 (HomeBase) ---"
echo "cd $STANDALONE_HB"
echo "git add -A"
echo "git status"
echo "git commit -m \"Templates/mapping update\""
echo "git push"
echo ""
echo "--- Bash 2 (Backend) ---"
echo "cd $(cd "$(dirname "$0")/.." && pwd)"
echo "git submodule update --remote CID_HomeBase"
echo "git add CID_HomeBase"
echo "git commit -m \"Bump CID_HomeBase\""
echo "git push"
echo ""
