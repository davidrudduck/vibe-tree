import { BaseAdapter } from '@vibetree/core';
import type {
  Worktree,
  GitStatus,
  ShellStartResult,
  ShellWriteResult,
  ShellResizeResult,
  WorktreeAddResult,
  WorktreeRemoveResult,
  IDE
} from '@vibetree/core';

export interface WebSocketError extends Error {
  code: 'TIMEOUT' | 'CONNECTION_LOST' | 'SERVER_ERROR' | 'PARSE_ERROR';
  retryable: boolean;
  originalError?: Error;
}

export class WebSocketAdapter extends BaseAdapter {
  private ws: WebSocket | null = null;
  private messageHandlers: Map<string, (data: any) => void> = new Map();
  private eventHandlers: Map<string, Set<(data: any) => void>> = new Map();
  private messageId = 0;
  private connectionPromise: Promise<void> | null = null;
  private onDisconnect?: () => void;

  constructor(private wsUrl: string, private jwt?: string, onDisconnect?: () => void) {
    super();
    this.onDisconnect = onDisconnect;
  }

  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    
    if (this.connectionPromise) return this.connectionPromise;

    this.connectionPromise = new Promise((resolve, reject) => {
      const url = this.jwt ? `${this.wsUrl}?jwt=${this.jwt}` : this.wsUrl;
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('✅ WebSocket connected successfully to:', url);
        resolve();
      };

      this.ws.onerror = (error) => {
        console.error('💔 WebSocket error occurred:', error);
        console.error('💔 WebSocket URL was:', url);
        console.error('💔 WebSocket readyState:', this.ws?.readyState);
        reject(new Error(`WebSocket connection failed: ${error}`));
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          // Handle response messages
          if (message.id && this.messageHandlers.has(message.id)) {
            const handler = this.messageHandlers.get(message.id)!;
            this.messageHandlers.delete(message.id);
            handler(message.payload);
          }
          
          // Handle event messages
          if (message.type && this.eventHandlers.has(message.type)) {
            const handlers = this.eventHandlers.get(message.type)!;
            handlers.forEach(handler => {
              handler(message.payload);
            });
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      this.ws.onclose = () => {
        console.log('💔 WebSocket disconnected');
        this.connectionPromise = null;
        
        // Notify about disconnect (will add callback for this)
        this.onDisconnect?.();
      };
    });

    return this.connectionPromise;
  }

  private createWSError(
    code: WebSocketError['code'],
    message: string,
    retryable = false,
    originalError?: Error
  ): WebSocketError {
    const error = new Error(message) as WebSocketError;
    error.code = code;
    error.retryable = retryable;
    error.originalError = originalError;
    return error;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async sendMessage<T>(
    type: string,
    payload: any,
    options?: { timeout?: number; retries?: number }
  ): Promise<T> {
    const timeout = options?.timeout ?? 30000;
    const maxRetries = options?.retries ?? 2;

    let lastError: WebSocketError | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this._sendMessageOnce<T>(type, payload, timeout);
      } catch (error) {
        lastError = error as WebSocketError;

        if (!lastError.retryable || attempt === maxRetries) {
          throw lastError;
        }

        console.warn(
          `[WebSocket] Retrying ${type} (attempt ${attempt + 1}/${maxRetries + 1})`,
          lastError.message
        );
        await this.delay(1000 * (attempt + 1)); // Exponential backoff
      }
    }

