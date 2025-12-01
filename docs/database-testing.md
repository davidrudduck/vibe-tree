# Testing Plan: Database & Error Handling Implementation

## Quick Test Commands

```bash
# 1. Build all packages
pnpm build

# 2. Start desktop app in dev mode
pnpm dev:desktop

# 3. Start server + web app
pnpm dev:all
```

## Detailed Testing Checklist

### 1. Database Migration Testing

**Test auto-migration from JSON files:**

```bash
# Create test JSON files in userData directory
mkdir -p ~/.config/VibeTree-test

# Create sample recent-projects.json
cat > ~/.config/VibeTree-test/recent-projects.json << 'EOF'
[
  {
    "path": "/tmp/test-project",
    "name": "Test Project",
    "lastOpened": 1234567890000
  }
]
EOF

# Create sample terminal-settings.json
cat > ~/.config/VibeTree-test/terminal-settings.json << 'EOF'
{
  "fontFamily": "Monaco",
  "fontSize": 16,
  "cursorBlink": true,
  "scrollback": 5000,
  "tabStopWidth": 4,
  "setLocaleVariables": true
}
EOF

# Create sample scheduler-history.json
cat > ~/.config/VibeTree-test/scheduler-history.json << 'EOF'
[
  {
    "command": "echo test",
    "delayMs": 1000,
    "repeat": false,
    "timestamp": 1234567890000
  }
]
EOF

# Launch app with custom userData path
ELECTRON_USER_DATA_DIR=~/.config/VibeTree-test pnpm dev:desktop
```

**Expected Results:**
- ✅ App starts successfully
- ✅ Database created at `~/.config/VibeTree-test/vibetree.db`
- ✅ JSON files renamed to `.migrated`
- ✅ Data appears in the app (recent projects, terminal settings, scheduler history)

### 2. Database Inspection

```bash
# Install sqlite3 if needed
# sudo apt-get install sqlite3  # Ubuntu/Debian
# brew install sqlite3          # macOS

# Inspect the database
sqlite3 ~/.config/VibeTree/vibetree.db

# Run these SQL queries in sqlite3:
.tables                                    # Show all tables
.schema projects                           # Show projects schema
SELECT * FROM projects;                    # View all projects
SELECT * FROM system_settings;             # View settings
SELECT * FROM scheduler_history;           # View scheduler history
.quit
```

### 3. Error Boundary Testing

**Test React ErrorBoundary:**

```bash
# Start the app
pnpm dev:desktop
```

Then in the browser DevTools console:
```javascript
// Force a component error
throw new Error('Test error boundary');
```

**Expected Results:**
- ✅ App doesn't crash completely
- ✅ Error boundary shows fallback UI
- ✅ "Try Again" button appears
- ✅ Error logged to console: `[App Crash] Test error boundary`

### 4. Validation Testing

**Test worker script validation:**

```bash
# Temporarily rename the worker to simulate missing file
mv packages/core/dist/workers/pty-worker.cjs packages/core/dist/workers/pty-worker.cjs.bak

# Try to start the app
pnpm dev:desktop
```

**Expected Results:**
- ✅ App shows clear error message about missing worker script
- ✅ Error lists all tried paths
- ✅ App doesn't crash with unclear error

```bash
# Restore the worker
mv packages/core/dist/workers/pty-worker.cjs.bak packages/core/dist/workers/pty-worker.cjs
```

### 5. Server Port Handling Testing

**Test graceful port handling:**

```bash
# Block port 3002
nc -l 3002 &
NC_PID=$!

# Start server
pnpm dev:server
```

**Expected Results:**
- ✅ Server automatically tries ports 3003, 3004, etc.
- ✅ Server starts on available port
- ✅ Clear log message: "Port 3002 was not available, using port 3003 instead"

```bash
# Cleanup
kill $NC_PID
```

**Test port exhaustion:**

```bash
# Block ports 3002-3011
for port in {3002..3011}; do nc -l $port & done

# Try to start server
pnpm dev:server
```

**Expected Results:**
- ✅ Clear error message displayed
- ✅ Helpful suggestions shown (lsof, PORT env variable, etc.)
- ✅ Clean exit with code 1

```bash
# Cleanup
killall nc
```

### 6. WebSocket Retry Testing

**Test WebSocket resilience:**

```bash
# Start server
pnpm dev:server

# In another terminal, start web app
pnpm dev:web

# Kill server mid-operation
pkill -f "apps/server"

# Restart server
pnpm dev:server
```

