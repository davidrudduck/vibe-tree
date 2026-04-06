import { useEffect, useState } from 'react';
import { useAuth, LoginPage } from '@vibetree/auth';
import { TerminalManager } from './components/TerminalManager';
import { GitDiffView } from './components/GitDiffView';
import { ConnectionStatus } from './components/ConnectionStatus';
import { ProjectSelector } from './components/ProjectSelector';
import { SettingsDialog } from '@vibetree/ui';
import { WorktreeStrip } from './components/WorktreeStrip';
import { CreateWorktreeDialog } from './components/CreateWorktreeDialog';
import { MobileBottomNav, type MobileView } from './components/MobileBottomNav';
import { useAppStore } from './store';
import { useWebSocket } from './hooks/useWebSocket';
import { Sun, Moon, Plus, X, Terminal, GitBranch, Settings, Layers, GitPullRequest, CheckCircle } from 'lucide-react';
import { SessionPanel } from './components/SessionPanel';
import { PRStatusPanel } from './components/PRStatusPanel';
import { autoLoadProjects } from './services/projectValidation';
import { getServerHttpUrl } from './services/portDiscovery';
import { getAuthHeaders } from './services/authService';
import { RestSettingsAdapter } from './adapters/SettingsAdapter';

const settingsAdapter = new RestSettingsAdapter();

