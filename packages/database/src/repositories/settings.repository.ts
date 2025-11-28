import { eq, and } from 'drizzle-orm';
import { DrizzleDB } from '../connection';
import {
  systemSettings,
  SystemSetting,
  TerminalSettings,
  DEFAULT_TERMINAL_SETTINGS,
} from '../schema/settings';
import { createId } from '@paralleldrive/cuid2';

export type SettingCategory = 'terminal' | 'general' | 'appearance' | 'coding_agents';

export class SettingsRepository {
  constructor(private db: DrizzleDB) {}

  /**
   * Get a setting value by category and key
   */
  get<T = unknown>(category: SettingCategory, key: string): T | undefined {
    const result = this.db
      .select()
      .from(systemSettings)
      .where(and(eq(systemSettings.category, category), eq(systemSettings.key, key)))
      .get();

    return result?.value as T | undefined;
  }

  /**
   * Get all settings for a category
   */
  getByCategory(category: SettingCategory): Record<string, unknown> {
    const results = this.db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.category, category))
      .all();

    return results.reduce((acc, setting) => {
      acc[setting.key] = setting.value;
      return acc;
    }, {} as Record<string, unknown>);
  }

  /**
   * Set a setting value
   */
  set<T = unknown>(category: SettingCategory, key: string, value: T): SystemSetting {
    const existing = this.db
      .select()
      .from(systemSettings)
      .where(and(eq(systemSettings.category, category), eq(systemSettings.key, key)))
      .get();

    if (existing) {
      const updated = this.db
        .update(systemSettings)
        .set({ value, updatedAt: new Date() })
        .where(eq(systemSettings.id, existing.id))
        .returning()
        .get();

      return updated!;
    } else {
      const newSetting = this.db
        .insert(systemSettings)
        .values({
          id: createId(),
          category,
          key,
          value,
          updatedAt: new Date(),
        })
        .returning()
        .get();

      return newSetting;
    }
  }

  /**
   * Delete a setting
   */
  delete(category: SettingCategory, key: string): boolean {
    const result = this.db
      .delete(systemSettings)
      .where(and(eq(systemSettings.category, category), eq(systemSettings.key, key)))
      .run();

    return result.changes > 0;
  }

  /**
   * Clear all settings for a category
   */
  clearCategory(category: SettingCategory): void {
    this.db.delete(systemSettings).where(eq(systemSettings.category, category)).run();
  }

  // Terminal settings convenience methods

  /**
   * Get terminal settings with defaults
   */
  getTerminalSettings(): TerminalSettings {
    const stored = this.get<Partial<TerminalSettings>>('terminal', 'preferences');
    return { ...DEFAULT_TERMINAL_SETTINGS, ...stored };
  }

  /**
   * Update terminal settings (partial update)
   */
  updateTerminalSettings(updates: Partial<TerminalSettings>): TerminalSettings {
    const current = this.getTerminalSettings();
    const updated = { ...current, ...updates };
    this.set('terminal', 'preferences', updated);
    return updated;
  }

  /**
   * Reset terminal settings to defaults
   */
  resetTerminalSettings(): TerminalSettings {
    this.set('terminal', 'preferences', DEFAULT_TERMINAL_SETTINGS);
    return DEFAULT_TERMINAL_SETTINGS;
  }

  // Coding agents settings

  /**
   * Get coding agent configuration
   */
  getCodingAgentConfig(agentName: string): Record<string, unknown> | undefined {
    return this.get('coding_agents', agentName);
  }

  /**
   * Set coding agent configuration
   */
  setCodingAgentConfig(agentName: string, config: Record<string, unknown>): SystemSetting {
    return this.set('coding_agents', agentName, config);
  }
}
