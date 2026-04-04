import { Express } from 'express';
import { ShellManager } from '../services/ShellManager';
import { AuthService } from '../auth/AuthService';
import { databaseService } from '../services/DatabaseService';
import {
  listWorktrees,
  getGitStatus,
  getGitDiff,
  addWorktree,
  removeWorktree,
  validateProjects,
  IdeService
} from '@vibetree/core';

interface Services {
  shellManager: ShellManager;
  authService: AuthService;
}

/**
 * Registers the application's REST HTTP routes on the provided Express app.
 *
 * This mounts endpoints for configuration, authentication (login/logout/QR/device management),
 * shell session management, Git operations, project validation and recent-projects management,
 * terminal settings, scheduler history, and IDE detection/opening.
 *
 * @param app - The Express application on which to register the routes
 * @param services - Service bundle providing `shellManager` and `authService` used by the routes
 */
export function setupRestRoutes(app: Express, services: Services) {
  const { shellManager, authService } = services;
  
  // Get server configuration
  app.get('/api/config', (req, res) => {
    res.json({
      projectPath: process.env.PROJECT_PATH || process.cwd(),
      version: '0.0.1'
    });
  });

  // Authentication endpoints
  
  // Get authentication configuration
  app.get('/api/auth/config', (req, res) => {
    const config = authService.getAuthConfig();
    res.json(config);
  });

  // Login endpoint
  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    const result = authService.login(username, password);
    
    if (result.success) {
      res.json({ sessionToken: result.sessionToken });
    } else {
      res.status(401).json({ error: result.error });
    }
  });

  // Logout endpoint
  app.post('/api/auth/logout', (req, res) => {
    // Get session token from Authorization header or query parameter
    let sessionToken: string | undefined;
    
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      sessionToken = authHeader.substring(7);
    } else if (req.query.session_token) {
      sessionToken = req.query.session_token as string;
    } else if (req.body.sessionToken) {
      sessionToken = req.body.sessionToken;
    }

    if (!sessionToken) {
      return res.status(400).json({ error: 'Session token is required' });
    }

    const success = authService.logout(sessionToken);
    
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Session not found' });
    }
  });

  // Generate QR code for device pairing
  app.get('/api/auth/qr', async (req, res) => {
    try {
      const port = parseInt(process.env.PORT || '3001');
      const result = await authService.generateQRCode(port);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to generate QR code' });
    }
  });

  // List connected devices (protected)
  app.get('/api/devices', authService.requireAuth, (req, res) => {
    const devices = authService.getConnectedDevices();
    res.json(devices);
  });

  // Disconnect a device (protected)
  app.delete('/api/devices/:deviceId', authService.requireAuth, (req, res) => {
    const success = authService.disconnectDevice(req.params.deviceId);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Device not found' });
    }
  });

  // List active shell sessions (protected)
  app.get('/api/shells', authService.requireAuth, async (req, res) => {
    const sessions = await shellManager.getAllSessions();
    res.json(sessions.map(s => ({
      id: s.id,
      worktreePath: s.worktreePath,
      createdAt: s.createdAt,
      lastActivity: s.lastActivity
    })));
  });

  // Terminate a shell session (protected)
  app.delete('/api/shells/:sessionId', authService.requireAuth, async (req, res) => {
    const result = await shellManager.terminateSession(req.params.sessionId);
    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json({ error: 'Session not found', ...result });
    }
  });

  // Git operations (for non-WebSocket clients) - Protected
  app.post('/api/git/worktrees', authService.requireAuth, async (req, res) => {
    try {
      const worktrees = await listWorktrees(req.body.projectPath);
      res.json(worktrees);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post('/api/git/status', authService.requireAuth, async (req, res) => {
    try {
      const status = await getGitStatus(req.body.worktreePath);
      res.json(status);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post('/api/git/diff', authService.requireAuth, async (req, res) => {
    try {
      const diff = await getGitDiff(req.body.worktreePath, req.body.filePath);
      res.json({ diff });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post('/api/git/worktree/add', authService.requireAuth, async (req, res) => {
    try {
      const result = await addWorktree(req.body.projectPath, req.body.branchName);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.delete('/api/git/worktree', authService.requireAuth, async (req, res) => {
    try {
      const result = await removeWorktree(
        req.body.projectPath,
        req.body.worktreePath,
        req.body.branchName
      );
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Validate multiple project paths (protected)
  app.post('/api/projects/validate', authService.requireAuth, async (req, res) => {
    try {
      const { projectPaths } = req.body;
      
      if (!Array.isArray(projectPaths)) {
        return res.status(400).json({ error: 'projectPaths must be an array' });
      }
      
      if (projectPaths.length === 0) {
        return res.json([]);
      }
      
      if (projectPaths.length > 10) {
        return res.status(400).json({ error: 'Maximum 10 projects can be validated at once' });
      }
      
      const results = await validateProjects(projectPaths);
      res.json(results);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Auto-load projects from environment variable
  app.get('/api/projects/auto-load', async (req, res) => {
    try {
      const defaultProjectsEnv = process.env.DEFAULT_PROJECTS;
      
      if (!defaultProjectsEnv || defaultProjectsEnv.trim() === '') {
        // No env var configured — fall back to recent projects from database
        const recentProjects = databaseService.projects.findRecent(10);
        if (recentProjects.length > 0) {
          const recentPaths = recentProjects.map((p: any) => p.path);
          const validationResults = await validateProjects(recentPaths);
          const defaultProjectPath = validationResults.find(result => result.valid)?.path || null;
          return res.json({
            projectPaths: recentPaths,
            validationResults,
            defaultProjectPath
          });
        }
        return res.json({
          projectPaths: [],
          validationResults: [],
          defaultProjectPath: null
        });
      }
      
      // Parse comma-separated project paths
      const projectPaths = defaultProjectsEnv
        .split(',')
        .map(path => path.trim())
        .filter(path => path.length > 0);
      
      if (projectPaths.length === 0) {
        return res.json({ 
          projectPaths: [], 
          validationResults: [], 
          defaultProjectPath: null 
        });
      }
      
      if (projectPaths.length > 10) {
        return res.status(400).json({ error: 'Maximum 10 projects can be configured in DEFAULT_PROJECTS' });
      }
      
      // Validate all projects
      const validationResults = await validateProjects(projectPaths);
      
      // First valid project becomes the default
      const defaultProjectPath = validationResults.find(result => result.valid)?.path || null;
      
      res.json({
        projectPaths,
        validationResults,
        defaultProjectPath
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Recent Projects endpoints (protected)

  // Get recent projects
  app.get('/api/projects/recent', authService.requireAuth, (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const projects = databaseService.projects.findRecent(limit);
      res.json(projects);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Add project to recent
  app.post('/api/projects/recent', authService.requireAuth, (req, res) => {
    try {
      const { path } = req.body;

      if (!path) {
        return res.status(400).json({ error: 'path is required' });
      }

      const project = databaseService.projects.updateLastOpened(path);
      res.json(project);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Remove project from recent
  app.delete('/api/projects/recent/:path', authService.requireAuth, (req, res) => {
    try {
      const path = decodeURIComponent(req.params.path);
      databaseService.projects.deleteByPath(path);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Clear all recent projects
  app.delete('/api/projects/recent', authService.requireAuth, (req, res) => {
    try {
      databaseService.projects.clear();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Toggle favorite status
  app.patch('/api/projects/:id/favorite', authService.requireAuth, (req, res) => {
    try {
      const { id } = req.params;
      const { isFavorite } = req.body;

      if (typeof isFavorite !== 'boolean') {
        return res.status(400).json({ error: 'isFavorite must be a boolean' });
      }

      // Get the project first
      const projects = databaseService.projects.findRecent();
      const project = projects.find((p: { id: string }) => p.id === id);

      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      // Update it
      const updated = databaseService.projects.upsert({
        path: project.path,
        isFavorite
      });

      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Terminal Settings endpoints (protected)

  // Get terminal settings
  app.get('/api/settings/terminal', authService.requireAuth, (req, res) => {
    try {
      const settings = databaseService.settings.getTerminalSettings();
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Update terminal settings
  app.put('/api/settings/terminal', authService.requireAuth, (req, res) => {
    try {
      const updates = req.body;
      const settings = databaseService.settings.updateTerminalSettings(updates);
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Reset terminal settings
  app.post('/api/settings/terminal/reset', authService.requireAuth, (req, res) => {
    try {
      const settings = databaseService.settings.resetTerminalSettings();
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Generic settings endpoints (protected)

  // Get all settings for a category
  app.get('/api/settings/:category', authService.requireAuth, (req, res) => {
    try {
      const category = req.params.category as any;
      const settings = databaseService.settings.getByCategory(category);
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Get a specific setting
  app.get('/api/settings/:category/:key', authService.requireAuth, (req, res) => {
    try {
      const { category, key } = req.params;
      const value = databaseService.settings.get(category as any, key);
      res.json({ value: value ?? null });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Set a specific setting
  app.put('/api/settings/:category/:key', authService.requireAuth, (req, res) => {
    try {
      const { category, key } = req.params;
      const { value } = req.body;
      if (value === undefined) {
        return res.status(400).json({ error: 'value is required' });
      }
      const result = databaseService.settings.set(category as any, key, value);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Worktree base path setting endpoints (protected)

  // Get worktree base path
  app.get('/api/settings/worktree-base-path', authService.requireAuth, (req, res) => {
    try {
      const value = databaseService.settings.get<string>('general', 'worktreeBasePath');
      res.json({ path: value ?? null });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Set worktree base path
  app.put('/api/settings/worktree-base-path', authService.requireAuth, async (req, res) => {
    try {
      const { path: basePath } = req.body;

      if (!basePath || typeof basePath !== 'string') {
        return res.status(400).json({ error: 'path is required and must be a string' });
      }

      const fs = await import('fs/promises');
      try {
        await fs.access(basePath);
      } catch {
        return res.status(400).json({ error: `Path does not exist: ${basePath}` });
      }

      databaseService.settings.set('general', 'worktreeBasePath', basePath);
      res.json({ path: basePath });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Scheduler History endpoints (protected)

  // Get scheduler history
  app.get('/api/scheduler/history', authService.requireAuth, (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const history = databaseService.scheduler.findRecent(limit);
      res.json(history);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Add to scheduler history
  app.post('/api/scheduler/history', authService.requireAuth, (req, res) => {
    try {
      const { projectId, command, delayMs, repeat } = req.body;

      if (!command) {
        return res.status(400).json({ error: 'command is required' });
      }

      if (typeof delayMs !== 'number') {
        return res.status(400).json({ error: 'delayMs must be a number' });
      }

      const entry = databaseService.scheduler.create({
        projectId: projectId || null,
        command,
        delayMs,
        repeat: repeat || false
      });

      res.json(entry);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Clear scheduler history
  app.delete('/api/scheduler/history', authService.requireAuth, (req, res) => {
    try {
      databaseService.scheduler.clear();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // IDE endpoints (protected)

  // Detect installed IDEs
  app.get('/api/ide/list', authService.requireAuth, async (req, res) => {
    try {
      const ideService = IdeService.getInstance();
      const ides = await ideService.detectIDEs();
      res.json(ides);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Open path in IDE
  app.post('/api/ide/open', authService.requireAuth, async (req, res) => {
    try {
      const { ideName, path } = req.body;

      if (!ideName || !path) {
        return res.status(400).json({ error: 'ideName and path are required' });
      }

      const ideService = IdeService.getInstance();
      const result = await ideService.openInIDE(ideName, path);

      if (result.success) {
        res.json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });
}