function App() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const {
    projects, activeProjectId, addProject, addProjects, removeProject,
    setActiveProject, setSelectedWorktree, setSelectedTab,
    theme, setTheme, connected, setTerminalSettings, terminalSessions
  } = useAppStore();
  const { connect } = useWebSocket();

  const [showProjectSelector, setShowProjectSelector] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSessionPanel, setShowSessionPanel] = useState(false);
  const [showPRPanel, setShowPRPanel] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [autoLoadAttempted, setAutoLoadAttempted] = useState(false);
  const [showSuccessNotification, setShowSuccessNotification] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [mobileView, setMobileView] = useState<MobileView>('terminal');

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;

  useEffect(() => {
    connect();
  }, []);

  // Auto-load projects when connection is established
  useEffect(() => {
    if (connected && !autoLoadAttempted && projects.length === 0) {
      const loadProjects = async () => {
        try {
          const autoLoadResponse = await autoLoadProjects();
          if (autoLoadResponse.validationResults.length > 0) {
            const validPaths = autoLoadResponse.validationResults
              .filter((r) => r.valid)
              .map((r) => r.path);
            if (validPaths.length > 0) {
              const addedIds = addProjects(validPaths);
              if (autoLoadResponse.defaultProjectPath) {
                const defaultIndex = validPaths.indexOf(autoLoadResponse.defaultProjectPath);
                if (defaultIndex >= 0) setActiveProject(addedIds[defaultIndex]);
              }
              setSuccessMessage(`Auto-loaded ${validPaths.length} project${validPaths.length === 1 ? '' : 's'}`);
              setShowSuccessNotification(true);
              setTimeout(() => setShowSuccessNotification(false), 3000);
            }
          }
        } catch (err) {
          console.error('Auto-load failed:', err);
        }
        setAutoLoadAttempted(true);
      };
      loadProjects();
    }
  }, [connected, autoLoadAttempted, projects.length, addProjects, setActiveProject]);

  // Load terminal settings on connect
  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    settingsAdapter.getTerminalSettings()
      .then((s) => { if (!cancelled) setTerminalSettings(s); })
      .catch((err) => console.warn('Failed to load terminal settings:', err));
    return () => { cancelled = true; };
  }, [connected, setTerminalSettings]);

  // Theme init
  useEffect(() => {
    const saved = localStorage.getItem('theme') as 'light' | 'dark' | null;
    if (saved) {
      setTheme(saved);
    } else {
      setTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    }
  }, [setTheme]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('theme', next);
  };

  const handleSelectProject = async (path: string) => {
    addProject(path);
    setShowProjectSelector(false);
    try {
      const httpUrl = await getServerHttpUrl();
      await fetch(`${httpUrl}/api/projects/recent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ path }),
      });
    } catch {
      // Non-critical
    }
  };

  const handleCloseProject = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    removeProject(projectId);
  };

  const handleMobileViewChange = (view: MobileView) => {
    setMobileView(view);
    if (view === 'terminal' && activeProject) {
      setSelectedTab(activeProject.id, 'terminal');
    } else if (view === 'changes' && activeProject) {
      setSelectedTab(activeProject.id, 'changes');
    }
  };

  // Login screen
  if (!authLoading && !isAuthenticated) {
    return <LoginPage />;
  }

  // Project selector (full screen) when no projects or explicitly requested
  if (projects.length === 0 || showProjectSelector) {
    return (
      <div className="h-screen flex flex-col bg-background">
        <header className="h-12 border-b flex items-center justify-between px-4 flex-shrink-0">
          <span className="text-sm font-semibold">VibeTree</span>
          <div className="flex items-center gap-2">
            <button onClick={toggleTheme} className="p-2 hover:bg-accent rounded-md transition-colors" aria-label="Toggle theme">
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <ConnectionStatus />
          </div>
        </header>
        <ProjectSelector onSelectProject={handleSelectProject} />
      </div>
    );
  }

  const worktreeSelected = !!activeProject?.selectedWorktree;
  const selectedTab = activeProject?.selectedTab ?? 'terminal';

  // On mobile, derive the view from selectedTab when worktree is active
  const effectiveMobileView: MobileView = (() => {
    if (mobileView === 'projects') return 'projects';
    if (!worktreeSelected) return mobileView;
    return selectedTab === 'changes' ? 'changes' : 'terminal';
  })();

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Success Notification */}
      {showSuccessNotification && (
        <div className="bg-green-50 dark:bg-green-900/20 border-b border-green-200 dark:border-green-800 px-4 py-2 flex-shrink-0">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
            <CheckCircle className="h-4 w-4" />
            <span className="text-sm font-medium">{successMessage}</span>
            <button onClick={() => setShowSuccessNotification(false)} className="ml-auto hover:bg-green-100 dark:hover:bg-green-800/30 rounded p-1">
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="h-12 border-b flex items-center px-3 gap-2 flex-shrink-0">
        {/* Logo */}
        <span className="text-sm font-semibold flex-shrink-0 mr-1">VibeTree</span>

        {/* Desktop: project chips */}
        <div className="hidden md:flex items-center gap-1 flex-1 overflow-x-auto min-w-0">
          {projects.map((project) => {
            const hasActiveSessions = project.worktrees?.some((wt) => terminalSessions.has(wt.path));
            const isActive = project.id === activeProjectId;
            return (
              <button
                key={project.id}
                onClick={() => setActiveProject(project.id)}
                className={`relative flex items-center gap-1.5 pl-3 pr-7 h-7 text-xs rounded flex-shrink-0 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-accent text-foreground border border-border'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                }`}
              >
                {project.name}
                {hasActiveSessions && (
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                )}
                <span
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-4 w-4 inline-flex items-center justify-center rounded hover:bg-muted/80 text-muted-foreground"
                  onClick={(e) => handleCloseProject(e, project.id)}
                  role="button"
                  aria-label={`Close ${project.name}`}
                >
                  <X className="h-2.5 w-2.5" />
                </span>
              </button>
            );
          })}
          <button
            onClick={() => setShowProjectSelector(true)}
            className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground flex-shrink-0"
            aria-label="Add project"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Mobile: active project name + project switcher */}
        <div className="flex md:hidden items-center gap-2 flex-1 min-w-0">
          <button
            onClick={() => handleMobileViewChange('projects')}
            className="text-sm font-medium truncate text-left flex-1"
          >
            {activeProject?.name ?? 'VibeTree'}
          </button>
        </div>

        {/* Icon buttons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 hover:bg-accent rounded-md transition-colors"
            aria-label="Settings"
          >
            <Settings className="h-4 w-4" />
          </button>
          <button
            onClick={toggleTheme}
            className="p-2 hover:bg-accent rounded-md transition-colors"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <ConnectionStatus />
        </div>
      </header>

      {/* ── Worktree Strip (desktop always, mobile when not in projects view) ── */}
      {activeProjectId && (effectiveMobileView !== 'projects' || true) && (
        <div className={effectiveMobileView === 'projects' ? 'hidden md:block' : ''}>
          <WorktreeStrip
            projectId={activeProjectId}
            onCreateWorktree={() => setShowCreateDialog(true)}
          />
        </div>
      )}

      {/* ── Content Tab Bar (only when worktree selected) ─────── */}
      {activeProjectId && worktreeSelected && (
        <div className={`h-9 border-b flex items-center px-3 flex-shrink-0 bg-muted/20 ${effectiveMobileView === 'projects' ? 'hidden md:flex' : ''}`}>
          <div className="flex gap-1">
            <button
              onClick={() => { setSelectedTab(activeProjectId, 'terminal'); setMobileView('terminal'); }}
              className={`px-3 py-1.5 text-xs rounded flex items-center gap-1.5 transition-colors ${
                selectedTab === 'terminal'
                  ? 'bg-background text-foreground border shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <Terminal className="h-3.5 w-3.5" />
              Terminal
            </button>
            <button
              onClick={() => { setSelectedTab(activeProjectId, 'changes'); setMobileView('changes'); }}
              className={`px-3 py-1.5 text-xs rounded flex items-center gap-1.5 transition-colors ${
                selectedTab === 'changes'
                  ? 'bg-background text-foreground border shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <GitBranch className="h-3.5 w-3.5" />
              Changes
            </button>
          </div>
          <div className="ml-auto flex gap-1">
            <button
              onClick={() => setShowSessionPanel((v) => !v)}
              className={`px-3 py-1.5 text-xs rounded flex items-center gap-1.5 transition-colors ${
                showSessionPanel
                  ? 'bg-background text-foreground border shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
              aria-label="Sessions"
            >
              <Layers className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sessions</span>
            </button>
            <button
              onClick={() => setShowPRPanel((v) => !v)}
              className={`px-3 py-1.5 text-xs rounded flex items-center gap-1.5 transition-colors ${
                showPRPanel
                  ? 'bg-background text-foreground border shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
              aria-label="Pull Requests"
            >
              <GitPullRequest className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">PRs</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Content Area ───────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden relative">
        {/* Mobile: project list view */}
        {effectiveMobileView === 'projects' && (
          <div className="md:hidden absolute inset-0 overflow-y-auto p-4">
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-3">Projects</p>
              {projects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => { setActiveProject(project.id); setMobileView('terminal'); }}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    project.id === activeProjectId
                      ? 'border-blue-400 bg-blue-400/10'
                      : 'border-border hover:bg-accent/50'
                  }`}
                >
                  <div className="font-medium text-sm">{project.name}</div>
                  <div className="text-xs text-muted-foreground truncate mt-0.5">{project.path}</div>
                </button>
              ))}
              <button
                onClick={() => setShowProjectSelector(true)}
                className="w-full p-3 rounded-lg border border-dashed border-muted-foreground/40 text-sm text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors text-center"
              >
                + Add Project
              </button>
            </div>
          </div>
        )}

        {/* Desktop + mobile non-projects: terminal/changes content */}
        <div className={effectiveMobileView === 'projects' ? 'hidden md:block absolute inset-0' : 'absolute inset-0'}>
          {!activeProjectId ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <p className="text-base mb-1">No project selected</p>
                <button
                  onClick={() => setShowProjectSelector(true)}
                  className="text-sm text-blue-400 hover:underline"
                >
                  Add a project
                </button>
              </div>
            </div>
          ) : !worktreeSelected ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <p className="text-base mb-1">Select a worktree</p>
                <p className="text-sm">Choose from the strip above</p>
              </div>
            </div>
          ) : (
            <>
              <div className={`absolute inset-0 ${selectedTab === 'terminal' ? 'block' : 'hidden'}`}>
                <TerminalManager
                  worktrees={activeProject?.worktrees ?? []}
                  selectedWorktree={activeProject?.selectedWorktree ?? null}
                />
              </div>
              <div className={`absolute inset-0 ${selectedTab === 'changes' ? 'block' : 'hidden'}`}>
                <GitDiffView worktreePath={activeProject!.selectedWorktree!} theme={theme} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Mobile Bottom Nav ──────────────────────────────────── */}
      <MobileBottomNav activeView={effectiveMobileView} onChange={handleMobileViewChange} />

      {/* ── Overlays / Dialogs ─────────────────────────────────── */}
      <SettingsDialog
        adapter={settingsAdapter}
        open={showSettings}
        onClose={() => setShowSettings(false)}
        onSettingsChange={setTerminalSettings}
      />

      {activeProjectId && (
        <CreateWorktreeDialog
          projectId={activeProjectId}
          open={showCreateDialog}
          onClose={() => setShowCreateDialog(false)}
          onCreated={(path) => setSelectedWorktree(activeProjectId, path)}
        />
      )}

      {showPRPanel && activeProjectId && (
        <PRStatusPanel
          projectPath={activeProject?.path ?? ''}
          onClose={() => setShowPRPanel(false)}
        />
      )}

      {showSessionPanel && activeProjectId && (
        <SessionPanel
          projectPath={activeProject?.path ?? ''}
          onClose={() => setShowSessionPanel(false)}
        />
      )}
    </div>
  );
}

export default App;
