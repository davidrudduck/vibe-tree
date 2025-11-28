import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';

const execAsync = promisify(exec);

export interface IDE {
  name: string;
  command: string;
  icon?: string;
}

/**
 * IDE Detection and Management Service
 * Detects installed IDEs and provides methods to open projects in them
 */
export class IdeService {
  private static instance: IdeService | null = null;
  private detectedIDEs: IDE[] = [];

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get singleton instance
   */
  static getInstance(): IdeService {
    if (!IdeService.instance) {
      IdeService.instance = new IdeService();
    }
    return IdeService.instance;
  }

  /**
   * Detect installed IDEs on the current system
   */
  async detectIDEs(): Promise<IDE[]> {
    this.detectedIDEs = [];

    if (process.platform === 'darwin') {
      await this.detectMacIDEs();
    } else if (process.platform === 'win32') {
      await this.detectWindowsIDEs();
    } else {
      await this.detectLinuxIDEs();
    }

    return this.detectedIDEs;
  }

  /**
   * Get cached list of detected IDEs
   * Call detectIDEs() first to populate
   */
  getDetectedIDEs(): IDE[] {
    return this.detectedIDEs;
  }

  /**
   * Open a path in a specific IDE
   */
  async openInIDE(ideName: string, targetPath: string): Promise<{ success: boolean; error?: string }> {
    const ide = this.detectedIDEs.find(i => i.name === ideName);
    if (!ide) {
      return { success: false, error: 'IDE not found' };
    }

    try {
      const command = `${ide.command} "${targetPath}"`;
      await execAsync(command);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to open IDE'
      };
    }
  }

  /**
   * Detect IDEs on macOS
   */
  private async detectMacIDEs() {
    const ides = [
      {
        name: 'Cursor',
        path: '/Applications/Cursor.app',
        command: 'open -a Cursor'
      },
      {
        name: 'Visual Studio Code',
        path: '/Applications/Visual Studio Code.app',
        command: 'open -a "Visual Studio Code"'
      },
      {
        name: 'VSCode',
        path: '/Applications/VSCode.app',
        command: 'open -a VSCode'
      }
    ];

    for (const ide of ides) {
      if (fs.existsSync(ide.path)) {
        this.detectedIDEs.push({
          name: ide.name,
          command: ide.command
        });
      }
    }

    // Also check for command line tools
    try {
      await execAsync('which cursor');
      if (!this.detectedIDEs.find(ide => ide.name === 'Cursor')) {
        this.detectedIDEs.push({
          name: 'Cursor',
          command: 'cursor'
        });
      }
    } catch {
      // IDE not found, continue
    }

    try {
      await execAsync('which code');
      if (!this.detectedIDEs.find(ide => ide.name.includes('Visual Studio Code'))) {
        this.detectedIDEs.push({
          name: 'Visual Studio Code',
          command: 'code'
        });
      }
    } catch {
      // IDE not found, continue
    }
  }

  /**
   * Detect IDEs on Windows
   */
  private async detectWindowsIDEs() {
    const commonPaths = [
      {
        name: 'Cursor',
        paths: [
          process.env.LOCALAPPDATA + '\\Programs\\cursor\\Cursor.exe',
          'C:\\Program Files\\Cursor\\Cursor.exe'
        ]
      },
      {
        name: 'Visual Studio Code',
        paths: [
          process.env.LOCALAPPDATA + '\\Programs\\Microsoft VS Code\\Code.exe',
          'C:\\Program Files\\Microsoft VS Code\\Code.exe',
          'C:\\Program Files (x86)\\Microsoft VS Code\\Code.exe'
        ]
      }
    ];

    for (const ide of commonPaths) {
      for (const idePath of ide.paths) {
        if (idePath && fs.existsSync(idePath)) {
          this.detectedIDEs.push({
            name: ide.name,
            command: `"${idePath}"`
          });
          break;
        }
      }
    }

    // Check PATH
    try {
      await execAsync('where cursor');
      if (!this.detectedIDEs.find(ide => ide.name === 'Cursor')) {
        this.detectedIDEs.push({
          name: 'Cursor',
          command: 'cursor'
        });
      }
    } catch {
      // IDE not found, continue
    }

    try {
      await execAsync('where code');
      if (!this.detectedIDEs.find(ide => ide.name.includes('Visual Studio Code'))) {
        this.detectedIDEs.push({
          name: 'Visual Studio Code',
          command: 'code'
        });
      }
    } catch {
      // IDE not found, continue
    }
  }

  /**
   * Detect IDEs on Linux
   */
  private async detectLinuxIDEs() {
    // Check for command line tools
    try {
      await execAsync('which cursor');
      this.detectedIDEs.push({
        name: 'Cursor',
        command: 'cursor'
      });
    } catch {
      // IDE not found, continue
    }

    try {
      await execAsync('which code');
      this.detectedIDEs.push({
        name: 'Visual Studio Code',
        command: 'code'
      });
    } catch {
      // IDE not found, continue
    }
  }
}
