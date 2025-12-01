import { ChildProcess, spawn } from 'child_process';
import * as path from 'path';
import * as net from 'net';

/**
 * Local server manager for desktop app
 * Starts a local instance of the VibeTree server for session management
 */
class LocalServerManager {
  private serverProcess: ChildProcess | null = null;
  private serverUrl: string | null = null;
  private isStarting = false;
  private startPromise: Promise<string> | null = null;

  /**
   * Check if a port is available
   */
  private isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.listen(port, () => {
        server.once('close', () => resolve(true));
        server.close();
      });
      server.on('error', () => resolve(false));
    });
  }

  /**
   * Find an available port starting from the given port
   */
  private async findAvailablePort(startPort = 13001, maxAttempts = 10): Promise<number | null> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const port = startPort + attempt;
      if (await this.isPortAvailable(port)) {
        return port;
      }
    }
    return null;
  }

  /**
   * Start the local server
   */
  async start(): Promise<string> {
    // If already starting, wait for that promise
    if (this.isStarting && this.startPromise) {
      return this.startPromise;
    }

    // If already started, return the URL
    if (this.serverProcess && this.serverUrl) {
      return this.serverUrl;
    }

    this.isStarting = true;
    this.startPromise = this._doStart();

    try {
      const url = await this.startPromise;
      return url;
    } finally {
      this.isStarting = false;
      this.startPromise = null;
    }
  }

  private async _doStart(): Promise<string> {
    // Find available port
    const port = await this.findAvailablePort();
    if (!port) {
      throw new Error('Failed to find available port for local server');
    }

    this.serverUrl = `http://localhost:${port}`;

    // Determine server entry point based on environment
    const isDev = !require('electron').app.isPackaged;
    let serverPath: string;

    if (isDev) {
      // In development, use the built server from apps/server/dist
      serverPath = path.join(__dirname, '../../../server/dist/index.js');
    } else {
      // In production, server is bundled with the app
      serverPath = path.join(process.resourcesPath, 'server', 'index.js');
    }

    console.log(`[LocalServer] Starting server on port ${port}`);
    console.log(`[LocalServer] Server path: ${serverPath}`);

    // Spawn server process
    this.serverProcess = spawn(
      process.execPath,
      [serverPath],
      {
        env: {
          ...process.env,
          PORT: port.toString(),
          HOST: '127.0.0.1',
          AUTH_REQUIRED: 'false', // No auth for local desktop server
          NODE_ENV: isDev ? 'development' : 'production'
        },
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );

    // Handle server output
    this.serverProcess.stdout?.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        console.log(`[LocalServer] ${output}`);
      }
    });

    this.serverProcess.stderr?.on('data', (data) => {
      const output = data.toString().trim();
      if (output && !output.includes('Configured PORT')) {
        console.error(`[LocalServer] ${output}`);
      }
    });

    this.serverProcess.on('error', (error) => {
      console.error('[LocalServer] Failed to start:', error);
    });

    this.serverProcess.on('exit', (code, signal) => {
      console.log(`[LocalServer] Exited with code ${code}, signal ${signal}`);
      this.serverProcess = null;
      this.serverUrl = null;
    });

    // Wait for server to be ready
    await this.waitForServer(port);

    console.log(`[LocalServer] Ready at ${this.serverUrl}`);
    return this.serverUrl;
  }

  /**
   * Wait for server to start accepting connections
   */
  private async waitForServer(port: number, maxAttempts = 30): Promise<void> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        await new Promise<void>((resolve, reject) => {
          const client = net.connect({ port, host: '127.0.0.1' }, () => {
            client.end();
            resolve();
          });
          client.on('error', reject);
        });
        return; // Server is ready
      } catch (error) {
        // Not ready yet, wait and try again
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    throw new Error('Server did not start within expected time');
  }

  /**
   * Get the server URL (null if not started)
   */
  getUrl(): string | null {
    return this.serverUrl;
  }

  /**
   * Get the WebSocket URL
   */
  getWebSocketUrl(): string | null {
    if (!this.serverUrl) return null;
    return this.serverUrl.replace('http://', 'ws://');
  }

  /**
   * Stop the local server
   */
  async stop(): Promise<void> {
    if (!this.serverProcess) {
      return;
    }

    console.log('[LocalServer] Stopping...');

    return new Promise<void>((resolve) => {
      if (!this.serverProcess) {
        resolve();
        return;
      }

      this.serverProcess.once('exit', () => {
        console.log('[LocalServer] Stopped');
        resolve();
      });

      // Try graceful shutdown first
      this.serverProcess.kill('SIGTERM');

      // Force kill after 5 seconds
      setTimeout(() => {
        if (this.serverProcess && !this.serverProcess.killed) {
          console.log('[LocalServer] Force killing...');
          this.serverProcess.kill('SIGKILL');
        }
      }, 5000);
    });
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.serverProcess !== null && !this.serverProcess.killed;
  }
}

export const localServerManager = new LocalServerManager();
