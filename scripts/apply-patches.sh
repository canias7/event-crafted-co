#!/usr/bin/env bash
# Applies any .patch files in patches/ against node_modules. Mirrors
# patch-package's behavior but works in a hoisted Yarn/npm/Bun
# workspace where patch-package's `getPackageResolution` chokes.
#
# Each patch file should be named `<pkg>+<version>.patch` and contain
# a unified diff rooted at `node_modules/<pkg>/...`. The script is
# idempotent — already-applied patches are skipped quietly.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PATCHES_DIR="$REPO_ROOT/patches"
[ -d "$PATCHES_DIR" ] || exit 0

cd "$REPO_ROOT"

for patch in "$PATCHES_DIR"/*.patch; do
  [ -f "$patch" ] || continue
  if patch -p1 --dry-run -f --silent --reject-file=- < "$patch" >/dev/null 2>&1; then
    patch -p1 -f --silent < "$patch"
    echo "applied: $(basename "$patch")"
  elif patch -p1 --dry-run -R -f --silent --reject-file=- < "$patch" >/dev/null 2>&1; then
    # Reverse-applies cleanly → already applied. Skip.
    :
  else
    echo "warn: $(basename "$patch") could not apply cleanly — skipping" >&2
  fi
done
