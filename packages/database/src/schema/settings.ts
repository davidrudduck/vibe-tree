import { sqliteTable, text, integer, unique } from 'drizzle-orm/sqlite-core';
import { createId } from '@paralleldrive/cuid2';

export const systemSettings = sqliteTable(
  'system_settings',
  {
    id: text('id').primaryKey().$defaultFn(() => createId()),
    category: text('category').notNull(), // 'terminal', 'general', 'appearance'
    key: text('key').notNull(),
    value: text('value', { mode: 'json' }),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => ({
    categoryKeyUnique: unique().on(table.category, table.key),
  })
);

export type SystemSetting = typeof systemSettings.$inferSelect;
export type NewSystemSetting = typeof systemSettings.$inferInsert;

// Type for terminal settings
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
  tabStopWidth: 4,
  setLocaleVariables: true,
};
