#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== Consumer Test ==="

# 1. Build fresh dist/
echo "→ Building package..."
(cd "$ROOT_DIR" && npm run build)

# 2. Pack tarball (clean stale tarballs first to avoid version mismatch)
echo "→ Packing tarball..."
rm -f "$SCRIPT_DIR"/convex-notifications-*.tgz
(cd "$ROOT_DIR" && npm pack --pack-destination "$SCRIPT_DIR")

# 3. Install from tarball (own node_modules, not root's)
echo "→ Installing from tarball..."
cd "$SCRIPT_DIR"
TARBALL=$(ls convex-notifications-*.tgz 2>/dev/null | head -1)
if [ -z "$TARBALL" ]; then
  echo "ERROR: No tarball found"
  exit 1
fi
npm install --no-package-lock "$TARBALL"

# 4. TypeScript check (Bundler — what most Convex apps use)
echo "→ Type checking (Bundler moduleResolution)..."
npx tsc --noEmit

# 5. TypeScript check (Node16 — strictest)
echo "→ Type checking (Node16 moduleResolution)..."
npx tsc --noEmit -p tsconfig.node16.json

# 6. Runtime import tests
echo "→ Running import tests..."
npx vitest run

# 7. Cleanup
echo "→ Cleaning up..."
rm -f "$SCRIPT_DIR"/convex-notifications-*.tgz
git checkout -- "$SCRIPT_DIR/package.json" 2>/dev/null || true
git checkout -- "$ROOT_DIR/package-lock.json" 2>/dev/null || true

echo "=== All consumer tests passed ==="
