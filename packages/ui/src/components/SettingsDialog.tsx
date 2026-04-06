import * as React from 'react';
import { useState, useEffect, useCallback, useRef } from 'react';
import clsx from 'clsx';
import type { SettingsAdapter, TerminalSettings, Project } from '../types/settings';
import { DEFAULT_TERMINAL_SETTINGS } from '../types/settings';

interface SettingsDialogProps {
  adapter: SettingsAdapter;
  open: boolean;
  onClose: () => void;
  onSettingsChange?: (settings: TerminalSettings) => void;
}

type ActiveTab = 'terminal' | 'general' | 'projects';

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const panelStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-primary, #1e1e1e)',
  color: 'var(--text-primary, #d4d4d4)',
  borderRadius: '8px',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
  width: '480px',
  maxWidth: '90vw',
  maxHeight: '80vh',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '16px 20px',
  borderBottom: '1px solid var(--border-color, #3c3c3c)',
};

const tabBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: '4px',
  padding: '12px 20px 0',
  borderBottom: '1px solid var(--border-color, #3c3c3c)',
};

const contentStyle: React.CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: '20px',
};

const fieldRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '16px',
};

const labelStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-secondary, #2d2d2d)',
  color: 'var(--text-primary, #d4d4d4)',
  border: '1px solid var(--border-color, #3c3c3c)',
  borderRadius: '4px',
  padding: '4px 8px',
  fontSize: '13px',
  width: '120px',
};

const closeButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--text-secondary, #858585)',
  fontSize: '18px',
  lineHeight: 1,
  padding: '2px 6px',
  borderRadius: '4px',
};

const errorStyle: React.CSSProperties = {
  color: '#f44',
  fontSize: '12px',
  marginTop: '4px',
};

