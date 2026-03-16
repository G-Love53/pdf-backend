#!/usr/bin/env bash
# Run CID_HomeBase script. PDFs stay in backend; output goes to standalone CID_HomeBase when present.
# Set CID_HOMEBASE_STANDALONE so SVGs are written to GitHub/CID_HomeBase for commit/push there.
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HOMEBASE_SCRIPT="$REPO_ROOT/CID_HomeBase/scripts/pdf-page-to-svg.sh"
if [[ ! -f "$HOMEBASE_SCRIPT" ]]; then
  echo "Error: CID_HomeBase script not found at $HOMEBASE_SCRIPT (run from repo with CID_HomeBase submodule, or run from standalone CID_HomeBase: bash scripts/pdf-page-to-svg.sh ...)"
  exit 1
fi
# Write SVGs to standalone CID_HomeBase (override with CID_HOMEBASE_STANDALONE if needed)
STANDALONE="${GITHUB_ROOT:-$HOME/GitHub}/CID_HomeBase"
if [[ -d "$STANDALONE" ]]; then
  export CID_HOMEBASE_STANDALONE="$STANDALONE"
fi
exec bash "$HOMEBASE_SCRIPT" "$@"
