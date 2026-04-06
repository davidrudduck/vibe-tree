import { eq } from 'drizzle-orm';
import { DrizzleDB } from '../connection';
import { terminalSessions, TerminalSession } from '../schema/sessions';
import { createId } from '@paralleldrive/cuid2';

export class SessionRepository {
  constructor(private db: DrizzleDB) {}

  /**
   * Create or update a session record
   */
  upsert(data: {
    id: string;
    projectPath: string;
    worktreePath: string;
    tmuxSessionName: string;
    status?: string;
  }): TerminalSession {
    const existing = this.db
      .select()
      .from(terminalSessions)
      .where(eq(terminalSessions.id, data.id))
      .get();

    const now = new Date();

    if (existing) {
      const updated = this.db
        .update(terminalSessions)
        .set({
          projectPath: data.projectPath,
          worktreePath: data.worktreePath,
          tmuxSessionName: data.tmuxSessionName,
          status: data.status ?? existing.status,
          lastActivity: now,
        })
        .where(eq(terminalSessions.id, data.id))
        .returning()
        .get();

      return updated!;
    } else {
      const newSession = this.db
        .insert(terminalSessions)
        .values({
          id: data.id || createId(),
          projectPath: data.projectPath,
          worktreePath: data.worktreePath,
          tmuxSessionName: data.tmuxSessionName,
          status: data.status ?? 'active',
          createdAt: now,
          lastActivity: now,
        })
        .returning()
        .get();

      return newSession!;
    }
  }

  /**
   * Find all sessions, optionally filtered by status
   */
  findAll(status?: string): TerminalSession[] {
    if (status !== undefined) {
      return this.db
        .select()
        .from(terminalSessions)
        .where(eq(terminalSessions.status, status))
        .all();
    }
    return this.db.select().from(terminalSessions).all();
  }

  /**
   * Find sessions for a specific project
   */
  findByProject(projectPath: string): TerminalSession[] {
    return this.db
      .select()
      .from(terminalSessions)
      .where(eq(terminalSessions.projectPath, projectPath))
      .all();
  }

  /**
   * Find sessions for a specific worktree
   */
  findByWorktree(worktreePath: string): TerminalSession[] {
    return this.db
      .select()
      .from(terminalSessions)
      .where(eq(terminalSessions.worktreePath, worktreePath))
      .all();
  }

  /**
   * Find a session by its tmux session name
   */
  findByTmuxName(tmuxName: string): TerminalSession | undefined {
    return this.db
      .select()
      .from(terminalSessions)
      .where(eq(terminalSessions.tmuxSessionName, tmuxName))
      .get();
  }

  /**
   * Update session status
   */
  updateStatus(id: string, status: string): void {
    this.db
      .update(terminalSessions)
      .set({ status })
      .where(eq(terminalSessions.id, id))
      .run();
  }

  /**
   * Update last activity timestamp
   */
  updateActivity(id: string): void {
    this.db
      .update(terminalSessions)
      .set({ lastActivity: new Date() })
      .where(eq(terminalSessions.id, id))
      .run();
  }

  /**
   * Delete a session record
   */
  delete(id: string): boolean {
    const result = this.db
      .delete(terminalSessions)
      .where(eq(terminalSessions.id, id))
      .run();
    return result.changes > 0;
  }

  /**
   * Delete all sessions with 'dead' status
   */
  pruneDead(): number {
    const result = this.db
      .delete(terminalSessions)
      .where(eq(terminalSessions.status, 'dead'))
      .run();
    return result.changes;
  }

  /**
   * Mark all 'active' sessions as 'disconnected' (for server startup)
   */
  markAllDisconnected(): number {
    const result = this.db
      .update(terminalSessions)
      .set({ status: 'disconnected' })
      .where(eq(terminalSessions.status, 'active'))
      .run();
    return result.changes;
  }
}
