import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { createId } from '@paralleldrive/cuid2';

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  name: text('name').notNull(),
  path: text('path').notNull().unique(),
  lastOpened: integer('last_opened', { mode: 'timestamp' }),
  isFavorite: integer('is_favorite', { mode: 'boolean' }).default(false),
  status: text('status').default('active'), // active, archived
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const projectSettings = sqliteTable('project_settings', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  value: text('value', { mode: 'json' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type ProjectSetting = typeof projectSettings.$inferSelect;
export type NewProjectSetting = typeof projectSettings.$inferInsert;
