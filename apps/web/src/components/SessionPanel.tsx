import { useState, useEffect, useCallback } from 'react';
import { X, RefreshCw, Trash2 } from 'lucide-react';
import { useWebSocket } from '../hooks/useWebSocket';
import type { WebSocketAdapter } from '../adapters/WebSocketAdapter';
import { LinkSessionDialog } from './LinkSessionDialog';
import { ReassignSessionDialog } from './ReassignSessionDialog';

interface TerminalSession {
  id: string;
  projectPath: string;
  worktreePath: string;
  tmuxSessionName: string;
  status: 'active' | 'disconnected' | 'dead';
  isExternal: boolean;
  createdAt: string;
  lastActivity: string;
}

interface TmuxSession {
  name: string;
  windows: number;
  created: string;
  attached: boolean;
  isVibeTree: boolean;
}

interface SessionPanelProps {
  projectPath: string;
  onClose: () => void;
}

function getRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  return `${Math.floor(diffHour / 24)}d ago`;
}

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'flex-end',
  zIndex: 1000,
  padding: '60px 16px 16px',
};

const panelStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-primary, #1e1e1e)',
  color: 'var(--text-primary, #d4d4d4)',
  borderRadius: '8px',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
  width: '400px',
  maxWidth: '90vw',
  maxHeight: 'calc(100vh - 80px)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  border: '1px solid var(--border-color, #3c3c3c)',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 16px',
  borderBottom: '1px solid var(--border-color, #3c3c3c)',
  flexShrink: 0,
};

const sessionRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '10px 16px',
  borderBottom: '1px solid var(--border-color, #2a2a2a)',
  gap: '10px',
};

const statusDotStyle = (status: TerminalSession['status']): React.CSSProperties => ({
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  flexShrink: 0,
  backgroundColor:
    status === 'active' ? '#4ade80' :
    status === 'disconnected' ? '#facc15' :
    '#6b7280',
});

const terminateBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: '#ef4444',
  padding: '4px',
  borderRadius: '4px',
  display: 'flex',
  alignItems: 'center',
  flexShrink: 0,
};

const iconBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--text-primary, #d4d4d4)',
  padding: '4px',
  borderRadius: '4px',
  display: 'flex',
  alignItems: 'center',
};

const sectionHeaderStyle: React.CSSProperties = {
  padding: '8px 16px',
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--text-muted, #6b7280)',
  backgroundColor: 'var(--bg-secondary, #252525)',
  borderBottom: '1px solid var(--border-color, #2a2a2a)',
};

const vtBadgeStyle: React.CSSProperties = {
  fontSize: '9px',
  fontWeight: 700,
  padding: '1px 4px',
  borderRadius: '3px',
  backgroundColor: '#3b82f6',
  color: '#fff',
  flexShrink: 0,
};

