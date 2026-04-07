import * as pty from 'node-pty';
import { SessionManagerFactory, ShellSessionManager, TmuxSessionManager, type ShellStartResult } from '@vibetree/core';

/**
 * Server shell manager - uses SessionManagerFactory for automatic tmux/PTY selection
 * Handles WebSocket communication
 */
export class ShellManager {
  private sessionManager: ShellSessionManager | TmuxSessionManager | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize the session manager (detects tmux availability)
   */
  private async initialize(): Promise<void> {
    if (this.sessionManager) return;

    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      this.sessionManager = await SessionManagerFactory.getSessionManager();
      const type = SessionManagerFactory.getCurrentType();
      console.log(`[ShellManager] Using ${type} session manager`);
    })();

    return this.initPromise;
  }

  async startShell(worktreePath: string, userId?: string, cols = 80, rows = 30, forceNew = false) {
    await this.initialize();

    // For PTY-based manager, pass spawn function. For tmux, it's not needed.
    if (this.sessionManager instanceof ShellSessionManager) {
      return this.sessionManager.startSession(worktreePath, cols, rows, pty.spawn, forceNew);
    } else {
      // TmuxSessionManager doesn't need spawn function
      return this.sessionManager!.startSession(worktreePath, cols, rows, undefined, forceNew);
    }
  }

  async writeToShell(sessionId: string, data: string) {
    await this.initialize();
    return this.sessionManager!.writeToSession(sessionId, data);
  }

  async resizeShell(sessionId: string, cols: number, rows: number) {
    await this.initialize();
    return this.sessionManager!.resizeSession(sessionId, cols, rows);
  }

  async getSession(sessionId: string) {
    await this.initialize();
    return this.sessionManager!.getSession(sessionId);
  }

  async getAllSessions() {
    await this.initialize();
    return this.sessionManager!.getAllSessions();
  }

  async terminateSession(sessionId: string) {
    await this.initialize();
    return this.sessionManager!.terminateSession(sessionId);
  }

  // Add listeners for WebSocket connections
  async addOutputListener(sessionId: string, connectionId: string, callback: (data: string) => void) {
    await this.initialize();
    return this.sessionManager!.addOutputListener(sessionId, connectionId, callback);
  }

  async removeOutputListener(sessionId: string, connectionId: string) {
    await this.initialize();
    return this.sessionManager!.removeOutputListener(sessionId, connectionId);
  }

  async addExitListener(sessionId: string, connectionId: string, callback: (code: number) => void) {
    await this.initialize();
    return this.sessionManager!.addExitListener(sessionId, connectionId, callback);
  }

  async removeExitListener(sessionId: string, connectionId: string) {
    await this.initialize();
    return this.sessionManager!.removeExitListener(sessionId, connectionId);
  }

  /**
   * Attach to an externally-linked tmux session by its known name and session ID.
   * Falls back to startShell for PTY-based managers.
   */
  async attachExternalSession(sessionId: string, tmuxName: string, worktreePath: string): Promise<ShellStartResult> {
    await this.initialize();
    if (this.sessionManager instanceof TmuxSessionManager) {
      return this.sessionManager.attachExternalSession(sessionId, tmuxName, worktreePath);
    }
    // PTY fallback: no concept of named external sessions, just start normally
    return this.startShell(worktreePath);
  }
}