import { useState, useEffect } from 'react';
import { RefreshCw, Plus } from 'lucide-react';
import { useAppStore } from '../store';
import { useWebSocket } from '../hooks/useWebSocket';

interface WorktreeStripProps {
  projectId: string;
  onCreateWorktree: () => void;
}

function stripRefPrefix(branch: string): string {
  return branch.replace(/^refs\/heads\//, '');
}

function isMainBranch(branch: string): boolean {
  const name = stripRefPrefix(branch);
  return name === 'main' || name === 'master';
}

export function WorktreeStrip({ projectId, onCreateWorktree }: WorktreeStripProps) {
  const { getProject, setSelectedWorktree, updateProjectWorktrees, terminalSessions, connected } = useAppStore();
  const { getAdapter } = useWebSocket();

  const [loading, setLoading] = useState(false);

  const project = getProject(projectId);
  const adapter = getAdapter();

  // Auto-load worktrees when project changes or connection established
  useEffect(() => {
    if (!project || !connected || loading || !adapter) return;

    const load = async () => {
      setLoading(true);
      try {
        const trees = await adapter.listWorktrees(project.path);
        updateProjectWorktrees(projectId, trees);
      } catch (err) {
        console.error('Failed to load worktrees:', err);
      } finally {
        setLoading(false);
      }
    };

    load();
    // stable deps: projectId and adapter presence
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, connected, adapter?.constructor?.name]);

  const handleRefresh = async () => {
    if (!project || !adapter || loading) return;
    setLoading(true);
    try {
      const trees = await adapter.listWorktrees(project.path);
      updateProjectWorktrees(projectId, trees);
    } catch (err) {
      console.error('Failed to refresh worktrees:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!project) return null;

  const worktrees = [...project.worktrees].sort((a, b) => {
    const aBranch = a.branch ?? '';
    const bBranch = b.branch ?? '';
    if (isMainBranch(aBranch) && !isMainBranch(bBranch)) return -1;
    if (!isMainBranch(aBranch) && isMainBranch(bBranch)) return 1;
    return stripRefPrefix(aBranch).localeCompare(stripRefPrefix(bBranch));
  });

  return (
    <div className="h-10 border-b flex items-center px-3 gap-2 overflow-x-auto flex-shrink-0 bg-muted/30">
      {loading && worktrees.length === 0 ? (
        <span className="px-3 py-1.5 text-xs font-mono text-muted-foreground opacity-50">Loading...</span>
      ) : worktrees.length === 0 ? (
        <span className="px-3 py-1.5 text-xs font-mono text-muted-foreground opacity-50 select-none">No worktrees</span>
      ) : (
        worktrees.map((worktree) => {
          const isSelected = project.selectedWorktree === worktree.path;
          const hasSession = terminalSessions.has(worktree.path);
          const displayName = worktree.branch
            ? stripRefPrefix(worktree.branch)
            : worktree.head.slice(0, 7);

          return (
            <button
              key={worktree.path}
              onClick={() => setSelectedWorktree(projectId, worktree.path)}
              className={
                isSelected
                  ? 'px-3 py-1.5 text-xs font-mono rounded flex items-center gap-1.5 flex-shrink-0 bg-accent text-foreground border-b-2 border-blue-400 whitespace-nowrap'
                  : 'px-3 py-1.5 text-xs font-mono rounded flex items-center gap-1.5 flex-shrink-0 text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors border-b-2 border-transparent whitespace-nowrap'
              }
            >
              {displayName}
              {hasSession && <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />}
            </button>
          );
        })
      )}

      <button
        onClick={onCreateWorktree}
        className="px-3 py-1.5 text-xs rounded flex items-center gap-1.5 flex-shrink-0 text-muted-foreground hover:text-foreground border border-dashed border-muted-foreground/40 hover:border-muted-foreground transition-colors whitespace-nowrap"
      >
        <Plus className="w-3 h-3" />
        New
      </button>

      <button
        onClick={handleRefresh}
        disabled={loading || !connected}
        className="ml-auto p-1 hover:bg-accent rounded flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        aria-label="Refresh worktrees"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
      </button>
    </div>
  );
}
