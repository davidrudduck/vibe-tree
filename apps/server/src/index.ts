import express from 'express';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import http from 'http';
import net from 'net';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import qrcode from 'qrcode';
import { setupWebSocketHandlers } from './api/websocket';
import { setupRestRoutes } from './api/rest';
import { ShellManager } from './services/ShellManager';
import { AuthService } from './auth/AuthService';
import { databaseService } from './services/DatabaseService';
import { getNetworkUrls } from '@vibetree/core';

dotenv.config();

// Function to check if port is available
function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.once('close', () => resolve(true));
      server.close();
    });
    server.on('error', () => resolve(false));
  });
}

// Function to find an available port with extended retry logic and better error messages
async function findAvailablePort(startPort = 3002, maxAttempts = 10): Promise<number | null> {
  // If PORT is explicitly set, try it first
  if (process.env.PORT) {
    const envPort = parseInt(process.env.PORT, 10);
    if (await isPortAvailable(envPort)) {
      return envPort;
    }
    console.warn(`Configured PORT ${envPort} is not available, searching for alternatives...`);
  }

  const triedPorts: number[] = [];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const port = startPort + attempt;
    triedPorts.push(port);

    if (await isPortAvailable(port)) {
      if (attempt > 0) {
        console.log(`Port ${startPort} was not available, using port ${port} instead`);
      }
      return port;
    }
  }

  // Return null to indicate failure
  return null;
}

async function startServer() {
  const app = express();
  const PORT = await findAvailablePort();

  if (PORT === null) {
    console.error(`
========================================
 SERVER STARTUP FAILED: No available ports
========================================
Tried ports: 3002-3011

Possible solutions:
1. Kill processes using these ports: lsof -i :3002
2. Set a different port: PORT=4000 pnpm dev:server
3. Check for zombie processes: ps aux | grep node
========================================
`);
    process.exit(1);
  }

  const HOST = process.env.HOST || '0.0.0.0';
  const PROJECT_PATH = process.env.PROJECT_PATH || process.cwd();

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Create HTTP server
  const server = http.createServer(app);

  // Create WebSocket server
  const wss = new WebSocketServer({ server });

  // Initialize services
  const shellManager = new ShellManager();
  const authService = new AuthService();

  // Initialize database
  databaseService.initialize();
  const pruned = databaseService.projects.pruneStale();
  if (pruned > 0) {
    console.log(`[Database] Pruned ${pruned} stale project(s)`);
  }

  // Reconcile terminal sessions with running tmux sessions
  try {
    const { execSync } = require('child_process');
    // Mark all sessions as dead first, then revive ones that are still running
    (databaseService as any).terminalSessions?.markAllDead();

    // Get running tmux sessions and mark matching DB records as disconnected
    try {
      const tmuxOutput = execSync('tmux list-sessions -F "#{session_name}"', { encoding: 'utf8' });
      const runningNames = tmuxOutput.trim().split('\n').filter((n: string) => n.startsWith('vt-'));

      for (const name of runningNames) {
        const session = (databaseService as any).terminalSessions?.findByTmuxName(name);
        if (session) {
          (databaseService as any).terminalSessions?.updateStatus(session.id, 'disconnected');
        }
      }
    } catch {
      // tmux not running or no sessions — all remain marked as dead
    }

    const deadCount = (databaseService as any).terminalSessions?.pruneDead() ?? 0;
    const activeCount = (databaseService as any).terminalSessions?.findAll()?.length ?? 0;
    if (activeCount > 0) {
      console.log(`[Sessions] Found ${activeCount} persistent tmux session(s)`);
    }
    if (deadCount > 0) {
      console.log(`[Sessions] Cleaned up ${deadCount} dead session record(s)`);
    }
  } catch (error) {
    console.warn('[Sessions] Failed to reconcile sessions:', error);
  }

  // Setup REST routes
  setupRestRoutes(app, { shellManager, authService });

  // Setup WebSocket handlers
  setupWebSocketHandlers(wss, { shellManager, authService });

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: '0.0.1', vibetree: true });
  });

  // Root endpoint - provide server info
  app.get('/', (req, res) => {
    res.json({
      name: 'VibeTree Socket Server',
      version: '0.0.1',
      endpoints: {
        websocket: `ws://${req.headers.host}`,
        health: '/health',
        config: '/api/config',
        api: '/api/*'
      },
      webApp: {
        url: 'http://localhost:3000',
        note: 'Run "pnpm dev:web" to start the web interface'
      }
    });
  });

  // Start server
  server.listen(parseInt(PORT.toString()), HOST, async () => {
    // Write server port to file so the frontend can discover it without scanning
    try {
      const serverPortFile = path.join(__dirname, '../../../apps/web/.server-port');
      fs.writeFileSync(serverPortFile, PORT.toString());
    } catch (error) {
      console.warn('Could not write .server-port file:', error);
    }

    const socketUrls = getNetworkUrls(PORT, HOST);

    // Try to read web port from file, fallback to 3000
    let webPort = 3000;
    try {
      const webPortFile = path.join(__dirname, '../../../apps/web/.web-port');
      if (fs.existsSync(webPortFile)) {
        webPort = parseInt(fs.readFileSync(webPortFile, 'utf8').trim());
      }
    } catch (error) {
      console.warn('Could not read web port file, using default port 3000');
    }
    
    const webUrls = getNetworkUrls(webPort, HOST);
    
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║               VibeTree Services Started                   ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');
    
    console.log('📁 Project Path:', PROJECT_PATH);
    console.log();
    
    // Display authentication status
    const authConfig = authService.getAuthConfig();
    console.log('🔐 Authentication:');
    console.log(`   Required:   ${authConfig.authRequired ? 'Yes' : 'No'}`);
    console.log(`   Configured: ${authConfig.authConfigured ? 'Yes' : 'No'}`);
    if (authConfig.authRequired && !authConfig.authConfigured) {
      console.log('   ⚠️  Warning: AUTH_REQUIRED=true but USERNAME/PASSWORD not set');
    }
    console.log();
    
    console.log('🌐 Web Application (UI):');
    console.log(`   Local:   ${webUrls.local}`);
    console.log(`   Network: ${webUrls.network}`);
    console.log();
    
    console.log('🔌 Socket Server (API/WebSocket):');
    console.log(`   Local:   ${socketUrls.local}`);
    console.log(`   Network: ${socketUrls.network}`);
    console.log(`   WS:      ws://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
    console.log();
    
    // Generate QR code for mobile access to web app
    if (HOST === '0.0.0.0' || !HOST) {
      try {
        const qr = await qrcode.toString(webUrls.network, { type: 'terminal', small: true });
        console.log('📱 Scan QR code to access Web UI from mobile:\n');
        console.log(qr);
        console.log(`   ${webUrls.network}`);
        console.log();
      } catch (err) {
        console.error('Failed to generate QR code:', err);
      }
    }
    
    console.log('ℹ️  Make sure the web app is running: pnpm dev:web');
    console.log('Press Ctrl+C to stop the server\n');
  });
}

// Start the server
startServer().catch(console.error);