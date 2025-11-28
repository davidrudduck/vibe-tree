import { ShellSessionManager } from './ShellSessionManager';
import { TmuxSessionManager } from './TmuxSessionManager';

/**
 * Session manager type - determines which backend to use
 */
export type SessionManagerType = 'tmux' | 'pty';

/**
 * Factory for creating the appropriate session manager
 * Automatically detects tmux availability and falls back to PTY if needed
 */
export class SessionManagerFactory {
  private static detectedType: SessionManagerType | null = null;
  private static tmuxManager: TmuxSessionManager | null = null;
  private static ptyManager: ShellSessionManager | null = null;

  /**
   * Detect which session manager type is available
   * Caches the result for subsequent calls
   */
  static async detectSessionManagerType(): Promise<SessionManagerType> {
    if (this.detectedType) {
      return this.detectedType;
    }

    const tmuxAvailable = await TmuxSessionManager.isTmuxAvailable();
    this.detectedType = tmuxAvailable ? 'tmux' : 'pty';

    console.log(`[SessionManagerFactory] Detected session manager: ${this.detectedType}`);
    return this.detectedType;
  }

  /**
   * Get the appropriate session manager instance
   * Uses tmux if available, falls back to PTY
   */
  static async getSessionManager(): Promise<ShellSessionManager | TmuxSessionManager> {
    const type = await this.detectSessionManagerType();

    if (type === 'tmux') {
      if (!this.tmuxManager) {
        this.tmuxManager = TmuxSessionManager.getInstance();
      }
      return this.tmuxManager;
    } else {
      if (!this.ptyManager) {
        this.ptyManager = ShellSessionManager.getInstance();
      }
      return this.ptyManager;
    }
  }

  /**
   * Force use of a specific session manager type
   * Useful for testing or when you want to override auto-detection
   */
  static forceSessionManagerType(type: SessionManagerType): void {
    console.log(`[SessionManagerFactory] Forcing session manager type: ${type}`);
    this.detectedType = type;

    // Clear cached instances to force recreation
    this.tmuxManager = null;
    this.ptyManager = null;
  }

  /**
   * Get current session manager type (without triggering detection)
   */
  static getCurrentType(): SessionManagerType | null {
    return this.detectedType;
  }

  /**
   * Reset factory state (mainly for testing)
   */
  static reset(): void {
    this.detectedType = null;
    this.tmuxManager = null;
    this.ptyManager = null;
  }
}
