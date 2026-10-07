#!/bin/sh
# Back up everything PokeVerse writes (database, SRAM + history, save states,
# notes) from the data folder into a dated tar.gz. ROMs/BIOS are skipped: they are
# your own dumps and don't change.
#
#   scripts/backup.sh <data-dir> <backup-dir> [keep=30]
#
# Safe while the app is running: the database is snapshotted with VACUUM INTO.
# Schedule it (cron / Task Scheduler) daily.
set -eu
DATA="${1:?usage: backup.sh <data-dir> <backup-dir> [keep]}"
DEST="${2:?usage: backup.sh <data-dir> <backup-dir> [keep]}"
KEEP="${3:-30}"
STAMP="$(date +%Y%m%d-%H%M%S)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$DEST" "$WORK/pokeverse"
if [ -f "$DATA/pokeverse.db" ]; then
  bun -e "new (require('bun:sqlite').Database)(process.argv[1]).exec(\"VACUUM INTO '\" + process.argv[2] + \"'\")" \
    "$DATA/pokeverse.db" "$WORK/pokeverse/pokeverse.db"
fi
for d in saves guides checklists; do
  [ -d "$DATA/$d" ] && cp -R "$DATA/$d" "$WORK/pokeverse/"
done
[ -f "$DATA/library/games.json" ] && mkdir -p "$WORK/pokeverse/library" && cp "$DATA/library/games.json" "$WORK/pokeverse/library/"

tar -czf "$DEST/pokeverse-$STAMP.tar.gz" -C "$WORK" pokeverse
echo "wrote $DEST/pokeverse-$STAMP.tar.gz"
# Prune old backups.
ls -1t "$DEST"/pokeverse-*.tar.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r f; do rm -f "$f"; done
