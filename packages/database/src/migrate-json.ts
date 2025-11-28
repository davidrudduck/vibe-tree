import * as fs from 'fs';
import * as path from 'path';
import { ProjectRepository, SettingsRepository, SchedulerRepository } from './repositories';

export interface JsonMigrationResult {
  projects: number;
  settings: number;
  scheduler: number;
  errors: string[];
}

export interface JsonMigrationOptions {
  userDataPath: string;
  projectRepo: ProjectRepository;
  settingsRepo: SettingsRepository;
  schedulerRepo: SchedulerRepository;
  renameOldFiles?: boolean;
}

/**
 * Migrate data from JSON files to the database
 * This runs automatically on first database initialization
 */
export function migrateFromJson(options: JsonMigrationOptions): JsonMigrationResult {
  const { userDataPath, projectRepo, settingsRepo, schedulerRepo, renameOldFiles = true } = options;

  const result: JsonMigrationResult = {
    projects: 0,
    settings: 0,
    scheduler: 0,
    errors: [],
  };

  // Only migrate if database is empty
  if (projectRepo.count() > 0) {
    console.log('[Migration] Database already has data, skipping JSON migration');
    return result;
  }

  console.log('[Migration] Starting JSON migration from:', userDataPath);

  // Migrate recent-projects.json
  const recentProjectsFile = path.join(userDataPath, 'recent-projects.json');
  if (fs.existsSync(recentProjectsFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(recentProjectsFile, 'utf8'));

      if (Array.isArray(data)) {
        for (const project of data) {
          try {
            projectRepo.upsert({
              path: project.path,
              name: project.name,
              lastOpened: new Date(project.lastOpened),
            });
            result.projects++;
          } catch (error) {
            result.errors.push(`Failed to migrate project ${project.path}: ${error}`);
          }
        }

        console.log(`[Migration] Migrated ${result.projects} projects`);

        if (renameOldFiles) {
          fs.renameSync(recentProjectsFile, `${recentProjectsFile}.migrated`);
          console.log('[Migration] Renamed recent-projects.json to .migrated');
        }
      }
    } catch (error) {
      result.errors.push(`Failed to read recent-projects.json: ${error}`);
      console.error('[Migration]', result.errors[result.errors.length - 1]);
    }
  }

  // Migrate terminal-settings.json
  const terminalSettingsFile = path.join(userDataPath, 'terminal-settings.json');
  if (fs.existsSync(terminalSettingsFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(terminalSettingsFile, 'utf8'));

      settingsRepo.set('terminal', 'preferences', data);
      result.settings++;

      console.log('[Migration] Migrated terminal settings');

      if (renameOldFiles) {
        fs.renameSync(terminalSettingsFile, `${terminalSettingsFile}.migrated`);
        console.log('[Migration] Renamed terminal-settings.json to .migrated');
      }
    } catch (error) {
      result.errors.push(`Failed to migrate terminal settings: ${error}`);
      console.error('[Migration]', result.errors[result.errors.length - 1]);
    }
  }

  // Migrate scheduler-history.json
  const schedulerHistoryFile = path.join(userDataPath, 'scheduler-history.json');
  if (fs.existsSync(schedulerHistoryFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(schedulerHistoryFile, 'utf8'));

      if (Array.isArray(data)) {
        for (const entry of data) {
          try {
            schedulerRepo.create({
              command: entry.command,
              delayMs: entry.delayMs,
              repeat: entry.repeat,
              projectId: null, // Old format didn't have projectId
            });
            result.scheduler++;
          } catch (error) {
            result.errors.push(`Failed to migrate scheduler entry: ${error}`);
          }
        }

        console.log(`[Migration] Migrated ${result.scheduler} scheduler history entries`);

        if (renameOldFiles) {
          fs.renameSync(schedulerHistoryFile, `${schedulerHistoryFile}.migrated`);
          console.log('[Migration] Renamed scheduler-history.json to .migrated');
        }
      }
    } catch (error) {
      result.errors.push(`Failed to migrate scheduler history: ${error}`);
      console.error('[Migration]', result.errors[result.errors.length - 1]);
    }
  }

  console.log('[Migration] Complete:', result);
  return result;
}