export function SessionPanel({ projectPath, onClose }: SessionPanelProps) {
  const { getAdapter } = useWebSocket();
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [tmuxSessions, setTmuxSessions] = useState<TmuxSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [terminatingIds, setTerminatingIds] = useState<Set<string>>(new Set());
  const [linkingSession, setLinkingSession] = useState<string | null>(null);
  const [reassigningSession, setReassigningSession] = useState<{ id: string; worktreePath: string } | null>(null);

  const fetchSessions = useCallback(async () => {
    const adapter = getAdapter();
    if (!adapter) return;
    setLoading(true);
    try {
      const [all, allTmux] = await Promise.all([
        adapter.listSessions(),
        (adapter as WebSocketAdapter).listAllTmuxSessions().catch(() => [] as TmuxSession[]),
      ]);
      setSessions((all as TerminalSession[]).filter((s) => s.projectPath === projectPath));
      setTmuxSessions(allTmux);
    } catch (err) {
      console.error('Failed to list sessions:', err);
    } finally {
      setLoading(false);
    }
  }, [getAdapter, projectPath]);

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 10000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  const handleTerminate = async (sessionId: string) => {
    const adapter = getAdapter();
    if (!adapter) return;
    setTerminatingIds((prev) => new Set(prev).add(sessionId));
    try {
      const res = await (adapter as any).sendMessage('shell:terminate', { sessionId });
      if (res?.success !== false) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      }
    } catch (err) {
      console.error('Failed to terminate session:', err);
    } finally {
      setTerminatingIds((prev) => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
    }
  };

  return (
    <div style={overlayStyle} onClick={onClose} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
      <div style={panelStyle} role="dialog" aria-modal="true" aria-label="Terminal Sessions" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <span style={{ fontWeight: 600, fontSize: '14px' }}>Terminal Sessions</span>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              style={iconBtnStyle}
              onClick={fetchSessions}
              disabled={loading}
              aria-label="Refresh sessions"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            <button style={iconBtnStyle} onClick={onClose} aria-label="Close session panel">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Session list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {sessions.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted, #6b7280)', fontSize: '13px' }}>
              {loading ? 'Loading...' : 'No sessions for this project'}
            </div>
          ) : (
            sessions.map((session) => (
              <div key={session.id} style={sessionRowStyle}>
                <span style={statusDotStyle(session.status)} title={session.status} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {basename(session.worktreePath)}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted, #6b7280)', marginTop: '2px' }}>
                    {session.status} · {getRelativeTime(session.lastActivity)}
                  </div>
                </div>
                <button
                  style={{
                    ...terminateBtnStyle,
                    opacity: terminatingIds.has(session.id) ? 0.5 : 1,
                  }}
                  onClick={() => handleTerminate(session.id)}
                  disabled={terminatingIds.has(session.id)}
                  aria-label="Terminate session"
                  title="Terminate session"
                >
                  <Trash2 size={14} />
                </button>
                {session.isExternal && (
                  <button
                    style={{
                      background: 'none',
                      border: '1px solid var(--border-color, #3c3c3c)',
                      cursor: 'pointer',
                      color: 'var(--text-primary, #d4d4d4)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      flexShrink: 0,
                    }}
                    onClick={() => setReassigningSession({ id: session.id, worktreePath: session.worktreePath })}
                  >
                    Re-assign
                  </button>
                )}
              </div>
            ))
          )}

          {/* All tmux Sessions section */}
          <div style={sectionHeaderStyle}>All tmux Sessions</div>
          {tmuxSessions.length === 0 ? (
            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted, #6b7280)', fontSize: '13px' }}>
              {loading ? 'Loading...' : 'No tmux sessions found'}
            </div>
          ) : (
            tmuxSessions.map((session) => (
              <div
                key={session.name}
                style={{
                  ...sessionRowStyle,
                  opacity: session.isVibeTree ? 1 : 0.75,
                }}
              >
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    flexShrink: 0,
                    backgroundColor: session.attached ? '#4ade80' : '#6b7280',
                  }}
                  title={session.attached ? 'attached' : 'detached'}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {session.name}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted, #6b7280)', marginTop: '2px' }}>
                    {session.windows} {session.windows === 1 ? 'window' : 'windows'} · {getRelativeTime(session.created)}
                  </div>
                </div>
                {session.isVibeTree && <span style={vtBadgeStyle}>VT</span>}
                {!session.isVibeTree && (
                  <button
                    style={{
                      background: 'none',
                      border: '1px solid var(--border-color, #3c3c3c)',
                      cursor: 'pointer',
                      color: 'var(--text-primary, #d4d4d4)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      flexShrink: 0,
                    }}
                    onClick={() => setLinkingSession(session.name)}
                  >
                    Link
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
      <LinkSessionDialog
        tmuxSessionName={linkingSession ?? ''}
        open={linkingSession !== null}
        onClose={() => setLinkingSession(null)}
        onLinked={() => { setLinkingSession(null); fetchSessions(); }}
      />
      <ReassignSessionDialog
        sessionId={reassigningSession?.id ?? ''}
        currentWorktreePath={reassigningSession?.worktreePath ?? ''}
        open={reassigningSession !== null}
        onClose={() => setReassigningSession(null)}
        onReassigned={() => { setReassigningSession(null); fetchSessions(); }}
      />
    </div>
  );
}