**Expected Results:**
- ✅ Web app shows retry messages in console
- ✅ Exponential backoff visible (1s, 2s, 3s delays)
- ✅ Reconnects automatically when server comes back
- ✅ Clear error categorization (TIMEOUT, CONNECTION_LOST, etc.)

### 7. Functional Testing

**Test recent projects:**

```bash
pnpm dev:desktop
```

In the app:
1. Open a project (File → Open Project)
2. Close and reopen the app
3. Check recent projects menu

**Expected:**
- ✅ Project appears in recent projects
- ✅ Stored in database (not JSON file)
- ✅ Persists across restarts

**Test terminal settings:**

In the app:
1. Open Settings
2. Change terminal font size
3. Close and reopen the app

**Expected:**
- ✅ Settings persist
- ✅ Stored in database
- ✅ Applied on next startup

**Test scheduler history:**

In the app:
1. Open scheduler dialog
2. Add a command with delay
3. Close and reopen the app
4. Open scheduler again

**Expected:**
- ✅ Command appears in history
- ✅ Stored in database
- ✅ Available for reuse

### 8. Performance Testing

**Database query performance:**

```bash
# Create a test script to add many projects
cat > test-db-performance.js << 'EOF'
const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

const dbPath = path.join(os.homedir(), '.config/VibeTree/vibetree.db');
const db = new Database(dbPath);

const start = Date.now();

// Insert 1000 projects
const insert = db.prepare('INSERT INTO projects (id, name, path, last_opened, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
const insertMany = db.transaction((projects) => {
  for (const p of projects) insert.run(p);
});

const projects = Array.from({ length: 1000 }, (_, i) => [
  `test-${i}`,
  `Project ${i}`,
  `/tmp/project-${i}`,
  Date.now(),
  Date.now(),
  Date.now()
]);

insertMany(projects);

const elapsed = Date.now() - start;
console.log(`Inserted 1000 projects in ${elapsed}ms`);

// Query performance
const queryStart = Date.now();
const results = db.prepare('SELECT * FROM projects ORDER BY last_opened DESC LIMIT 10').all();
const queryElapsed = Date.now() - queryStart;
console.log(`Queried 10 recent from 1000+ in ${queryElapsed}ms`);

db.close();
EOF

node test-db-performance.js
rm test-db-performance.js
```

**Expected:**
- ✅ Inserts complete in < 100ms
- ✅ Queries complete in < 10ms

### 9. E2E Testing

```bash
# Run existing E2E tests to ensure no regressions
pnpm --filter @vibetree/desktop test:e2e
```

**Expected:**
- ✅ All existing tests pass
- ✅ No new failures introduced

## Automated Test Script

Create a quick test script:

```bash
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
```

Save as `test-implementation.sh`, make executable, and run:

```bash
chmod +x test-implementation.sh
./test-implementation.sh
```

## Manual Push to GitHub

Since the push needs authentication:

```bash
# Option 1: Use SSH (if you have SSH keys set up)
git remote set-url origin git@github.com:davidrudduck/vibe-tree.git
git push -u origin feat/database-and-error-handling

# Option 2: Use HTTPS with credentials
git push -u origin feat/database-and-error-handling
# Enter your GitHub username and personal access token when prompted

# Option 3: Create PR via web interface
# 1. Push your local main branch first
git checkout main
git push origin main

# 2. Push the feature branch
git checkout feat/database-and-error-handling
git push origin feat/database-and-error-handling

# 3. Go to https://github.com/davidrudduck/vibe-tree/pulls
# 4. Click "New Pull Request"
# 5. Select: base: main <- compare: feat/database-and-error-handling
```

## What to Look For

### ✅ Success Indicators

- Database file created at `~/.config/VibeTree/vibetree.db`
- JSON files renamed to `.migrated`
- App starts without errors
- Recent projects persist across restarts
- Terminal settings persist
- No console errors about missing dependencies
- ErrorBoundary catches errors gracefully

### ❌ Failure Indicators

- "Cannot find module @vibetree/database" errors
- App crashes on startup
- Missing worker script errors
- Database migration errors
- Settings don't persist

## Debugging

If you encounter issues:

```bash
# Check database was created
ls -lh ~/.config/VibeTree/

# Check migration ran
sqlite3 ~/.config/VibeTree/vibetree.db ".tables"

# Check logs
tail -f /tmp/electron-*.log  # Electron logs

# Rebuild everything
pnpm clean
pnpm install
pnpm build
```
