import { useState, useEffect } from 'react';
import { GitBranch, Terminal, RotateCcw, GitMerge, Trash2 } from 'lucide-react';
import { useWebSocket } from '../hooks/useWebSocket';
import { MergeToMainDialog } from './MergeToMainDialog';
import { CleanupWorktreeDialog } from './CleanupWorktreeDialog';

interface TerminalSession {
  id: string;
  projectPath: string;
  worktreePath: string;
  tmuxSessionName: string;
  status: 'active' | 'disconnected' | 'dead';
  createdAt: string;
  lastActivity: string;
}

interface WorktreeInfoProps {
  worktreePath: string;
  branch: string;
  aheadBehind?: { ahead: number; behind: number };
  projectPath: string;
  mainWorktreePath: string;
  onStartTerminal: () => void;
  onReconnect: () => void;
  onWorktreeRemoved?: () => void;
}

export function WorktreeInfo({ worktreePath, branch, aheadBehind, projectPath, mainWorktreePath, onStartTerminal, onReconnect, onWorktreeRemoved }: WorktreeInfoProps) {
  const { getAdapter } = useWebSocket();
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [showCleanupDialog, setShowCleanupDialog] = useState(false);

  useEffect(() => {
    const adapter = getAdapter();
    if (!adapter) {
      setLoadingSessions(false);
      return;
    }

    let cancelled = false;
    setLoadingSessions(true);

    adapter.listSessions()
      .then((all: TerminalSession[]) => {
        if (!cancelled) {
          setSessions(all.filter((s) => s.worktreePath === worktreePath && s.status !== 'dead'));
        }
      })
      .catch(() => {
        if (!cancelled) setSessions([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSessions(false);
      });

    return () => { cancelled = true; };
  }, [worktreePath, getAdapter]);

  const displayBranch = branch.replace('refs/heads/', '');
  const isMainBranch = displayBranch === 'main' || displayBranch === 'master';
  const displayPath = worktreePath.split('/').slice(-2).join('/');

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <div className="w-full max-w-md">
        {/* Branch info */}
        <div className="flex items-center justify-center gap-2 mb-2">
          <GitBranch className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-2xl font-bold truncate">{displayBranch}</h2>
        </div>

        {/* Path */}
        <p className="text-sm text-muted-foreground mb-3 truncate">{displayPath}</p>

        {/* Ahead/behind badges */}
        {aheadBehind && (aheadBehind.ahead > 0 || aheadBehind.behind > 0) && (
          <div className="flex items-center justify-center gap-2 mb-4">
            {aheadBehind.ahead > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                ↑{aheadBehind.ahead} ahead
              </span>
            )}
            {aheadBehind.behind > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                ↓{aheadBehind.behind} behind
              </span>
            )}
          </div>
        )}

        {/* New Terminal button */}
        <button
          onClick={onStartTerminal}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-md bg-green-600 hover:bg-green-500 text-white font-medium transition-colors mb-4"
        >
          <Terminal className="h-4 w-4" />
          New Terminal
        </button>

        {!isMainBranch && (
          <div className="flex gap-2 w-full mb-4">
            <button
              onClick={() => setShowMergeDialog(true)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md border border-blue-500 text-blue-500 hover:bg-blue-500/10 text-sm font-medium transition-colors"
            >
              <GitMerge className="h-4 w-4" />
              Merge to main
            </button>
            <button
              onClick={() => setShowCleanupDialog(true)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md border border-red-500 text-red-500 hover:bg-red-500/10 text-sm font-medium transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              Clean up
            </button>
          </div>
        )}

        {/* Existing sessions */}
        {!loadingSessions && sessions.length > 0 && (
          <div className="text-left">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-2">
              Existing Sessions
            </p>
            <div className="space-y-1">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between p-3 rounded-md border border-border bg-muted/30"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{session.tmuxSessionName}</p>
                    <p className="text-xs text-muted-foreground capitalize">{session.status}</p>
                  </div>
                  <button
                    onClick={onReconnect}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent transition-colors flex-shrink-0 ml-2"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Reconnect
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <MergeToMainDialog
        projectPath={projectPath}
        branchName={displayBranch}
        mainWorktreePath={mainWorktreePath}
        aheadBehind={aheadBehind}
        open={showMergeDialog}
        onClose={() => setShowMergeDialog(false)}
        onMerged={() => { setShowMergeDialog(false); onWorktreeRemoved?.(); }}
      />
      <CleanupWorktreeDialog
        projectPath={projectPath}
        worktreePath={worktreePath}
        branchName={displayBranch}
        open={showCleanupDialog}
        onClose={() => setShowCleanupDialog(false)}
        onCleaned={() => { setShowCleanupDialog(false); onWorktreeRemoved?.(); }}
      />
    </div>
  );
}
