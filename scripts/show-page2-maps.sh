#!/usr/bin/env bash
# Print page-2 mapping JSON(s) and open in default app (run from repo root or scripts/)
set -e
cd "$(dirname "$0")/.."
BASE="${1:-CID_HomeBase/templates}"

for f in "$BASE"/*/mapping/page-2.map.json; do
  if [[ -f "$f" ]]; then
    echo "=== $f ==="
    if command -v jq &>/dev/null; then
      jq . "$f"
    else
      cat "$f"
    fi
    echo ""
    open "$f"
  fi
done
