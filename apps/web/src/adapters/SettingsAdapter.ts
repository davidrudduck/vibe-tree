import { getServerHttpUrl } from '../services/portDiscovery';
import { getAuthHeaders } from '../services/authService';
import type { SettingsAdapter, TerminalSettings } from '@vibetree/ui';

export class RestSettingsAdapter implements SettingsAdapter {
  private async fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
    const httpUrl = await getServerHttpUrl();
    const response = await fetch(`${httpUrl}${path}`, {
      ...options,
      headers: {
        ...getAuthHeaders(),
        ...options?.headers,
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async getTerminalSettings(): Promise<TerminalSettings> {
    return this.fetchJson('/api/settings/terminal');
  }

  async updateTerminalSettings(updates: Partial<TerminalSettings>): Promise<TerminalSettings> {
    return this.fetchJson('/api/settings/terminal', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async resetTerminalSettings(): Promise<TerminalSettings> {
    return this.fetchJson('/api/settings/terminal/reset', {
      method: 'POST',
    });
  }

  async getWorktreeBasePath(): Promise<string | null> {
    const data = await this.fetchJson<{ path: string | null }>('/api/settings/worktree-base-path');
    return data.path;
  }

  async setWorktreeBasePath(path: string): Promise<void> {
    await this.fetchJson('/api/settings/worktree-base-path', {
      method: 'PUT',
      body: JSON.stringify({ path }),
    });
  }
}
