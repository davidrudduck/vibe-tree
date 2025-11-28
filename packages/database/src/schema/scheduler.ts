import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { createId } from '@paralleldrive/cuid2';
import { projects } from './projects';

export const schedulerHistory = sqliteTable('scheduler_history', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
  command: text('command').notNull(),
  delayMs: integer('delay_ms').notNull(),
  repeat: integer('repeat', { mode: 'boolean' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export type SchedulerHistory = typeof schedulerHistory.$inferSelect;
export type NewSchedulerHistory = typeof schedulerHistory.$inferInsert;
