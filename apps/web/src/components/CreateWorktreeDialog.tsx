import { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { useWebSocket } from '../hooks/useWebSocket';

interface CreateWorktreeDialogProps {
  projectId: string;
  open: boolean;
  onClose: () => void;
  onCreated?: (path: string) => void;
}

export function CreateWorktreeDialog({ projectId, open, onClose, onCreated }: CreateWorktreeDialogProps) {
  const { getProject, updateProjectWorktrees } = useAppStore();
  const { getAdapter } = useWebSocket();

  const [newBranchName, setNewBranchName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [branches, setBranches] = useState<{ name: string; current: boolean; remote: boolean }[]>([]);
  const [startPoint, setStartPoint] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const project = getProject(projectId);

  // Fetch branches when dialog opens
  useEffect(() => {
    if (!open || !project) return;
    const adapter = getAdapter();
    if (!adapter) return;
    adapter.getBranches(project.path).then(setBranches).catch(() => {});
    setStartPoint('');
  }, [open, project, getAdapter]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setNewBranchName('');
      setCreateError(null);
      setBranches([]);
      setStartPoint('');
    }
  }, [open]);

  const handleClose = () => {
    onClose();
  };

  const handleCreateBranch = async () => {
    const adapter = getAdapter();
    if (!newBranchName.trim() || !adapter || !project || loading) return;

    setCreateError(null);
    setLoading(true);
    try {
      const result = await adapter.addWorktree(project.path, newBranchName, startPoint || undefined);

      // Refresh worktrees in store
      const trees = await adapter.listWorktrees(project.path);
      updateProjectWorktrees(projectId, trees);

      onClose();
      onCreated?.(result.path);
    } catch (error) {
      setCreateError((error as Error).message || 'Failed to create worktree');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-background border rounded-lg shadow-lg w-full max-w-md">
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-2">Create New Feature Branch</h3>
          <p className="text-sm text-muted-foreground mb-4">
            This will create a new git worktree for parallel development
          </p>

          <input
            type="text"
            placeholder="feature-name"
            value={newBranchName}
            onChange={(e) => setNewBranchName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleCreateBranch();
              }
              if (e.key === 'Escape') {
                handleClose();
              }
            }}
            className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
            autoFocus
          />

          <div className="space-y-1 mt-4">
            <label className="text-xs text-muted-foreground">Base branch</label>
            <select
              value={startPoint}
              onChange={(e) => setStartPoint(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
            >
              <option value="">HEAD (current)</option>
              {branches.filter(b => !b.remote).map(b => (
                <option key={b.name} value={b.name}>
                  {b.name} {b.current ? '(current)' : ''}
                </option>
              ))}
              <optgroup label="Remote">
                {branches.filter(b => b.remote).map(b => (
                  <option key={b.name} value={b.name}>
                    {b.name.replace(/^origin\//, '')} (remote)
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm border border-border rounded-md hover:bg-accent"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateBranch}
              disabled={!newBranchName.trim() || loading}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Branch'}
            </button>
          </div>
          {createError && <p className="text-xs text-red-400 mt-2">{createError}</p>}
        </div>
      </div>
    </div>
  );
}
