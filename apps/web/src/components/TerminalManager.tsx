import { useEffect, useRef, useState } from 'react';
import { TerminalView } from './TerminalView';
import { WorktreeInfo } from './WorktreeInfo';
import { useAppStore } from '../store';

interface TerminalManagerProps {
  worktrees: Array<{ path: string; branch?: string; head: string }>;
  selectedWorktree: string | null;
}

export function TerminalManager({ worktrees, selectedWorktree }: TerminalManagerProps) {
  const { terminalSessions, removeTerminalSession } = useAppStore();
  const [mountedTerminals, setMountedTerminals] = useState<Set<string>>(new Set());
  const [activeTerminals, setActiveTerminals] = useState<Set<string>>(new Set());

  // Track which terminals have been created
  const createdTerminals = useRef<Set<string>>(new Set());

  // On mount, auto-activate worktrees that have a cached session (page refresh scenario).
  // terminalSessions is synchronously initialized from localStorage before first render.
  useEffect(() => {
    if (terminalSessions.size === 0) return;
    setActiveTerminals((prev) => {
      const next = new Set(prev);
      terminalSessions.forEach((_sessionId, worktreePath) => {
        next.add(worktreePath);
      });
      return next;
    });
  // We only want this to run on mount / when terminalSessions first loads.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When a worktree becomes active (user clicked "New Terminal" or cached session found),
  // mount its TerminalView if not already mounted.
  useEffect(() => {
    if (!selectedWorktree) return;
    if (!activeTerminals.has(selectedWorktree)) return;

    if (!mountedTerminals.has(selectedWorktree)) {
      setMountedTerminals((prev) => new Set(prev).add(selectedWorktree));
      createdTerminals.current.add(selectedWorktree);
    }
  }, [selectedWorktree, activeTerminals, mountedTerminals]);

  // Clean up terminals for worktrees that no longer exist
  useEffect(() => {
    const currentWorktreePaths = new Set(worktrees.map((w) => w.path));
    const terminalsToRemove = Array.from(createdTerminals.current).filter(
      (path) => !currentWorktreePaths.has(path)
    );

    if (terminalsToRemove.length > 0) {
      setMountedTerminals((prev) => {
        const next = new Set(prev);
        terminalsToRemove.forEach((path) => {
          next.delete(path);
          createdTerminals.current.delete(path);
        });
        return next;
      });
      setActiveTerminals((prev) => {
        const next = new Set(prev);
        terminalsToRemove.forEach((path) => next.delete(path));
        return next;
      });
      // Clean up persisted sessions for removed worktrees
      terminalsToRemove.forEach((path) => removeTerminalSession(path));
    }
  }, [worktrees, removeTerminalSession]);

  const handleStartTerminal = (worktreePath: string) => {
    setActiveTerminals((prev) => new Set(prev).add(worktreePath));
    if (!mountedTerminals.has(worktreePath)) {
      setMountedTerminals((prev) => new Set(prev).add(worktreePath));
      createdTerminals.current.add(worktreePath);
    }
  };

  const handleCloseTerminal = (worktreePath: string) => {
    setActiveTerminals((prev) => { const n = new Set(prev); n.delete(worktreePath); return n; });
    setMountedTerminals((prev) => { const n = new Set(prev); n.delete(worktreePath); return n; });
    createdTerminals.current.delete(worktreePath);
    // Remove from persisted store so it doesn't auto-activate on refresh
    removeTerminalSession(worktreePath);
  };

  if (!selectedWorktree) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center">
          <p className="text-lg mb-2">Select a worktree to start</p>
          <p className="text-sm">Choose from the panel on the left</p>
        </div>
      </div>
    );
  }

  // Find the selected worktree's metadata for the info panel
  const selectedWorktreeData = worktrees.find((w) => w.path === selectedWorktree);
  const showInfoPanel = !activeTerminals.has(selectedWorktree);

  return (
    <div className="relative w-full h-full">
      {/* Worktree info panel — shown when no terminal is active for this worktree */}
      {showInfoPanel && (
        <WorktreeInfo
          worktreePath={selectedWorktree}
          branch={selectedWorktreeData?.branch ?? selectedWorktreeData?.head.substring(0, 8) ?? ''}
          onStartTerminal={() => handleStartTerminal(selectedWorktree)}
          onReconnect={() => handleStartTerminal(selectedWorktree)}
        />
      )}

      {/* Mounted terminal views — hidden/shown via CSS to preserve state */}
      {Array.from(mountedTerminals).map((worktreePath) => (
        <div
          key={worktreePath}
          style={{
            display: !showInfoPanel && selectedWorktree === worktreePath ? 'block' : 'none',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100%',
            height: '100%',
          }}
        >
          <TerminalView
            worktreePath={worktreePath}
            onClose={() => handleCloseTerminal(worktreePath)}
            onExited={() => {}}
          />
        </div>
      ))}
    </div>
  );
}
