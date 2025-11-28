# Database Architecture

This document explains the database implementation in VibeTree, including the schema design, repository pattern, and migration strategy.

## Overview

VibeTree uses **SQLite** as its embedded database with **Drizzle ORM** for type-safe queries. The database replaces the previous JSON file-based storage system and provides:

- Type-safe schema definitions
- ACID transaction support
- Better performance for complex queries
- Automatic migration from legacy JSON files
- Repository pattern for clean data access

## Database Location

- **Desktop App**: `~/.config/VibeTree/vibetree.db`
- **Custom Location**: Set via `ELECTRON_USER_DATA_DIR` environment variable

## Schema Design

### Tables

#### 1. **projects**
Stores project paths and metadata.

```typescript
{
  id: string (CUID)
  name: string
  path: string (unique)
  lastOpened: Date
  isFavorite: boolean
  status: string
  createdAt: Date
  updatedAt: Date
}
```

**Indexes**: `path` (unique)

#### 2. **project_settings**
Per-project configuration stored as JSON.

```typescript
{
  id: string (CUID)
  projectId: string (FK -> projects.id)
  category: string
  key: string
  value: JSON
  updatedAt: Date
}
```

**Constraints**: Unique constraint on `(projectId, category, key)`

#### 3. **system_settings**
Global application settings.

```typescript
{
  id: string (CUID)
  category: string
  key: string
  value: JSON
  updatedAt: Date
}
```

**Constraints**: Unique constraint on `(category, key)`

**Categories**:
- `terminal` - Terminal emulator settings (font, colors, etc.)
- `ui` - UI preferences
- `paths` - Custom paths configuration

#### 4. **scheduler_history**
Command scheduling history for re-use.

```typescript
{
  id: string (CUID)
  projectId: string? (FK -> projects.id)
  command: string
  delayMs: number
  repeat: boolean
  createdAt: Date
  updatedAt: Date
}
```

#### 5. **coding_agents**
Configuration for AI coding agents.

```typescript
{
  id: string (CUID)
  name: string
  type: string
  endpoint: string?
  config: JSON
  hookConfig: JSON
  isDefault: boolean
  createdAt: Date
  updatedAt: Date
}
```

#### 6. **agent_prompts**
Reusable prompt library for coding agents.

```typescript
{
  id: string (CUID)
  agentId: string? (FK -> coding_agents.id)
  name: string
  category: string
  prompt: string
  tags: JSON
  isFavorite: boolean
  createdAt: Date
  updatedAt: Date
}
```

## Repository Pattern

Data access is encapsulated in repository classes:

### ProjectRepository

```typescript
// Core operations
findRecent(limit?: number): Project[]
findByPath(path: string): Project | undefined
upsert(data: Partial<Project>): Project
updateLastOpened(path: string): Project
deleteByPath(path: string): void
clear(): void
count(): number

// Settings management
getSettings(projectId: string): ProjectSettings[]
setSetting(projectId: string, category: string, key: string, value: any): void
```

**Auto-cleanup**: Maintains max 10 recent projects (preserves favorites)

### SettingsRepository

```typescript
// Terminal settings
getTerminalSettings(): TerminalSettings
updateTerminalSettings(updates: Partial<TerminalSettings>): TerminalSettings
resetTerminalSettings(): TerminalSettings

// Generic settings
get(category: string, key: string): any
set(category: string, key: string, value: any): void
getCategory(category: string): SystemSetting[]
```

### SchedulerRepository

```typescript
findRecent(limit?: number): SchedulerHistory[]
create(data: Omit<SchedulerHistory, 'id' | 'createdAt' | 'updatedAt'>): SchedulerHistory
clear(): void
```

### AgentRepository & AgentPromptRepository

```typescript
// Agent management
findAll(): CodingAgent[]
findById(id: string): CodingAgent | undefined
create(data: Omit<CodingAgent, 'id' | 'createdAt' | 'updatedAt'>): CodingAgent
update(id: string, data: Partial<CodingAgent>): CodingAgent
delete(id: string): void

// Prompt management
findByAgent(agentId: string): AgentPrompt[]
findByCategory(category: string): AgentPrompt[]
findFavorites(): AgentPrompt[]
```

## Database Connection

### Initialization

```typescript
import { createDatabase } from '@vibetree/database';

const connection = createDatabase({
  dbPath: '/path/to/database.db',
  migrationsFolder: '/path/to/migrations',
  verbose: false // Enable SQL logging
});

const { db, sqlite, close } = connection;
```

### Configuration

The database uses:
- **WAL mode** (Write-Ahead Logging) for better concurrency
- **Foreign keys enabled** for referential integrity
- **Automatic migrations** on startup

## Migration from JSON Files

### Auto-Migration

On first run, the database automatically migrates data from legacy JSON files:

