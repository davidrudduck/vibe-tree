import { ipcMain, BrowserWindow } from 'electron';
import { SessionManagerFactory, ShellSessionManager, TmuxSessionManager, getSystemDiagnostics, getExtendedDiagnostics, formatExtendedDiagnostics } from '@vibetree/core';
import { terminalSettingsManager } from './terminal-settings';
import * as pty from 'node-pty';
import { notificationManager } from './notification-manager';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Desktop shell manager - uses SessionManagerFactory for tmux/PTY sessions
 * Supports sharing sessions with web clients via tmux
 */
class DesktopShellManager {
  private sessionManager: ShellSessionManager | TmuxSessionManager | null = null;
  private _initialized = false;

  constructor() {
    // Defer initialization until app is ready
  }

  /**
   * Initialize the shell manager (must be called when app is ready)
   * Registers IPC handlers and initializes the session manager
   */
  public async initialize() {
    if (this._initialized) {
      return; // Already initialized
    }
    this._initialized = true;

    // Initialize session manager (detects tmux availability)
    this.sessionManager = await SessionManagerFactory.getSessionManager();
    const type = SessionManagerFactory.getCurrentType();
    console.log(`[DesktopShellManager] Using ${type} session manager`);

    this.setupIpcHandlers();
  }

  /**
   * Broadcast terminal session changes to all renderer processes
   */
  private broadcastSessionChange() {
    const sessions = this.sessionManager!.getAllSessions();
    const worktreeSessionCounts = new Map<string, number>();

    sessions.forEach(session => {
      const count = worktreeSessionCounts.get(session.worktreePath) || 0;
      worktreeSessionCounts.set(session.worktreePath, count + 1);
    });

    const sessionData = Object.fromEntries(worktreeSessionCounts);

    // Send to all windows
    BrowserWindow.getAllWindows().forEach(window => {
      if (!window.isDestroyed()) {
        window.webContents.send('shell:sessions-changed', sessionData);
      }
    });
  }

  /**
   * Safely send IPC message to renderer, handling disposed frames
   */
  private safeSend(sender: Electron.WebContents, channel: string, ...args: unknown[]): boolean {
    try {
      // Double-check: first with isDestroyed, then catch any remaining errors
      if (!sender || sender.isDestroyed()) {
        return false;
      }
      
      // Additional check for WebFrameMain disposal
      // The frame might be disposed even if sender isn't destroyed
      sender.send(channel, ...args);
      return true;
    } catch (error) {
      // Silently handle disposal errors - this is expected behavior
      // when frames are closed/navigated during async operations
      return false;
    }
  }

