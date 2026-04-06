import { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { useWebSocket } from '../hooks/useWebSocket';
import type { WebSocketAdapter } from '../adapters/WebSocketAdapter';

interface CleanupWorktreeDialogProps {
  projectPath: string;
  worktreePath: string;
  branchName: string;
  open: boolean;
  onClose: () => void;
  onCleaned: () => void;
}

export function CleanupWorktreeDialog({ projectPath, worktreePath, branchName, open, onClose, onCleaned }: CleanupWorktreeDialogProps) {
  const { terminalSessions } = useAppStore();
  const { getAdapter } = useWebSocket();

  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [force, setForce] = useState(false);

  const hasActiveSession = terminalSessions.has(worktreePath);
  const displayBranch = branchName.replace(/^refs\/heads\//, '');

  useEffect(() => {
    if (!open) {
      setError(null);
      setIsDirty(false);
      setForce(false);
      return;
    }

    const adapter = getAdapter() as WebSocketAdapter | null;
    if (!adapter) return;

    setChecking(true);
    adapter.getGitStatus(worktreePath)
      .then(status => {
        setIsDirty(status.length > 0);
      })
      .catch(() => {
        setIsDirty(false);
      })
      .finally(() => {
        setChecking(false);
      });
  }, [open, worktreePath, getAdapter]);

  const handleConfirm = async () => {
    if (loading) return;

    if (isDirty && !force) {
      setError('Enable force to remove worktree with uncommitted changes');
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
      const result = await adapter.cleanupWorktree(projectPath, worktreePath, branchName, force);
      if (!result.success) {
        setError(result.error || 'Cleanup failed');
        return;
      }
      onCleaned();
      onClose();
    } catch (err) {
      setError((err as Error).message || 'Failed to clean up worktree');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-background border rounded-lg shadow-lg w-full max-w-md">
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-2">Clean Up Worktree</h3>
          <p className="text-sm text-muted-foreground mb-1">
            Remove the worktree for branch:
          </p>
          <p className="font-mono text-sm mb-4">{displayBranch}</p>

          {checking && (
            <p className="text-xs text-muted-foreground mb-3">Checking worktree status...</p>
          )}

          {!checking && (isDirty || hasActiveSession) && (
            <div className="space-y-1 mb-4">
              {isDirty && (
                <p className="text-xs text-amber-500">⚠ Uncommitted changes</p>
              )}
              {hasActiveSession && (
                <p className="text-xs text-amber-500">⚠ Active terminal session attached</p>
              )}
            </div>
          )}

          {isDirty && (
            <label className="flex items-center gap-2 text-sm mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={force}
                onChange={(e) => {
                  setForce(e.target.checked);
                  if (e.target.checked) setError(null);
                }}
                className="rounded"
              />
              Force remove (discard uncommitted changes)
            </label>
          )}

          {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

          <div className="flex justify-end gap-2 mt-6">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm border border-border rounded-md hover:bg-accent"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading || checking}
              className="px-4 py-2 text-sm bg-red-600 hover:bg-red-500 text-white rounded-md disabled:opacity-50"
            >
              {loading ? 'Cleaning up...' : 'Clean up'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
