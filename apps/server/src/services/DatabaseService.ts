import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import {
  createDatabase,
  ProjectRepository,
  SettingsRepository,
  SchedulerRepository,
  AgentRepository,
  type DatabaseConnection,
} from '@vibetree/database';

/**
 * Server Database Service
 * Manages SQLite database connection and repositories
 */
class DatabaseService {
  private connection: DatabaseConnection | null = null;
  private _projects: ProjectRepository | null = null;
  private _settings: SettingsRepository | null = null;
  private _scheduler: SchedulerRepository | null = null;
  private _agents: AgentRepository | null = null;

  /**
   * Initialize the database
   * @param dbPath Optional database path (defaults to ~/.vibetree/vibetree.db or SERVER_DATA_DIR env var)
   */
  initialize(dbPath?: string): void {
    if (this.connection) {
      console.warn('[Database] Already initialized');
      return;
    }

    // Determine database path
    const resolvedDbPath = dbPath || this.getDefaultDbPath();

    // Ensure directory exists
    const dbDir = path.dirname(resolvedDbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const migrationsPath = path.join(__dirname, '../../node_modules/@vibetree/database/drizzle/migrations');

    console.log('[Database] Initializing at:', resolvedDbPath);

    try {
      // Create database connection
      this.connection = createDatabase({
        dbPath: resolvedDbPath,
        migrationsFolder: migrationsPath,
        verbose: false,
      });

      // Initialize repositories
      this._projects = new ProjectRepository(this.connection.db);
      this._settings = new SettingsRepository(this.connection.db);
      this._scheduler = new SchedulerRepository(this.connection.db);
      this._agents = new AgentRepository(this.connection.db);

      console.log('[Database] Initialized successfully');
    } catch (error) {
      console.error('[Database] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Get default database path
   * Priority: SERVER_DATA_DIR env var > ~/.vibetree/vibetree.db
   */
  private getDefaultDbPath(): string {
    if (process.env.SERVER_DATA_DIR) {
      return path.join(process.env.SERVER_DATA_DIR, 'vibetree.db');
    }

    const homeDir = os.homedir();
    return path.join(homeDir, '.vibetree', 'vibetree.db');
  }

  /**
   * Get project repository
   */
  get projects(): ProjectRepository {
    if (!this._projects) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this._projects;
  }

  /**
   * Get settings repository
   */
  get settings(): SettingsRepository {
    if (!this._settings) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this._settings;
  }

  /**
   * Get scheduler repository
   */
  get scheduler(): SchedulerRepository {
    if (!this._scheduler) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this._scheduler;
  }

  /**
   * Get agent repository
   */
  get agents(): AgentRepository {
    if (!this._agents) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this._agents;
  }

  /**
   * Check if database is initialized
   */
  get isInitialized(): boolean {
    return this.connection !== null;
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.connection) {
      this.connection.close();
      this.connection = null;
      this._projects = null;
      this._settings = null;
      this._scheduler = null;
      this._agents = null;
      console.log('[Database] Closed');
    }
  }
}

// Export singleton instance
export const databaseService = new DatabaseService();
