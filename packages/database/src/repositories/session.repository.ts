import { eq } from 'drizzle-orm';
import { DrizzleDB } from '../connection';
import { terminalSessions, TerminalSession } from '../schema/sessions';

export class SessionRepository {
  constructor(private db: DrizzleDB) {}

  /**
   * Create or update a session record (atomic upsert)
   */
  upsert(data: {
    id: string;
    projectPath: string;
    worktreePath: string;
    tmuxSessionName: string;
    status?: string;
    isExternal?: boolean;
  }): TerminalSession {
    const now = new Date();

    const result = this.db
      .insert(terminalSessions)
      .values({
        id: data.id,
        projectPath: data.projectPath,
        worktreePath: data.worktreePath,
        tmuxSessionName: data.tmuxSessionName,
        status: data.status ?? 'active',
        isExternal: data.isExternal ?? false,
        createdAt: now,
        lastActivity: now,
      })
      .onConflictDoUpdate({
        target: terminalSessions.id,
        set: {
          projectPath: data.projectPath,
          worktreePath: data.worktreePath,
          tmuxSessionName: data.tmuxSessionName,
          status: data.status ?? 'active',
          isExternal: data.isExternal ?? false,
          lastActivity: now,
        },
      })
      .returning()
      .get();

    return result!;
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
   * Find a session by its ID
   */
  findById(id: string): TerminalSession | undefined {
    return this.db
      .select()
      .from(terminalSessions)
      .where(eq(terminalSessions.id, id))
      .get();
  }

  /**
   * Update session status
   */
  updateStatus(id: string, status: string): boolean {
    const result = this.db
      .update(terminalSessions)
      .set({ status })
      .where(eq(terminalSessions.id, id))
      .run();
    return result.changes > 0;
  }

  /**
   * Update last activity timestamp
   */
  updateActivity(id: string): boolean {
    const result = this.db
      .update(terminalSessions)
      .set({ lastActivity: new Date() })
      .where(eq(terminalSessions.id, id))
      .run();
    return result.changes > 0;
  }

  /**
   * Update worktree path for a session
   */
  updateWorktreePath(id: string, worktreePath: string): boolean {
    const result = this.db
      .update(terminalSessions)
      .set({ worktreePath, lastActivity: new Date() })
      .where(eq(terminalSessions.id, id))
      .run();
    return result.changes > 0;
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
   * Mark all sessions as 'dead' (for server startup reconciliation)
   */
  markAllDead(): number {
    const result = this.db
      .update(terminalSessions)
      .set({ status: 'dead' })
      .run();
    return result.changes;
  }
}
