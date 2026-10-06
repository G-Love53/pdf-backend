#!/bin/bash
# Copy canonical CID docs onto the CID_Master drive as a dated, read-only snapshot.
# Weekly via LaunchAgent. Skips when the drive is unplugged or a snapshot is newer than 6 days.
# Does not copy .env, secrets, or git history.

set -euo pipefail

VOL="/Volumes/CID_Master"
DEST_ROOT="$VOL/docs-snapshots"
STAMP="$DEST_ROOT/LAST_SNAPSHOT.txt"
GH="/Users/newmacminim4/GitHub"
MIN_AGE_SECONDS=$((6 * 24 * 3600))

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*"; }

if [[ ! -d "$VOL" ]]; then
  log "skip: $VOL is not mounted"
  exit 0
fi

now=$(date +%s)
if [[ -f "$STAMP" ]]; then
  last=$(awk 'NR==1 { print $1 }' "$STAMP")
  if [[ "$last" =~ ^[0-9]+$ ]]; then
    age=$((now - last))
    if (( age < MIN_AGE_SECONDS )); then
      log "skip: last snapshot is $((age / 3600)) hours old"
      exit 0
    fi
  fi
fi

day=$(date '+%Y-%m-%d')
dest="$DEST_ROOT/$day"
mkdir -p "$dest/pdf-backend-docs" "$dest/cid-connect-docs"

rsync -a --delete "$GH/pdf-backend/docs/" "$dest/pdf-backend-docs/"
cp "$GH/pdf-backend/DOCUMENTATION.md" "$dest/DOCUMENTATION.md"
mkdir -p "$dest/pdf-backend-rules"
cp "$GH/pdf-backend/.cursor/rules/agent-start.mdc" "$dest/pdf-backend-rules/agent-start.mdc"
rsync -a --delete "$GH/cid-connect/docs/" "$dest/cid-connect-docs/"
cp "$GH/CID-docs/README.md" "$dest/CID-docs-README.md"

cat > "$dest/README.md" <<EOF
# Docs snapshot $day

Read-only archive written by scripts/snapshot-docs-to-cid-master.sh.
Do not edit files in this folder.

Working copies:

- ~/GitHub/pdf-backend/docs/ and DOCUMENTATION.md
- ~/GitHub/cid-connect/docs/
- ~/GitHub/CID-docs/README.md is an index only

Do not use /Volumes/CID_Master/CID_MASTER_OLD_DO_NOT_USE.
EOF

printf '%s %s\n' "$now" "$day" > "$STAMP"
log "wrote $dest"
