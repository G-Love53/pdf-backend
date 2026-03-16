#!/usr/bin/env bash
# Run from anywhere. Uses standalone CID_HomeBase (not the submodule).
set -e
GITHUB="${GITHUB_ROOT:-/Users/newmacminim4/GitHub}"
HB="${GITHUB}/CID_HomeBase"
if [[ ! -d "$HB" ]]; then
  echo "Not found: $HB (set GITHUB_ROOT if needed)"
  exit 1
fi
cd "$HB"
echo "→ CID_HomeBase ($(pwd))"
if [[ -d tools ]]; then
  (cd tools && npm install --silent 2>/dev/null || true)
  echo "Tools ready. Example: cd tools && npm run extract-pdf"
fi
exec "$SHELL"
