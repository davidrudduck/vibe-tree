import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import clsx from 'clsx';
import type { SettingsAdapter, TerminalSettings } from '../types/settings';
import { DEFAULT_TERMINAL_SETTINGS } from '../types/settings';

interface SettingsDialogProps {
  adapter: SettingsAdapter;
  open: boolean;
  onClose: () => void;
}

type ActiveTab = 'terminal' | 'general';

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

export function SettingsDialog({ adapter, open, onClose }: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('terminal');
  const [settings, setSettings] = useState<TerminalSettings>(DEFAULT_TERMINAL_SETTINGS);
  const [worktreeBasePath, setWorktreeBasePath] = useState<string>('');
  const [worktreePathDraft, setWorktreePathDraft] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    adapter.getTerminalSettings().then(setSettings).catch(() => {});
    adapter.getWorktreeBasePath().then((p) => {
      const val = p ?? '';
      setWorktreeBasePath(val);
      setWorktreePathDraft(val);
    }).catch(() => {});
  }, [open, adapter]);

  const handleTerminalChange = useCallback(
    async <K extends keyof TerminalSettings>(key: K, value: TerminalSettings[K]) => {
      const updated = await adapter.updateTerminalSettings({ [key]: value });
      setSettings(updated);
    },
    [adapter],
  );

  const handleSaveWorktreePath = useCallback(async () => {
    setSaving(true);
    try {
      await adapter.setWorktreeBasePath(worktreePathDraft);
      setWorktreeBasePath(worktreePathDraft);
    } finally {
      setSaving(false);
    }
  }, [adapter, worktreePathDraft]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  if (!open) return null;

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
          {(['terminal', 'general'] as ActiveTab[]).map((tab) => (
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
              <div style={{ marginBottom: '8px' }}>
                <label style={{ ...labelStyle, display: 'block', marginBottom: '8px' }}>
                  Worktree Base Path
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={worktreePathDraft}
                    onChange={(e) => setWorktreePathDraft(e.target.value)}
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
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
