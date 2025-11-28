import { eq, desc } from 'drizzle-orm';
import { DrizzleDB } from '../connection';
import { schedulerHistory, SchedulerHistory, NewSchedulerHistory } from '../schema/scheduler';
import { createId } from '@paralleldrive/cuid2';

export class SchedulerRepository {
  private static readonly MAX_HISTORY_ENTRIES = 20;

  constructor(private db: DrizzleDB) {}

  /**
   * Get all scheduler history entries
   */
  findAll(): SchedulerHistory[] {
    return this.db
      .select()
      .from(schedulerHistory)
      .orderBy(desc(schedulerHistory.createdAt))
      .all();
  }

  /**
   * Get recent scheduler history with limit
   */
  findRecent(limit = SchedulerRepository.MAX_HISTORY_ENTRIES): SchedulerHistory[] {
    return this.db
      .select()
      .from(schedulerHistory)
      .orderBy(desc(schedulerHistory.createdAt))
      .limit(limit)
      .all();
  }

  /**
   * Get scheduler history for a specific project
   */
  findByProject(projectId: string, limit?: number): SchedulerHistory[] {
    const query = this.db
      .select()
      .from(schedulerHistory)
      .where(eq(schedulerHistory.projectId, projectId))
      .orderBy(desc(schedulerHistory.createdAt));

    if (limit) {
      return query.limit(limit).all();
    }

    return query.all();
  }

  /**
   * Add a scheduler history entry
   */
  create(data: Omit<NewSchedulerHistory, 'id' | 'createdAt'>): SchedulerHistory {
    const entry = this.db
      .insert(schedulerHistory)
      .values({
        id: createId(),
        projectId: data.projectId,
        command: data.command,
        delayMs: data.delayMs,
        repeat: data.repeat,
        createdAt: new Date(),
      })
      .returning()
      .get();

    // Enforce max history limit
    this.enforceHistoryLimit();

    return entry;
  }

  /**
   * Delete a scheduler history entry
   */
  delete(id: string): boolean {
    const result = this.db.delete(schedulerHistory).where(eq(schedulerHistory.id, id)).run();
    return result.changes > 0;
  }

  /**
   * Clear all scheduler history
   */
  clear(): void {
    this.db.delete(schedulerHistory).run();
  }

  /**
   * Clear scheduler history for a specific project
   */
  clearByProject(projectId: string): void {
    this.db.delete(schedulerHistory).where(eq(schedulerHistory.projectId, projectId)).run();
  }

  /**
   * Enforce max history entries limit
   */
  private enforceHistoryLimit(): void {
    const allEntries = this.findAll();

    if (allEntries.length > SchedulerRepository.MAX_HISTORY_ENTRIES) {
      const toDelete = allEntries.slice(SchedulerRepository.MAX_HISTORY_ENTRIES);

      for (const entry of toDelete) {
        this.delete(entry.id);
      }
    }
  }
}