  private setupIpcHandlers() {
    ipcMain.handle('shell:start', async (event, worktreePath: string, cols?: number, rows?: number, forceNew?: boolean, terminalId?: string) => {
      // Get current terminal settings
      const settings = terminalSettingsManager.getSettings();

      // Determine spawn function based on session manager type
      const spawnFn = this.sessionManager instanceof ShellSessionManager ? pty.spawn : undefined;

      // Start session - reuses existing session if terminalId matches
      const result = await this.sessionManager!.startSession(
        worktreePath,
        cols ?? 80,
        rows ?? 30,
        spawnFn,
        forceNew ?? false,
        terminalId,
        settings.setLocaleVariables
      );

      if (result.success && result.processId) {
        const processId = result.processId;

        // Extract branch name from worktree path for notifications
        const branchName = path.basename(worktreePath);

        // Register session with notification manager (idempotent)
        notificationManager.registerSession(processId, worktreePath, branchName);

        // Only add listeners for new sessions
        if (result.isNew) {
          // Generate unique listener ID for this connection
          const listenerId = `renderer-${Date.now()}-${Math.random()}`;

          // Add output listener - also passes output to notification manager
          this.sessionManager!.addOutputListener(processId, listenerId, (data: string) => {
            // Pass to notification manager for state detection (main process handles all logic)
            notificationManager.processOutput(processId, data);

            if (!this.safeSend(event.sender, `shell:output:${processId}`, data)) {
              // Frame was disposed - remove this listener
              this.sessionManager!.removeOutputListener(processId, listenerId);
            }
          });

          // Add exit listener
          this.sessionManager!.addExitListener(processId, listenerId, (exitCode: number) => {
            // Unregister from notification manager
            notificationManager.unregisterSession(processId);

            this.safeSend(event.sender, `shell:exit:${processId}`, exitCode);
            // Broadcast session change when terminal exits
            this.broadcastSessionChange();
          });

          // Broadcast session change for new terminal
          this.broadcastSessionChange();
        } else {
          console.log(`[DesktopShellManager] Reconnected to existing session ${processId}`);
        }
      }

      return result;
    });

    ipcMain.handle('shell:write', async (_, processId: string, data: string) => {
      return this.sessionManager!.writeToSession(processId, data);
    });

    ipcMain.handle('shell:resize', async (_, processId: string, cols: number, rows: number) => {
      return this.sessionManager!.resizeSession(processId, cols, rows);
    });

    ipcMain.handle('shell:status', async (_, processId: string) => {
      return { running: this.sessionManager!.hasSession(processId) };
    });

    ipcMain.handle('shell:get-foreground-process', async (_, processId: string) => {
      if (this.sessionManager && 'getForegroundProcess' in this.sessionManager) {
        return (this.sessionManager as any).getForegroundProcess(processId);
      }
      return null;
    });

    ipcMain.handle('shell:get-buffer', async () => {
      // Buffer management handled on renderer side
      return { success: true, buffer: null };
    });

    ipcMain.handle('shell:terminate', async (_, processId: string) => {
      const result = await this.sessionManager!.terminateSession(processId);
      this.broadcastSessionChange();
      return result;
    });

    ipcMain.handle('shell:terminate-for-worktree', async (_, worktreePath: string) => {
      const count = await this.sessionManager!.terminateSessionsForWorktree(worktreePath);
      this.broadcastSessionChange();
      return { success: true, count };
    });

    ipcMain.handle('shell:get-stats', async () => {
      const sessions = this.sessionManager!.getAllSessions();

      // Get session stats for diagnostics
      const sessionManagerStats = {
        totalPtyInstancesCreated: this.sessionManager!.getTotalPtyInstancesCreated?.() || 0,
        currentActiveSessions: sessions.length
      };

      // Get extended diagnostics with app-specific metrics
      const extendedDiagnostics = await getExtendedDiagnostics(sessionManagerStats);

      return {
        activeProcessCount: sessions.length,
        sessions: sessions.map(s => ({
          id: s.id,
          worktreePath: s.worktreePath,
          createdAt: s.createdAt.toISOString(),
          lastActivity: s.lastActivity.toISOString()
        })),
        spawnErrors: this.sessionManager!.getSpawnErrors?.() || [],
        systemDiagnostics: extendedDiagnostics,
        extendedDiagnostics
      };
    });

    ipcMain.handle('shell:get-worktree-sessions', async () => {
      const sessions = this.sessionManager!.getAllSessions();
      const worktreeSessionCounts = new Map<string, number>();

      sessions.forEach(session => {
        const count = worktreeSessionCounts.get(session.worktreePath) || 0;
        worktreeSessionCounts.set(session.worktreePath, count + 1);
      });

      return Object.fromEntries(worktreeSessionCounts);
    });

    ipcMain.handle('shell:diagnose', async () => {
      try {
        console.log('Running comprehensive diagnostics...');

        // Get session stats
        const sessions = this.sessionManager!.getAllSessions();

        const sessionManagerStats = {
          totalPtyInstancesCreated: this.sessionManager!.getTotalPtyInstancesCreated?.() || 0,
          currentActiveSessions: sessions.length
        };

        // Collect extended diagnostics
        const diagnostics = await getExtendedDiagnostics(sessionManagerStats);

        // Format for text output
        const formattedText = formatExtendedDiagnostics(diagnostics);

        // Create diagnostics directory in user's home
        const diagDir = path.join(os.homedir(), '.vibetree', 'diagnostics');
        if (!fs.existsSync(diagDir)) {
          fs.mkdirSync(diagDir, { recursive: true });
        }

        // Create timestamped filename
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const textFilePath = path.join(diagDir, `posix-spawn-diagnostics-${timestamp}.txt`);
        const jsonFilePath = path.join(diagDir, `posix-spawn-diagnostics-${timestamp}.json`);

        // Write text report
        fs.writeFileSync(textFilePath, formattedText, 'utf8');
        console.log(`Text diagnostics saved to: ${textFilePath}`);

        // Write JSON for programmatic analysis
        fs.writeFileSync(jsonFilePath, JSON.stringify(diagnostics, null, 2), 'utf8');
        console.log(`JSON diagnostics saved to: ${jsonFilePath}`);

        return {
          success: true,
          textFilePath,
          jsonFilePath,
          summary: {
            timestamp: diagnostics.timestamp,
            openFds: diagnostics.openFileDescriptors,
            fdLimit: diagnostics.fileDescriptorLimit.soft,
            fdUsagePercent: diagnostics.openFileDescriptors && diagnostics.fileDescriptorLimit.soft
              ? ((diagnostics.openFileDescriptors / diagnostics.fileDescriptorLimit.soft) * 100).toFixed(1)
              : null,
            appPtyInfo: diagnostics.appPtyInfo,
            ptyProcessCount: diagnostics.ptyProcesses.count,
            ptyDeviceInfo: diagnostics.ptyDeviceInfo,
            childProcessCount: diagnostics.childProcesses.length,
            zombieCount: diagnostics.zombieProcessCount,
            warningCount: diagnostics.warnings.length,
            threadCount: diagnostics.threadInfo.threadCount,
            systemLoad: diagnostics.systemLoad
          }
        };
      } catch (error) {
        console.error('Failed to run diagnostics:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    });
  }

  // Get process statistics
  public async getStats() {
    const sessions = this.sessionManager!.getAllSessions();
    const systemDiagnostics = await getSystemDiagnostics();

    return {
      activeProcessCount: sessions.length,
      sessions: sessions.map(s => ({
        id: s.id,
        worktreePath: s.worktreePath,
        createdAt: s.createdAt.toISOString(),
        lastActivity: s.lastActivity.toISOString()
      })),
      spawnErrors: this.sessionManager!.getSpawnErrors?.() || [],
      systemDiagnostics
    };
  }

  // Clean up on app quit
  public async cleanup() {
    if (this._initialized && this.sessionManager) {
      await this.sessionManager.cleanup();
    }
  }
}

export const shellProcessManager = new DesktopShellManager();