export interface PullRequest {
  number: number;
  title: string;
  state: 'open' | 'closed' | 'merged';
  author: string;
  branch: string;
  baseBranch: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  mergeable: boolean | null;
  reviewDecision: string | null;
  checksStatus: 'success' | 'failure' | 'pending' | 'neutral' | null;
  labels: string[];
  draft: boolean;
}

interface GitHubPRResponse {
  number: number;
  title: string;
  state: string;
  draft: boolean;
  user: { login: string };
  head: { ref: string; label: string };
  base: { ref: string };
  html_url: string;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  mergeable: boolean | null;
  labels: Array<{ name: string }>;
}

interface GitHubRateLimitResponse {
  resources: {
    core: {
      remaining: number;
      reset: number;
    };
  };
}

export class GitHubService {
  private token: string | null;
  private static instance: GitHubService | null = null;

  constructor() {
    this.token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || null;
  }

  static getInstance(): GitHubService {
    if (!GitHubService.instance) {
      GitHubService.instance = new GitHubService();
    }
    return GitHubService.instance;
  }

  isConfigured(): boolean {
    return this.token !== null;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  private mapPR(pr: GitHubPRResponse): PullRequest {
    let state: 'open' | 'closed' | 'merged' = 'open';
    if (pr.merged_at) {
      state = 'merged';
    } else if (pr.state === 'closed') {
      state = 'closed';
    }

    return {
      number: pr.number,
      title: pr.title,
      state,
      author: pr.user.login,
      branch: pr.head.ref,
      baseBranch: pr.base.ref,
      url: pr.html_url,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      mergeable: pr.mergeable ?? null,
      reviewDecision: null,
      checksStatus: null,
      labels: pr.labels.map((l) => l.name),
      draft: pr.draft
    };
  }

  async getPullRequests(owner: string, repo: string): Promise<PullRequest[]> {
    try {
      const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=open&per_page=100`;
      const response = await fetch(url, { headers: this.buildHeaders(), signal: AbortSignal.timeout(10_000) });

      if (!response.ok) {
        console.warn(`GitHub API error fetching PRs: ${response.status} ${response.statusText}`);
        return [];
      }

      const data = (await response.json()) as GitHubPRResponse[];
      return data.map((pr) => this.mapPR(pr));
    } catch (error) {
      console.warn('Failed to fetch pull requests:', error);
      return [];
    }
  }

  async getPullRequestForBranch(owner: string, repo: string, branch: string): Promise<PullRequest | null> {
    try {
      const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?head=${encodeURIComponent(owner)}:${encodeURIComponent(branch)}&state=open&per_page=10`;
      const response = await fetch(url, { headers: this.buildHeaders(), signal: AbortSignal.timeout(10_000) });

      if (!response.ok) {
        console.warn(`GitHub API error fetching PR for branch: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = (await response.json()) as GitHubPRResponse[];
      if (data.length === 0) return null;
      return this.mapPR(data[0]);
    } catch (error) {
      console.warn('Failed to fetch pull request for branch:', error);
      return null;
    }
  }

  async getRateLimit(): Promise<{ remaining: number; reset: number } | null> {
    try {
      const response = await fetch('https://api.github.com/rate_limit', { headers: this.buildHeaders(), signal: AbortSignal.timeout(10_000) });
      if (!response.ok) return null;
      const data = (await response.json()) as GitHubRateLimitResponse;
      return {
        remaining: data.resources.core.remaining,
        reset: data.resources.core.reset
      };
    } catch {
      return null;
    }
  }
}
