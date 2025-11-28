import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';
import * as fs from 'fs';
import * as path from 'path';

export type DrizzleDB = BetterSQLite3Database<typeof schema>;

export interface DatabaseConnection {
  db: DrizzleDB;
  sqlite: Database.Database;
  close: () => void;
}

export interface CreateDatabaseOptions {
  dbPath: string;
  migrationsFolder?: string;
  verbose?: boolean;
}

/**
 * Create a SQLite database connection with Drizzle ORM
 */
export function createDatabase(options: CreateDatabaseOptions): DatabaseConnection {
  const { dbPath, migrationsFolder, verbose } = options;

  // Ensure directory exists
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Create SQLite connection
  const sqlite = new Database(dbPath, {
    verbose: verbose ? console.log : undefined,
  });

  // Enable WAL mode for better concurrent read/write performance
  sqlite.pragma('journal_mode = WAL');

  // Enable foreign keys
  sqlite.pragma('foreign_keys = ON');

  // Create Drizzle instance
  const db = drizzle(sqlite, { schema });

  // Run migrations if folder provided
  if (migrationsFolder && fs.existsSync(migrationsFolder)) {
    try {
      migrate(db, { migrationsFolder });
    } catch (error) {
      console.error('[Database] Migration failed:', error);
      // Don't throw - allow app to continue
    }
  }

  return {
    db,
    sqlite,
    close: () => sqlite.close(),
  };
}
