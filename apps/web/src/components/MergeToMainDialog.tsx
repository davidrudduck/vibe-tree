import { useState } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import type { WebSocketAdapter } from '../adapters/WebSocketAdapter';

interface MergeToMainDialogProps {
  projectPath: string;
  branchName: string;
  mainWorktreePath: string;
  aheadBehind?: { ahead: number; behind: number };
  open: boolean;
  onClose: () => void;
  onMerged: () => void;
}

export function MergeToMainDialog({ projectPath, branchName, mainWorktreePath, aheadBehind, open, onClose, onMerged }: MergeToMainDialogProps) {
  const { getAdapter } = useWebSocket();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (loading) return;

    const adapter = getAdapter() as WebSocketAdapter | null;
    if (!adapter) {
      setError('No adapter connected');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const result = await adapter.mergeToMain(projectPath, branchName, mainWorktreePath);
      if (!result.success) {
        setError(result.error || 'Merge failed');
        return;
      }
      onMerged();
      onClose();
    } catch (err) {
      setError((err as Error).message || 'Failed to merge branch');
    } finally {
      setLoading(false);
    }
  };

  const displayBranch = branchName.replace(/^refs\/heads\//, '');

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-background border rounded-lg shadow-lg w-full max-w-md">
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-2">Merge to Main</h3>
          <p className="text-sm text-muted-foreground mb-4">
            This will merge the branch into the main worktree.
          </p>

          <div className="flex items-center gap-2 mb-4">
            <span className="font-mono text-sm bg-muted px-2 py-1 rounded">{displayBranch}</span>
            {aheadBehind && (
              <>
                {aheadBehind.ahead > 0 && (
                  <span className="text-xs text-green-500 font-medium">↑{aheadBehind.ahead}</span>
                )}
                {aheadBehind.behind > 0 && (
                  <span className="text-xs text-red-500 font-medium">↓{aheadBehind.behind}</span>
                )}
              </>
            )}
          </div>

          {aheadBehind && aheadBehind.behind > 0 && (
            <p className="text-xs text-amber-500 mb-4">
              Warning: This branch is behind main by {aheadBehind.behind} commit{aheadBehind.behind !== 1 ? 's' : ''}. Consider rebasing first to avoid conflicts.
            </p>
          )}

          {error && <p className="text-xs text-red-400 mt-2 mb-2">{error}</p>}

          <div className="flex justify-end gap-2 mt-6">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm border border-border rounded-md hover:bg-accent"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? 'Merging...' : 'Merge to main'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
