import { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { useWebSocket } from '../hooks/useWebSocket';
import type { WebSocketAdapter } from '../adapters/WebSocketAdapter';

interface ReassignSessionDialogProps {
  sessionId: string;
  currentWorktreePath: string;
  open: boolean;
  onClose: () => void;
  onReassigned: () => void;
}

export function ReassignSessionDialog({ sessionId, currentWorktreePath, open, onClose, onReassigned }: ReassignSessionDialogProps) {
  const { projects } = useAppStore();
  const { getAdapter } = useWebSocket();

  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedWorktreePath, setSelectedWorktreePath] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  useEffect(() => {
    if (!open) {
      setSelectedProjectId('');
      setSelectedWorktreePath('');
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (selectedProject?.worktrees.length) {
      setSelectedWorktreePath(selectedProject.worktrees[0].path);
    } else {
      setSelectedWorktreePath('');
    }
  }, [selectedProjectId, selectedProject]);

  const handleConfirm = async () => {
    if (!selectedWorktreePath || loading) return;
    if (selectedWorktreePath === currentWorktreePath) {
      setError('Session is already assigned to this worktree');
      return;
    }

    const adapter = getAdapter() as WebSocketAdapter | null;
    if (!adapter) {
      setError('No adapter connected');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await adapter.reassignSession(sessionId, selectedWorktreePath);
      onReassigned();
      onClose();
    } catch (err) {
      setError((err as Error).message || 'Failed to reassign session');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-background border rounded-lg shadow-lg w-full max-w-md">
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-2">Reassign Session</h3>
          <p className="text-sm text-muted-foreground mb-1">
            Current worktree:
          </p>
          <p className="text-xs font-mono text-foreground mb-4 break-all">{currentWorktreePath}</p>

          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Project</label>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
              >
                <option value="">Select a project...</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Worktree</label>
              <select
                value={selectedWorktreePath}
                onChange={(e) => setSelectedWorktreePath(e.target.value)}
                disabled={!selectedProject}
                className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm disabled:opacity-50"
              >
                <option value="">Select a worktree...</option>
                {(selectedProject?.worktrees ?? []).map(wt => {
                  const label = (wt.branch ?? wt.path).replace(/^refs\/heads\//, '');
                  return (
                    <option key={wt.path} value={wt.path}>{label}</option>
                  );
                })}
              </select>
            </div>
          </div>

          {error && <p className="text-xs text-red-400 mt-3">{error}</p>}

          <div className="flex justify-end gap-2 mt-6">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm border border-border rounded-md hover:bg-accent"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedWorktreePath || loading}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? 'Reassigning...' : 'Reassign Session'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
