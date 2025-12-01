import * as crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  ShellStartResult,
  ShellWriteResult,
  ShellResizeResult
} from '../types';
import { getDefaultShell } from '../utils/shell';

const execAsync = promisify(exec);

interface TmuxSession {
  id: string;
  tmuxSessionName: string;
  worktreePath: string;
  createdAt: Date;
  lastActivity: Date;
  listeners: Map<string, (data: string) => void>;
  exitListeners: Map<string, (code: number) => void>;
  outputFile: string;
  tailProcess: any; // Child process for tailing output
  outputBuffer: string[];
  maxBufferSize: number;
}

interface SpawnError {
  timestamp: Date;
  worktreePath: string;
  error: string;
  errorCode?: string;
}

/**
 * Tmux-based shell session manager
 * Uses tmux for persistent, shareable terminal sessions
 * Sessions survive server restarts and can be attached from multiple clients
 */
export class TmuxSessionManager {
  private static instance: TmuxSessionManager;
  private sessions: Map<string, TmuxSession> = new Map();
  private spawnErrors: SpawnError[] = [];
  private maxSpawnErrors = 10;
  private totalSessionsCreated = 0;
  private outputDir: string;

  private constructor() {
    // Create output directory for tmux session logs
    this.outputDir = path.join(os.tmpdir(), 'vibetree-tmux-output');
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Get singleton instance
   */
  static getInstance(): TmuxSessionManager {
    if (!TmuxSessionManager.instance) {
      TmuxSessionManager.instance = new TmuxSessionManager();
    }
    return TmuxSessionManager.instance;
  }

  /**
   * Check if tmux is available on the system
   */
  static async isTmuxAvailable(): Promise<boolean> {
    try {
      await execAsync('which tmux');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate deterministic session ID and tmux session name
   * Format: vt-{hash} where hash is first 8 chars of SHA256(worktreePath:terminalId)
   */
  private generateSessionId(worktreePath: string, terminalId?: string, forceNew: boolean = false): { sessionId: string; tmuxName: string } {
    if (forceNew) {
      const randomId = crypto.randomBytes(8).toString('hex');
      return {
        sessionId: randomId,
        tmuxName: `vt-${randomId.substring(0, 8)}`
      };
    }

    const key = terminalId ? `${worktreePath}:${terminalId}` : worktreePath;
    const hash = crypto.createHash('sha256')
      .update(key)
      .digest('hex')
      .substring(0, 16);

    const tmuxHash = hash.substring(0, 8);

    return {
      sessionId: hash,
      tmuxName: `vt-${tmuxHash}`
    };
  }

  /**
   * Check if a tmux session exists
   */
  private async tmuxSessionExists(tmuxName: string): Promise<boolean> {
    try {
      await execAsync(`tmux has-session -t ${tmuxName} 2>/dev/null`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Track a spawn error for diagnostics
   */
  private trackSpawnError(worktreePath: string, errorMessage: string, error: unknown): void {
    let errorCode: string | undefined;
    if (error instanceof Error) {
      const nodeError = error as NodeJS.ErrnoException;
      errorCode = nodeError.code;
    }

    this.spawnErrors.push({
      timestamp: new Date(),
      worktreePath,
      error: errorMessage,
      errorCode
    });

    if (this.spawnErrors.length > this.maxSpawnErrors) {
      this.spawnErrors.shift();
    }
  }

  /**
   * Get recent spawn errors
   */
  getSpawnErrors(): SpawnError[] {
    return [...this.spawnErrors];
  }

  /**
   * Get total number of sessions created during app lifetime
   */
  getTotalSessionsCreated(): number {
    return this.totalSessionsCreated;
  }

  /**
   * Start or get existing tmux shell session
   */
  async startSession(
    worktreePath: string,
    cols = 80,
    rows = 30,
    spawnFunction?: any,
    forceNew: boolean = false,
    terminalId?: string,
    setLocaleVariables: boolean = true
  ): Promise<ShellStartResult> {
    const { sessionId, tmuxName } = this.generateSessionId(worktreePath, terminalId, forceNew);

    // Check if we already have this session tracked
    if (!forceNew) {
      const existingSession = this.sessions.get(sessionId);
      if (existingSession) {
        existingSession.lastActivity = new Date();
        return {
          success: true,
          processId: sessionId,
          isNew: false
        };
      }

      // Check if tmux session exists (might have been created by previous server instance)
      const tmuxExists = await this.tmuxSessionExists(tmuxName);
      if (tmuxExists) {
        // Attach to existing tmux session
        await this.attachToExistingSession(sessionId, tmuxName, worktreePath);
        return {
          success: true,
          processId: sessionId,
          isNew: false
        };
      }
    }

    // Create new tmux session
    try {
      const shell = getDefaultShell();
      const outputFile = path.join(this.outputDir, `${tmuxName}.log`);

      // Clear old output file if it exists
      if (fs.existsSync(outputFile)) {
        fs.unlinkSync(outputFile);
      }

      // Create tmux session with proper environment
      const envVars = setLocaleVariables ?
        `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 ` : '';

      const createCmd = `${envVars}tmux new-session -d -s ${tmuxName} -c "${worktreePath}" -x ${cols} -y ${rows} ${shell}`;
      await execAsync(createCmd);

      // Set up pipe-pane to capture output
      await execAsync(`tmux pipe-pane -t ${tmuxName} -o 'cat >> ${outputFile}'`);

      this.totalSessionsCreated++;

      const session: TmuxSession = {
        id: sessionId,
        tmuxSessionName: tmuxName,
        worktreePath,
        createdAt: new Date(),
        lastActivity: new Date(),
        listeners: new Map(),
        exitListeners: new Map(),
        outputFile,
        tailProcess: null,
        outputBuffer: [],
        maxBufferSize: 100000
      };

      this.sessions.set(sessionId, session);

      console.log(`Created tmux session ${tmuxName} (ID: ${sessionId}) in ${worktreePath}`);

      return {
        success: true,
        processId: sessionId,
        isNew: true
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to start tmux session';
      console.error(`Failed to start tmux session: ${errorMessage}`);
      this.trackSpawnError(worktreePath, errorMessage, error);

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Attach to an existing tmux session that wasn't tracked in our sessions map
   */
  private async attachToExistingSession(sessionId: string, tmuxName: string, worktreePath: string): Promise<void> {
    const outputFile = path.join(this.outputDir, `${tmuxName}.log`);

    // Ensure pipe-pane is set up
    try {
      await execAsync(`tmux pipe-pane -t ${tmuxName} -o 'cat >> ${outputFile}'`);
    } catch (error) {
      // pipe-pane might already be set up, ignore error
    }

    const session: TmuxSession = {
      id: sessionId,
      tmuxSessionName: tmuxName,
      worktreePath,
      createdAt: new Date(),
      lastActivity: new Date(),
      listeners: new Map(),
      exitListeners: new Map(),
      outputFile,
      tailProcess: null,
      outputBuffer: [],
      maxBufferSize: 100000
    };

    // Read existing output from file
    if (fs.existsSync(outputFile)) {
      try {
        const existingOutput = fs.readFileSync(outputFile, 'utf-8');
        if (existingOutput) {
          session.outputBuffer.push(existingOutput);
        }
      } catch (error) {
        console.warn(`Failed to read existing output for ${tmuxName}:`, error);
      }
    }

    this.sessions.set(sessionId, session);
    console.log(`Attached to existing tmux session ${tmuxName} (ID: ${sessionId})`);
  }

  /**
   * Write data to tmux session
   */
  async writeToSession(sessionId: string, data: string): Promise<ShellWriteResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    try {
      // Escape single quotes in data for shell
      const escapedData = data.replace(/'/g, "'\\''");

      // Send keys to tmux session (without Enter, data might contain it)
      await execAsync(`tmux send-keys -t ${session.tmuxSessionName} -l '${escapedData}'`);

      session.lastActivity = new Date();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to write to tmux session'
      };
    }
  }

  /**
   * Resize tmux session
   */
  async resizeSession(sessionId: string, cols: number, rows: number): Promise<ShellResizeResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    try {
      await execAsync(`tmux resize-window -t ${session.tmuxSessionName} -x ${cols} -y ${rows}`);
      session.lastActivity = new Date();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to resize tmux session'
      };
    }
  }

  /**
   * Add output listener for session
   * Starts tailing the output file if this is the first listener
   */
  addOutputListener(sessionId: string, listenerId: string, callback: (data: string) => void, skipReplay: boolean = false): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    // Remove old listener if exists
    this.removeOutputListener(sessionId, listenerId);

    // Add new listener
    session.listeners.set(listenerId, callback);

    // Start tailing output file if this is the first listener
    if (session.listeners.size === 1 && !session.tailProcess) {
      this.startTailingOutput(session);
    }

    // Replay buffer for new listener (unless skipReplay is true)
    if (!skipReplay && session.outputBuffer.length > 0) {
      const replayData = session.outputBuffer.join('');
      if (replayData) {
        setTimeout(() => callback(replayData), 50);
      }
    }

    session.lastActivity = new Date();
    return true;
  }

  /**
   * Start tailing the output file for a session
   */
  private startTailingOutput(session: TmuxSession): void {
    const { spawn } = require('child_process');

    // Use tail -f to follow the output file
    // -n 0 means don't output existing lines (we already buffered them)
    const tail = spawn('tail', ['-f', '-n', '0', session.outputFile]);

    tail.stdout.on('data', (data: Buffer) => {
      const output = data.toString();

      // Add to buffer
      this.addToBuffer(session, output);

      // Send to all listeners
      session.listeners.forEach(listener => listener(output));
    });

    tail.on('error', (error: Error) => {
      console.error(`Error tailing output for ${session.tmuxSessionName}:`, error);
    });

    tail.on('exit', (code: number) => {
      console.log(`Tail process exited for ${session.tmuxSessionName} with code ${code}`);
      session.tailProcess = null;
    });

    session.tailProcess = tail;
  }

  /**
   * Add data to session buffer, maintaining size limit
   */
  private addToBuffer(session: TmuxSession, data: string): void {
    session.outputBuffer.push(data);

    let totalSize = session.outputBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
    while (totalSize > session.maxBufferSize && session.outputBuffer.length > 1) {
      const removed = session.outputBuffer.shift();
      if (removed) {
        totalSize -= removed.length;
      }
    }
  }

  /**
   * Remove output listener
   */
  removeOutputListener(sessionId: string, listenerId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const removed = session.listeners.delete(listenerId);

    // If this was the last listener, stop tailing
    if (removed && session.listeners.size === 0 && session.tailProcess) {
      session.tailProcess.kill();
      session.tailProcess = null;
    }

    return removed;
  }

  /**
   * Add exit listener for session
   * Note: tmux sessions don't exit in the traditional sense - they persist until explicitly killed
   * This is mainly for API compatibility
   */
  addExitListener(sessionId: string, listenerId: string, callback: (code: number) => void): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.exitListeners.set(listenerId, callback);
    return true;
  }

  /**
   * Remove exit listener
   */
  removeExitListener(sessionId: string, listenerId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    return session.exitListeners.delete(listenerId);
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): TmuxSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date();
    }
    return session;
  }

  /**
   * Get all sessions
   */
  getAllSessions(): TmuxSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Check if session exists
   */
  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Terminate tmux session
   */
  async terminateSession(sessionId: string): Promise<{ success: boolean; error?: string }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, error: `Session ${sessionId} not found` };
    }

