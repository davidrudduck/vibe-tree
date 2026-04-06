export interface TerminalSettings {
  fontFamily: string;
  fontSize: number;
  cursorBlink: boolean;
  scrollback: number;
  tabStopWidth: number;
  setLocaleVariables: boolean;
}

export const DEFAULT_TERMINAL_SETTINGS: TerminalSettings = {
  fontFamily: 'Menlo, Monaco, "Courier New", monospace',
  fontSize: 14,
  cursorBlink: true,
  scrollback: 10000,
  tabStopWidth: 8,
  setLocaleVariables: true,
};

export interface Project {
  id: string;
  path: string;
  name: string;
  isFavorite: boolean;
}

export interface SettingsAdapter {
  getTerminalSettings(): Promise<TerminalSettings>;
  updateTerminalSettings(updates: Partial<TerminalSettings>): Promise<TerminalSettings>;
  resetTerminalSettings(): Promise<TerminalSettings>;
  getWorktreeBasePath(): Promise<string | null>;
  setWorktreeBasePath(path: string): Promise<void>;
  getGitHubToken(): Promise<{ configured: boolean; masked: string | null }>;
  setGitHubToken(token: string): Promise<void>;
  getProjects(): Promise<Project[]>;
  removeProject(path: string): Promise<void>;
}
