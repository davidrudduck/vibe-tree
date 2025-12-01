import { app } from 'electron';
import * as path from 'path';
import {
  createDatabase,
  ProjectRepository,
  SettingsRepository,
  SchedulerRepository,
  AgentRepository,
  migrateFromJson,
  type DatabaseConnection,
} from '@vibetree/database';

/**
 * Desktop Database Service
 * Manages SQLite database connection and repositories
 */
class DatabaseService {
  private connection: DatabaseConnection | null = null;
  private _projects: ProjectRepository | null = null;
  private _settings: SettingsRepository | null = null;
  private _scheduler: SchedulerRepository | null = null;
  private _agents: AgentRepository | null = null;

  /**
   * Initialize the database (call when app is ready)
   */
  initialize(): void {
    if (this.connection) {
      console.warn('[Database] Already initialized');
      return;
    }

    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'vibetree.db');
    const migrationsPath = path.join(__dirname, '../../../node_modules/@vibetree/database/drizzle/migrations');

    console.log('[Database] Initializing at:', dbPath);

    try {
      // Create database connection
      this.connection = createDatabase({
        dbPath,
        migrationsFolder: migrationsPath,
        verbose: false,
      });

      // Initialize repositories
      this._projects = new ProjectRepository(this.connection.db);
      this._settings = new SettingsRepository(this.connection.db);
      this._scheduler = new SchedulerRepository(this.connection.db);
      this._agents = new AgentRepository(this.connection.db);

      console.log('[Database] Initialized successfully');

      // Migrate from JSON files if needed
      this.migrateFromJsonFiles(userDataPath);
    } catch (error) {
      console.error('[Database] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Migrate data from JSON files to database
   */
  private migrateFromJsonFiles(userDataPath: string): void {
    if (!this._projects || !this._settings || !this._scheduler) {
      console.warn('[Database] Repositories not initialized, skipping migration');
      return;
    }

    try {
      const result = migrateFromJson({
        userDataPath,
        projectRepo: this._projects,
        settingsRepo: this._settings,
        schedulerRepo: this._scheduler,
        renameOldFiles: true,
      });

      if (result.errors.length > 0) {
        console.warn('[Database] Migration completed with errors:', result.errors);
      }
    } catch (error) {
      console.error('[Database] Migration failed:', error);
    }
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