    throw lastError!;
  }

  private async _sendMessageOnce<T>(type: string, payload: any, timeout: number): Promise<T> {
    await this.connect();

    return new Promise((resolve, reject) => {
      // Check connection state before sending
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(this.createWSError('CONNECTION_LOST', 'WebSocket not connected', true));
        return;
      }

      const id = (++this.messageId).toString();
      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        this.messageHandlers.delete(id);
      };

      this.messageHandlers.set(id, (data) => {
        cleanup();
        if (data.error) {
          reject(this.createWSError('SERVER_ERROR', data.error, false));
        } else {
          resolve(data);
        }
      });

      try {
        const message = { type, payload, id };
        this.ws.send(JSON.stringify(message));
      } catch (error) {
        cleanup();
        reject(this.createWSError('CONNECTION_LOST', 'Failed to send message', true, error as Error));
        return;
      }

      timeoutHandle = setTimeout(() => {
        cleanup();
        reject(this.createWSError('TIMEOUT', `Request ${type} timed out after ${timeout}ms`, true));
      }, timeout);
    });
  }

  private addEventListener(event: string, handler: (data: any) => void): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    
    this.eventHandlers.get(event)!.add(handler);
    
    // Return unsubscribe function
    return () => {
      const handlers = this.eventHandlers.get(event);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.eventHandlers.delete(event);
        }
      }
    };
  }

  async listSessions(): Promise<any[]> {
    return this.sendMessage('shell:list-sessions', {}).then((response: any) => response.sessions || []);
  }

  async disconnectSession(sessionId: string): Promise<void> {
    await this.sendMessage('shell:disconnect', { sessionId });
  }

  async terminateSession(sessionId: string): Promise<void> {
    await this.sendMessage('shell:terminate', { sessionId });
  }

  async startShell(worktreePath: string, cols?: number, rows?: number, forceNew?: boolean): Promise<ShellStartResult> {
    return this.sendMessage('shell:start', { worktreePath, cols, rows, forceNew });
  }

  async writeToShell(processId: string, data: string): Promise<ShellWriteResult> {
    return this.sendMessage('shell:write', { sessionId: processId, data });
  }

  async resizeShell(processId: string, cols: number, rows: number): Promise<ShellResizeResult> {
    return this.sendMessage('shell:resize', { sessionId: processId, cols, rows });
  }

  async getShellStatus(_processId: string): Promise<{ running: boolean }> {
    // WebSocket doesn't have a direct status check, assume running if we have a session
    return { running: true };
  }

  onShellOutput(processId: string, callback: (data: string) => void): () => void {
    return this.addEventListener('shell:output', (payload) => {
      if (payload.sessionId === processId) {
        callback(payload.data);
      }
    });
  }

  onShellExit(processId: string, callback: (code: number) => void): () => void {
    return this.addEventListener('shell:exit', (payload) => {
      if (payload.sessionId === processId) {
        callback(payload.code);
      }
    });
  }

  async listWorktrees(projectPath: string): Promise<Worktree[]> {
    return this.sendMessage('git:worktree:list', { projectPath });
  }

  async getGitStatus(worktreePath: string): Promise<GitStatus[]> {
    return this.sendMessage('git:status', { worktreePath });
  }

  async getGitDiff(worktreePath: string, filePath?: string): Promise<string> {
    const result = await this.sendMessage<{ diff: string }>('git:diff', { worktreePath, filePath });
    return result.diff;
  }

  async getGitDiffStaged(worktreePath: string, filePath?: string): Promise<string> {
    const result = await this.sendMessage<{ diff: string }>('git:diff:staged', { worktreePath, filePath });
    return result.diff;
  }

  async getAheadBehind(worktreePath: string, baseBranch?: string): Promise<{ ahead: number; behind: number }> {
    return this.sendMessage('git:ahead-behind', { worktreePath, baseBranch });
  }

  async getMainBranchName(projectPath: string): Promise<string> {
    const result = await this.sendMessage<{ branch: string }>('git:main-branch-name', { projectPath });
    return result.branch;
  }

  async getDiffVsMain(worktreePath: string, baseBranch?: string): Promise<string> {
    const result = await this.sendMessage<{ diff: string }>('git:diff-vs-main', { worktreePath, baseBranch });
    return result.diff;
  }

  async getBranches(projectPath: string): Promise<{ name: string; current: boolean; remote: boolean }[]> {
    const result = await this.sendMessage<{ branches: { name: string; current: boolean; remote: boolean }[] }>('git:branches', { projectPath });
    return result.branches;
  }

  async addWorktree(projectPath: string, branchName: string, startPoint?: string): Promise<WorktreeAddResult> {
    return this.sendMessage('git:worktree:add', { projectPath, branchName, startPoint });
  }

  async removeWorktree(projectPath: string, worktreePath: string, branchName: string): Promise<WorktreeRemoveResult> {
    return this.sendMessage('git:worktree:remove', { projectPath, worktreePath, branchName });
  }

  async detectIDEs(): Promise<IDE[]> {
    // Call server REST API to detect IDEs on server machine
    try {
      const response = await fetch(`${this.wsUrl.replace('ws://', 'http://').replace('wss://', 'https://')}/api/ide/list`, {
        headers: this.jwt ? { 'Authorization': `Bearer ${this.jwt}` } : {}
      });
      if (!response.ok) {
        console.warn('Failed to detect IDEs:', response.statusText);
        return [];
      }
      return await response.json();
    } catch (error) {
      console.warn('Failed to detect IDEs:', error);
      return [];
    }
  }

  async openInIDE(ideName: string, projectPath: string): Promise<{ success: boolean; error?: string }> {
    // Call server REST API to open IDE on server machine
    try {
      const response = await fetch(`${this.wsUrl.replace('ws://', 'http://').replace('wss://', 'https://')}/api/ide/open`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.jwt ? { 'Authorization': `Bearer ${this.jwt}` } : {})
        },
        body: JSON.stringify({ ideName, path: projectPath })
      });
      return await response.json();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to open IDE'
      };
    }
  }

  // Recent Projects methods

  async getRecentProjects(limit?: number): Promise<any[]> {
    try {
      const url = new URL(`${this.wsUrl.replace('ws://', 'http://').replace('wss://', 'https://')}/api/projects/recent`);
      if (limit) url.searchParams.set('limit', limit.toString());

      const response = await fetch(url.toString(), {
        headers: this.jwt ? { 'Authorization': `Bearer ${this.jwt}` } : {}
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Failed to get recent projects:', error);
      return [];
    }
  }

  async addRecentProject(path: string): Promise<void> {
    try {
      const response = await fetch(`${this.wsUrl.replace('ws://', 'http://').replace('wss://', 'https://')}/api/projects/recent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.jwt ? { 'Authorization': `Bearer ${this.jwt}` } : {})
        },
        body: JSON.stringify({ path })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      console.error('Failed to add recent project:', error);
      throw error;
    }
  }

  async removeRecentProject(path: string): Promise<void> {
    try {
      const response = await fetch(
        `${this.wsUrl.replace('ws://', 'http://').replace('wss://', 'https://')}/api/projects/recent/${encodeURIComponent(path)}`,
        {
          method: 'DELETE',
          headers: this.jwt ? { 'Authorization': `Bearer ${this.jwt}` } : {}
        }
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      console.error('Failed to remove recent project:', error);
      throw error;
    }
  }

  // Terminal Settings methods

  async getTerminalSettings(): Promise<any> {
    try {
      const response = await fetch(`${this.wsUrl.replace('ws://', 'http://').replace('wss://', 'https://')}/api/settings/terminal`, {
        headers: this.jwt ? { 'Authorization': `Bearer ${this.jwt}` } : {}
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Failed to get terminal settings:', error);
      throw error;
    }
  }

  async updateTerminalSettings(settings: any): Promise<any> {
    try {
      const response = await fetch(`${this.wsUrl.replace('ws://', 'http://').replace('wss://', 'https://')}/api/settings/terminal`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(this.jwt ? { 'Authorization': `Bearer ${this.jwt}` } : {})
        },
        body: JSON.stringify(settings)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Failed to update terminal settings:', error);
      throw error;
    }
  }

  // Worktree Base Path methods

  async getWorktreeBasePath(): Promise<string | null> {
    try {
      const response = await fetch(`${this.wsUrl.replace('ws://', 'http://').replace('wss://', 'https://')}/api/settings/worktree-base-path`, {
        headers: this.jwt ? { 'Authorization': `Bearer ${this.jwt}` } : {}
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return data.path;
    } catch (error) {
      console.error('Failed to get worktree base path:', error);
      throw error;
    }
  }

  async setWorktreeBasePath(path: string): Promise<void> {
    try {
      const response = await fetch(`${this.wsUrl.replace('ws://', 'http://').replace('wss://', 'https://')}/api/settings/worktree-base-path`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(this.jwt ? { 'Authorization': `Bearer ${this.jwt}` } : {})
        },
        body: JSON.stringify({ path })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      console.error('Failed to set worktree base path:', error);
      throw error;
    }
  }

  // Scheduler History methods

  async getSchedulerHistory(limit?: number): Promise<any[]> {
    try {
      const url = new URL(`${this.wsUrl.replace('ws://', 'http://').replace('wss://', 'https://')}/api/scheduler/history`);
      if (limit) url.searchParams.set('limit', limit.toString());

      const response = await fetch(url.toString(), {
        headers: this.jwt ? { 'Authorization': `Bearer ${this.jwt}` } : {}
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Failed to get scheduler history:', error);
      return [];
    }
  }

  async addSchedulerHistory(entry: { projectId?: string; command: string; delayMs: number; repeat: boolean }): Promise<void> {
    try {
      const response = await fetch(`${this.wsUrl.replace('ws://', 'http://').replace('wss://', 'https://')}/api/scheduler/history`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.jwt ? { 'Authorization': `Bearer ${this.jwt}` } : {})
        },
        body: JSON.stringify(entry)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      console.error('Failed to add scheduler history:', error);
      throw error;
    }
  }

  async getPullRequests(projectPath: string): Promise<any[]> {
    try {
      const url = `${this.wsUrl.replace('ws://', 'http://').replace('wss://', 'https://')}/api/projects/${encodeURIComponent(projectPath)}/pulls`;
      const response = await fetch(url, {
        headers: this.jwt ? { 'Authorization': `Bearer ${this.jwt}` } : {}
      });
      if (!response.ok) return [];
      return response.json();
    } catch { return []; }
  }

  async getGitHubStatus(): Promise<{ configured: boolean; rateLimit?: { remaining: number; reset: number } }> {
    try {
      const url = `${this.wsUrl.replace('ws://', 'http://').replace('wss://', 'https://')}/api/github/status`;
      const response = await fetch(url, {
        headers: this.jwt ? { 'Authorization': `Bearer ${this.jwt}` } : {}
      });
      if (!response.ok) return { configured: false };
      return response.json();
    } catch { return { configured: false }; }
  }

  async selectDirectory(): Promise<string | undefined> {
    // Web client can't access local file system
    // Would need to implement a server-side directory browser
    throw new Error('Directory selection not available in web client');
  }

  async getTheme(): Promise<'light' | 'dark'> {
    // Use browser's color scheme preference
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  onThemeChange(callback: (theme: 'light' | 'dark') => void): () => void {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      callback(e.matches ? 'dark' : 'light');
    };
    
    mediaQuery.addEventListener('change', handler);
    
    return () => {
      mediaQuery.removeEventListener('change', handler);
    };
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.messageHandlers.clear();
    this.eventHandlers.clear();
    this.connectionPromise = null;
  }
}