    try {
      console.log(`Terminating tmux session ${session.tmuxSessionName} (ID: ${sessionId})`);

      // Stop tail process if running
      if (session.tailProcess) {
        session.tailProcess.kill();
        session.tailProcess = null;
      }

      // Clear listeners
      session.listeners.clear();

      // Notify exit listeners
      session.exitListeners.forEach(listener => listener(0));
      session.exitListeners.clear();

      // Kill tmux session
      try {
        await execAsync(`tmux kill-session -t ${session.tmuxSessionName}`);
      } catch (error) {
        // Session might not exist anymore, that's okay
        console.warn(`Tmux session ${session.tmuxSessionName} might not exist:`, error);
      }

      // Clean up output file
      try {
        if (fs.existsSync(session.outputFile)) {
          fs.unlinkSync(session.outputFile);
        }
      } catch (error) {
        console.warn(`Failed to delete output file ${session.outputFile}:`, error);
      }

      // Remove from sessions
      this.sessions.delete(sessionId);
      console.log(`Successfully terminated tmux session ${session.tmuxSessionName}`);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Error terminating tmux session ${sessionId}:`, errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Terminate all sessions for a worktree path
   */
  async terminateSessionsForWorktree(worktreePath: string): Promise<number> {
    let terminated = 0;
    const sessionsToTerminate: string[] = [];

    for (const [sessionId, session] of this.sessions) {
      if (session.worktreePath === worktreePath) {
        sessionsToTerminate.push(sessionId);
      }
    }

    const terminatePromises = sessionsToTerminate.map(async (sessionId) => {
      const result = await this.terminateSession(sessionId);
      return result.success ? 1 : 0;
    });

    const results = await Promise.all(terminatePromises);
    terminated = results.reduce((sum: number, count: number) => sum + count, 0);

    console.log(`Terminated ${terminated} tmux session(s) for worktree: ${worktreePath}`);
    return terminated;
  }

  /**
   * Cleanup all sessions (for app shutdown)
   * Note: tmux sessions will persist after cleanup - this is a feature!
   */
  async cleanup(): Promise<void> {
    const sessionIds = Array.from(this.sessions.keys());

    // Stop tail processes and clear listeners, but don't kill tmux sessions
    for (const sessionId of sessionIds) {
      const session = this.sessions.get(sessionId);
      if (session) {
        if (session.tailProcess) {
          session.tailProcess.kill();
          session.tailProcess = null;
        }
        session.listeners.clear();
        session.exitListeners.clear();
      }
    }

    console.log('TmuxSessionManager cleanup complete - tmux sessions remain active');
  }

  /**
   * Get total PTY instances created (for API compatibility)
   * With tmux, this returns total sessions created
   */
  getTotalPtyInstancesCreated(): number {
    return this.totalSessionsCreated;
  }
}
