#!/bin/bash
set -e

echo "🧪 Testing Database & Error Handling Implementation"
echo ""

echo "1️⃣  Building packages..."
pnpm build

echo ""
echo "2️⃣  Checking database package..."
ls -lh packages/database/dist/index.js
echo "✅ Database package built"

echo ""
echo "3️⃣  Checking validation utilities..."
grep -q "validateFilePath" packages/core/dist/index.d.ts && echo "✅ Validation utilities exported"

echo ""
echo "4️⃣  Checking ErrorBoundary..."
grep -q "ErrorBoundary" packages/ui/dist/index.d.ts && echo "✅ ErrorBoundary exported"

echo ""
echo "5️⃣  Verifying desktop app includes database..."
grep -q "@vibetree/database" apps/desktop/package.json && echo "✅ Desktop app includes database dependency"

echo ""
echo "6️⃣  Running type checks..."
pnpm typecheck

echo ""
echo "✨ All basic tests passed!"
echo ""
echo "Next steps:"
echo "  1. Run: pnpm dev:desktop"
echo "  2. Open a project"
echo "  3. Check that ~/.config/VibeTree/vibetree.db was created"
echo "  4. Inspect database: sqlite3 ~/.config/VibeTree/vibetree.db"
echo ""
echo "For manual testing, see TESTING.md"
