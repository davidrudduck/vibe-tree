import { useState, useEffect, useCallback, useRef } from 'react';
import { GitPullRequest, X, RefreshCw } from 'lucide-react';
import { useWebSocket } from '../hooks/useWebSocket';
import { WebSocketAdapter } from '../adapters/WebSocketAdapter';

interface PullRequest {
  number: number;
  title: string;
  head: { ref: string };
  base: { ref: string };
  draft: boolean;
  labels: { name: string; color: string }[];
  user: { login: string };
}

interface GitHubStatus {
  configured: boolean;
  rateLimit?: { remaining: number; reset: number };
}

interface PRStatusPanelProps {
  projectPath: string;
  onClose: () => void;
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
  width: '420px',
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

const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
const RATE_LIMIT_THRESHOLD = 5;

export function PRStatusPanel({ projectPath, onClose }: PRStatusPanelProps) {
  const { getAdapter } = useWebSocket();
  const [prs, setPrs] = useState<PullRequest[]>([]);
  const [githubStatus, setGithubStatus] = useState<GitHubStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cache, setCache] = useState<{ prs: PullRequest[]; fetchedAt: number } | null>(null);
  const [usingCache, setUsingCache] = useState(false);

  // Use refs for cache/status to avoid dependency loop in fetchData
  const githubStatusRef = useRef(githubStatus);
  const cacheRef = useRef(cache);
  githubStatusRef.current = githubStatus;
  cacheRef.current = cache;

  const fetchData = useCallback(async () => {
    const adapter = getAdapter() as WebSocketAdapter | null;
    if (!adapter) return;

    // Skip fetch if rate limit is low and cache is fresh
    const currentStatus = githubStatusRef.current;
    const currentCache = cacheRef.current;
    if (
      currentStatus?.rateLimit &&
      currentStatus.rateLimit.remaining < RATE_LIMIT_THRESHOLD &&
      currentCache &&
      Date.now() - currentCache.fetchedAt < CACHE_TTL_MS
    ) {
      setPrs(currentCache.prs);
      setUsingCache(true);
      return;
    }

    setLoading(true);
    setError(null);
    setUsingCache(false);
    try {
      const [status, pulls] = await Promise.all([
        adapter.getGitHubStatus(),
        adapter.getPullRequests(projectPath),
      ]);
      setGithubStatus(status);
      if (status.configured) {
        setPrs(pulls);
        setCache({ prs: pulls, fetchedAt: Date.now() });
      }
    } catch (err) {
      console.error('Failed to fetch PR data:', err);
      setError((err as Error).message || 'Failed to fetch pull requests');
      // Fall back to cache if available
      const fallbackCache = cacheRef.current;
      if (fallbackCache) {
        setPrs(fallbackCache.prs);
        setUsingCache(true);
      }
    } finally {
      setLoading(false);
    }
  }, [getAdapter, projectPath]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <div style={overlayStyle} onClick={onClose} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
      <div style={panelStyle} role="dialog" aria-modal="true" aria-label="Pull Requests" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <GitPullRequest size={14} />
            <span style={{ fontWeight: 600, fontSize: '14px' }}>Pull Requests</span>
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              style={iconBtnStyle}
              onClick={fetchData}
              disabled={loading}
              aria-label="Refresh pull requests"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            <button style={iconBtnStyle} onClick={onClose} aria-label="Close PR panel">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {error && (
            <div style={{ padding: '8px 16px', backgroundColor: 'rgba(239,68,68,0.1)', borderBottom: '1px solid rgba(239,68,68,0.3)', fontSize: '12px', color: '#f87171' }}>
              {error}
            </div>
          )}
          {githubStatus === null ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted, #6b7280)', fontSize: '13px' }}>
              Loading...
            </div>
          ) : !githubStatus.configured ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted, #6b7280)', fontSize: '13px' }}>
              Set GITHUB_TOKEN or GH_TOKEN to see PR status
            </div>
          ) : loading && prs.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted, #6b7280)', fontSize: '13px' }}>
              Loading...
            </div>
          ) : prs.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted, #6b7280)', fontSize: '13px' }}>
              No open pull requests
            </div>
          ) : (
            prs.map((pr) => (
              <div
                key={pr.number}
                style={{
                  display: 'flex',
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--border-color, #2a2a2a)',
                  borderLeft: `3px solid ${pr.draft ? '#6b7280' : '#22c55e'}`,
                  gap: '10px',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    #{pr.number} {pr.title}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted, #6b7280)', marginTop: '3px' }}>
                    {pr.head.ref} → {pr.base.ref}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '5px', flexWrap: 'wrap' }}>
                    {pr.draft && (
                      <span style={{
                        fontSize: '10px',
                        padding: '1px 6px',
                        borderRadius: '9999px',
                        backgroundColor: '#3c3c3c',
                        color: '#9ca3af',
                        fontWeight: 500,
                      }}>
                        Draft
                      </span>
                    )}
                    {pr.labels.map((label) => (
                      <span
                        key={label.name}
                        style={{
                          fontSize: '10px',
                          padding: '1px 6px',
                          borderRadius: '9999px',
                          backgroundColor: `#${label.color}33`,
                          color: `#${label.color}`,
                          fontWeight: 500,
                          border: `1px solid #${label.color}66`,
                        }}
                      >
                        {label.name}
                      </span>
                    ))}
                    <span style={{ fontSize: '11px', color: 'var(--text-muted, #6b7280)', marginLeft: 'auto' }}>
                      {pr.user.login}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer: rate limit / cache status */}
        {githubStatus?.configured && (githubStatus.rateLimit || usingCache) && (
          <div style={{
            padding: '8px 16px',
            borderTop: '1px solid var(--border-color, #3c3c3c)',
            fontSize: '11px',
            color: 'var(--text-muted, #6b7280)',
            flexShrink: 0,
            display: 'flex',
            justifyContent: 'space-between',
          }}>
            {githubStatus.rateLimit && (
              <span>API: {githubStatus.rateLimit.remaining} requests remaining</span>
            )}
            {usingCache && <span>Using cached data</span>}
          </div>
        )}
      </div>
    </div>
  );
}
