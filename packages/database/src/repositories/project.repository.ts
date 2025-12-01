import { eq, desc, count, and } from 'drizzle-orm';
import { DrizzleDB } from '../connection';
import { projects, projectSettings, Project, NewProject, ProjectSetting } from '../schema/projects';
import { createId } from '@paralleldrive/cuid2';

export class ProjectRepository {
  private static readonly MAX_RECENT_PROJECTS = 10;

  constructor(private db: DrizzleDB) {}

  /**
   * Find all projects, ordered by most recently opened
   */
  findAll(): Project[] {
    return this.db.select().from(projects).orderBy(desc(projects.lastOpened)).all();
  }

  /**
   * Find recent projects with limit
   */
  findRecent(limit = ProjectRepository.MAX_RECENT_PROJECTS): Project[] {
    return this.db
      .select()
      .from(projects)
      .orderBy(desc(projects.lastOpened))
      .limit(limit)
      .all();
  }

  /**
   * Find a project by path
   */
  findByPath(path: string): Project | undefined {
    return this.db.select().from(projects).where(eq(projects.path, path)).get();
  }

  /**
   * Find a project by ID
   */
  findById(id: string): Project | undefined {
    return this.db.select().from(projects).where(eq(projects.id, id)).get();
  }

  /**
   * Create or update a project (upsert)
   */
  upsert(data: Partial<NewProject> & { path: string }): Project {
    const existing = this.findByPath(data.path);
    const now = new Date();

    if (existing) {
      // Update existing project
      const updated = this.db
        .update(projects)
        .set({
          ...data,
          lastOpened: data.lastOpened || now,
          updatedAt: now,
        })
        .where(eq(projects.id, existing.id))
        .returning()
        .get();

      return updated!;
    } else {
      // Create new project
      const name = data.name || data.path.split('/').pop() || data.path;
      const newProject = this.db
        .insert(projects)
        .values({
          id: createId(),
          name,
          path: data.path,
          lastOpened: data.lastOpened || now,
          isFavorite: data.isFavorite ?? false,
          status: data.status || 'active',
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();

      // Enforce max recent projects limit
      this.enforceRecentLimit();

      return newProject;
    }
  }

  /**
   * Update last opened timestamp for a project
   */
  updateLastOpened(path: string): Project {
    return this.upsert({ path, lastOpened: new Date() });
  }

  /**
   * Update a project
   */
  update(id: string, data: Partial<Omit<Project, 'id' | 'createdAt'>>): Project | undefined {
    const result = this.db
      .update(projects)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning()
      .get();

    return result;
  }

  /**
   * Delete a project
   */
  delete(id: string): boolean {
    const result = this.db.delete(projects).where(eq(projects.id, id)).run();
    return result.changes > 0;
  }

  /**
   * Delete a project by path
   */
  deleteByPath(path: string): boolean {
    const result = this.db.delete(projects).where(eq(projects.path, path)).run();
    return result.changes > 0;
  }

  /**
   * Clear all projects
   */
  clear(): void {
    this.db.delete(projects).run();
  }

  /**
   * Count total projects
   */
  count(): number {
    const result = this.db.select({ count: count() }).from(projects).get();
    return result?.count || 0;
  }

  // Project settings methods

  /**
   * Get a project setting
   */
  getSetting(projectId: string, key: string): unknown | undefined {
    const setting = this.db
      .select()
      .from(projectSettings)
      .where(and(eq(projectSettings.projectId, projectId), eq(projectSettings.key, key)))
      .get();

    return setting?.value;
  }

  /**
   * Get all settings for a project
   */
  getAllSettings(projectId: string): Record<string, unknown> {
    const settings = this.db
      .select()
      .from(projectSettings)
      .where(eq(projectSettings.projectId, projectId))
      .all();

    return settings.reduce((acc, setting) => {
      acc[setting.key] = setting.value;
      return acc;
    }, {} as Record<string, unknown>);
  }

  /**
   * Set a project setting
   */
  setSetting(projectId: string, key: string, value: unknown): ProjectSetting {
    const existing = this.db
      .select()
      .from(projectSettings)
      .where(and(eq(projectSettings.projectId, projectId), eq(projectSettings.key, key)))
      .get();

    if (existing) {
      const updated = this.db
        .update(projectSettings)
        .set({ value, updatedAt: new Date() })
        .where(eq(projectSettings.id, existing.id))
        .returning()
        .get();

      return updated!;
    } else {
      const newSetting = this.db
        .insert(projectSettings)
        .values({
          id: createId(),
          projectId,
          key,
          value,
          updatedAt: new Date(),
        })
        .returning()
        .get();

      return newSetting;
    }
  }

  /**
   * Delete a project setting
   */
  deleteSetting(projectId: string, key: string): boolean {
    const result = this.db
      .delete(projectSettings)
      .where(and(eq(projectSettings.projectId, projectId), eq(projectSettings.key, key)))
      .run();

    return result.changes > 0;
  }

  /**
   * Enforce max recent projects limit (delete oldest non-favorited projects)
   */
  private enforceRecentLimit(): void {
    const totalCount = this.count();

    if (totalCount > ProjectRepository.MAX_RECENT_PROJECTS) {
      const oldest = this.db
        .select()
        .from(projects)
        .where(eq(projects.isFavorite, false))
        .orderBy(desc(projects.lastOpened))
        .offset(ProjectRepository.MAX_RECENT_PROJECTS)
        .all();

      for (const project of oldest) {
        this.delete(project.id);
      }
    }
  }
}
