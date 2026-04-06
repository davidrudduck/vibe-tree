import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const terminalSessions = sqliteTable('terminal_sessions', {
  id: text('id').primaryKey(),
  projectPath: text('project_path').notNull(),
  worktreePath: text('worktree_path').notNull(),
  tmuxSessionName: text('tmux_session_name').notNull(),
  status: text('status').notNull().default('active'), // 'active', 'disconnected', 'dead'
  isExternal: integer('is_external', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  lastActivity: integer('last_activity', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export type TerminalSession = typeof terminalSessions.$inferSelect;
export type NewTerminalSession = typeof terminalSessions.$inferInsert;