**JSON Files → Database Tables**:
- `recent-projects.json` → `projects` table
- `terminal-settings.json` → `system_settings` table (category: `terminal`)
- `scheduler-history.json` → `scheduler_history` table

**Migration Process**:
1. Check if database is empty (skip if data exists)
2. Look for JSON files in userData directory
3. Parse and validate JSON data
4. Insert into appropriate tables
5. Rename JSON files to `.migrated`

**Migration Utility**:
```typescript
import { migrateFromJson } from '@vibetree/database';

const result = migrateFromJson({
  userDataPath: app.getPath('userData'),
  projectRepo,
  settingsRepo,
  schedulerRepo,
  renameOldFiles: true
});

console.log(`Migrated: ${result.projectsMigrated} projects`);
console.log(`Migrated: ${result.schedulerEntriesMigrated} scheduler entries`);
```

## Usage in Desktop App

### Service Initialization

```typescript
// apps/desktop/src/main/database.ts
import { databaseService } from './database';

// Initialize on app startup
app.whenReady().then(() => {
  databaseService.initialize(); // Runs migrations automatically
  // ... rest of initialization
});
```

### IPC Handlers

```typescript
// apps/desktop/src/main/ipc-handlers.ts
import { databaseService } from './database';

// Recent projects
ipcMain.handle('recent-projects:get', () => {
  return databaseService.projects.findRecent();
});

ipcMain.handle('recent-projects:add', (_, projectPath: string) => {
  databaseService.projects.updateLastOpened(projectPath);
});

// Terminal settings
ipcMain.handle('terminal-settings:get', () => {
  return databaseService.settings.getTerminalSettings();
});

ipcMain.handle('terminal-settings:update', (_, updates) => {
  return databaseService.settings.updateTerminalSettings(updates);
});
```

## Database Inspection

### Using sqlite3 CLI

```bash
# Open database
sqlite3 ~/.config/VibeTree/vibetree.db

# Show all tables
.tables

# Show schema
.schema projects

# Query data
SELECT * FROM projects ORDER BY last_opened DESC LIMIT 10;
SELECT * FROM system_settings WHERE category = 'terminal';
SELECT * FROM scheduler_history;

# Exit
.quit
```

### Using Drizzle Studio (Development)

```bash
# Install drizzle-kit
pnpm add -D drizzle-kit

# Launch Drizzle Studio
pnpm drizzle-kit studio
```

## Performance Considerations

### Indexes

All tables have:
- Primary key index on `id`
- Unique constraints create automatic indexes
- Foreign keys are indexed automatically

### Query Optimization

```typescript
// Good: Use prepared statements (automatic with Drizzle)
const stmt = db.select().from(projects).where(eq(projects.path, projectPath));

// Good: Limit results
const recent = db.select().from(projects).limit(10);

// Good: Use transactions for bulk operations
const insertMany = db.transaction((projects) => {
  for (const p of projects) {
    db.insert(projects).values(p).run();
  }
});
```

### WAL Mode Benefits

- Concurrent reads don't block writes
- Faster write performance
- Better crash recovery

## Error Handling

### Validation Before Insert

```typescript
import { validateDirectoryPath } from '@vibetree/core';

const validation = validateDirectoryPath(projectPath);
if (!validation.valid) {
  throw new Error(`Invalid project path: ${validation.error}`);
}

// Safe to insert
projectRepo.upsert({ path: projectPath });
```

### Transaction Safety

```typescript
try {
  db.transaction((tx) => {
    tx.insert(projects).values(newProject);
    tx.insert(projectSettings).values(settings);
  });
} catch (error) {
  console.error('Transaction failed:', error);
  // Transaction automatically rolled back
}
```

## Schema Migrations

### Creating a Migration

```bash
cd packages/database

# Generate migration from schema changes
pnpm drizzle-kit generate:sqlite
```

### Migration Files

Located in `packages/database/drizzle/migrations/`:
- SQL migration files
- Metadata JSON files
- Automatic versioning

### Running Migrations

Migrations run automatically on `createDatabase()` if `migrationsFolder` is provided.

## Future Enhancements

Potential improvements for the database layer:

1. **Backup/Restore**: Implement periodic backups
2. **Sync**: Cloud sync for settings and projects
3. **Full-text Search**: Add FTS5 for project search
4. **Analytics**: Track usage patterns
5. **Cleanup**: Automatic cleanup of old scheduler history

## Related Documentation

- [Database Testing Guide](./database-testing.md)
- [Run E2E Tests](./run-e2e-test.md)
- [Error Handling](./error-handling.md)

## Support

For issues or questions:
- Check existing tests in `packages/database/src/__tests__/`
- Review repository implementations for examples
- See [database-testing.md](./database-testing.md) for testing procedures