export function SettingsDialog({ adapter, open, onClose, onSettingsChange }: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('terminal');
  const [settings, setSettings] = useState<TerminalSettings>(DEFAULT_TERMINAL_SETTINGS);
  const [worktreeBasePath, setWorktreeBasePath] = useState<string>('');
  const [worktreePathDraft, setWorktreePathDraft] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [worktreeError, setWorktreeError] = useState<string | null>(null);

  // GitHub token state
  const [githubToken, setGithubToken] = useState<string>('');
  const [githubTokenConfigured, setGithubTokenConfigured] = useState(false);
  const [githubTokenMasked, setGithubTokenMasked] = useState<string | null>(null);
  const [githubTokenSaving, setGithubTokenSaving] = useState(false);
  const [githubTokenError, setGithubTokenError] = useState<string | null>(null);

  // Projects tab state
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    adapter.getTerminalSettings().then(setSettings).catch((err) => {
      console.error('Failed to load terminal settings:', err);
    });
    adapter.getWorktreeBasePath().then((p) => {
      const val = p ?? '';
      setWorktreeBasePath(val);
      setWorktreePathDraft(val);
    }).catch((err) => {
      console.error('Failed to load worktree base path:', err);
    });
    adapter.getGitHubToken().then((result) => {
      setGithubTokenConfigured(result.configured);
      setGithubTokenMasked(result.masked);
      setGithubToken('');
    }).catch((err) => {
      console.error('Failed to load GitHub token:', err);
    });
  }, [open, adapter]);

  useEffect(() => {
    if (!open || activeTab !== 'projects') return;
    setProjectsLoading(true);
    adapter.getProjects().then((p) => {
      setProjects(p);
    }).catch((err) => {
      console.error('Failed to load projects:', err);
    }).finally(() => {
      setProjectsLoading(false);
    });
  }, [open, activeTab, adapter]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleTerminalChange = useCallback(
    <K extends keyof TerminalSettings>(key: K, value: TerminalSettings[K]) => {
      // Update local state immediately for responsive UI
      setSettings((prev) => ({ ...prev, [key]: value }));

      // Debounce the API call
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        try {
          const updated = await adapter.updateTerminalSettings({ [key]: value });
          setSettings(updated);
          onSettingsChange?.(updated);
        } catch (err) {
          console.error('Failed to save terminal settings:', err);
        }
      }, 500);
    },
    [adapter],
  );

  const handleSaveWorktreePath = useCallback(async () => {
    setSaving(true);
    setWorktreeError(null);
    try {
      await adapter.setWorktreeBasePath(worktreePathDraft);
      setWorktreeBasePath(worktreePathDraft);
    } catch (err) {
      setWorktreeError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [adapter, worktreePathDraft]);

  const handleSaveGitHubToken = useCallback(async () => {
    setGithubTokenSaving(true);
    setGithubTokenError(null);
    try {
      await adapter.setGitHubToken(githubToken);
      setGithubTokenConfigured(true);
      setGithubToken('');
    } catch (err) {
      setGithubTokenError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setGithubTokenSaving(false);
    }
  }, [adapter, githubToken]);

  const handleRemoveProject = useCallback(async (path: string) => {
    try {
      await adapter.removeProject(path);
      setProjects((prev) => prev.filter((p) => p.path !== path));
    } catch (err) {
      console.error('Failed to remove project:', err);
    }
  }, [adapter]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  if (!open) return null;

  const tabs: ActiveTab[] = ['terminal', 'general', 'projects'];

  return (
    <div style={overlayStyle} onClick={handleOverlayClick}>
      <div style={panelStyle} role="dialog" aria-modal="true" aria-label="Settings">
        {/* Header */}
        <div style={headerStyle}>
          <span style={{ fontSize: '15px', fontWeight: 600 }}>Settings</span>
          <button style={closeButtonStyle} onClick={onClose} aria-label="Close settings">
            ×
          </button>
        </div>

        {/* Tab bar */}
        <div style={tabBarStyle}>
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '6px 12px',
                fontSize: '13px',
                fontWeight: activeTab === tab ? 600 : 400,
                color:
                  activeTab === tab
                    ? 'var(--text-primary, #d4d4d4)'
                    : 'var(--text-secondary, #858585)',
                borderBottom: activeTab === tab ? '2px solid var(--accent, #007acc)' : '2px solid transparent',
                marginBottom: '-1px',
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={contentStyle}>
          {activeTab === 'terminal' && (
            <div>
              {/* Font Size */}
              <div style={fieldRowStyle}>
                <label style={labelStyle}>Font Size</label>
                <input
                  type="number"
                  min={8}
                  max={32}
                  value={settings.fontSize}
                  onChange={(e) => handleTerminalChange('fontSize', Number(e.target.value))}
                  style={inputStyle}
                />
              </div>

              {/* Cursor Blink */}
              <div style={fieldRowStyle}>
                <label style={labelStyle}>Cursor Blink</label>
                <input
                  type="checkbox"
                  checked={settings.cursorBlink}
                  onChange={(e) => handleTerminalChange('cursorBlink', e.target.checked)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
              </div>

              {/* Scrollback */}
              <div style={fieldRowStyle}>
                <label style={labelStyle}>Scrollback Lines</label>
                <input
                  type="number"
                  min={100}
                  max={100000}
                  step={100}
                  value={settings.scrollback}
                  onChange={(e) => handleTerminalChange('scrollback', Number(e.target.value))}
                  style={inputStyle}
                />
              </div>

              {/* Tab Width */}
              <div style={fieldRowStyle}>
                <label style={labelStyle}>Tab Width</label>
                <input
                  type="number"
                  min={1}
                  max={16}
                  value={settings.tabStopWidth}
                  onChange={(e) => handleTerminalChange('tabStopWidth', Number(e.target.value))}
                  style={inputStyle}
                />
              </div>
            </div>
          )}

          {activeTab === 'general' && (
            <div>
              {/* Worktree Base Path */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ ...labelStyle, display: 'block', marginBottom: '8px' }}>
                  Worktree Base Path
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={worktreePathDraft}
                    onChange={(e) => { setWorktreePathDraft(e.target.value); setWorktreeError(null); }}
                    placeholder="/path/to/worktrees"
                    style={{ ...inputStyle, flex: 1, width: 'auto' }}
                  />
                  <button
                    onClick={handleSaveWorktreePath}
                    disabled={saving || worktreePathDraft === worktreeBasePath}
                    className={clsx('settings-save-btn')}
                    style={{
                      backgroundColor: 'var(--accent, #007acc)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '4px 12px',
                      fontSize: '13px',
                      cursor: saving || worktreePathDraft === worktreeBasePath ? 'not-allowed' : 'pointer',
                      opacity: saving || worktreePathDraft === worktreeBasePath ? 0.5 : 1,
                    }}
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
                {worktreeError && <div style={errorStyle}>{worktreeError}</div>}
              </div>

              {/* GitHub Token */}
              <div style={{ marginBottom: '8px' }}>
                <label style={{ ...labelStyle, display: 'block', marginBottom: '4px' }}>
                  GitHub Token
                </label>
                <div style={{ fontSize: '12px', marginBottom: '8px', color: 'var(--text-secondary, #858585)' }}>
                  Status:{' '}
                  {githubTokenConfigured ? (
                    <span style={{ color: '#4caf50' }}>Configured</span>
                  ) : (
                    <span style={{ color: 'var(--text-secondary, #858585)' }}>Not configured</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="password"
                    value={githubToken}
                    onChange={(e) => { setGithubToken(e.target.value); setGithubTokenError(null); }}
                    placeholder={githubTokenConfigured ? '••••••••••••••••' : 'ghp_...'}
                    style={{ ...inputStyle, flex: 1, width: 'auto' }}
                  />
                  <button
                    onClick={handleSaveGitHubToken}
                    disabled={githubTokenSaving || !githubToken}
                    className={clsx('settings-save-btn')}
                    style={{
                      backgroundColor: 'var(--accent, #007acc)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '4px 12px',
                      fontSize: '13px',
                      cursor: githubTokenSaving || !githubToken ? 'not-allowed' : 'pointer',
                      opacity: githubTokenSaving || !githubToken ? 0.5 : 1,
                    }}
                  >
                    {githubTokenSaving ? 'Saving…' : 'Save'}
                  </button>
                </div>
                {githubTokenError && <div style={errorStyle}>{githubTokenError}</div>}
              </div>
            </div>
          )}

          {activeTab === 'projects' && (
            <div>
              {projectsLoading ? (
                <div style={{ fontSize: '13px', color: 'var(--text-secondary, #858585)' }}>
                  Loading projects…
                </div>
              ) : projects.length === 0 ? (
                <div style={{ fontSize: '13px', color: 'var(--text-secondary, #858585)' }}>
                  No registered projects.
                </div>
              ) : (
                <div>
                  {projects.map((project) => (
                    <div
                      key={project.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 0',
                        borderBottom: '1px solid var(--border-color, #3c3c3c)',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0, marginRight: '12px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '2px' }}>
                          {project.name || project.path.split('/').pop()}
                        </div>
                        <div
                          style={{
                            fontSize: '12px',
                            color: 'var(--text-secondary, #858585)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={project.path}
                        >
                          {project.path}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveProject(project.path)}
                        aria-label={`Remove project ${project.name || project.path}`}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--text-secondary, #858585)',
                          padding: '4px',
                          borderRadius: '4px',
                          fontSize: '16px',
                          lineHeight: 1,
                          flexShrink: 0,
                        }}
                        title="Remove project"
                      >
                        🗑
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
