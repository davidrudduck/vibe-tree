import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { createId } from '@paralleldrive/cuid2';

export const codingAgents = sqliteTable('coding_agents', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  name: text('name').notNull(),
  type: text('type').notNull(), // 'claude', 'gpt', 'cursor', 'custom'
  endpoint: text('endpoint'),
  config: text('config', { mode: 'json' }), // API keys, model, etc.
  hookConfig: text('hook_config', { mode: 'json' }), // Notification hooks
  isDefault: integer('is_default', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const agentPrompts = sqliteTable('agent_prompts', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  agentId: text('agent_id').references(() => codingAgents.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  category: text('category'), // 'system', 'task', 'review', 'custom'
  content: text('content').notNull(),
  isDefault: integer('is_default', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export type CodingAgent = typeof codingAgents.$inferSelect;
export type NewCodingAgent = typeof codingAgents.$inferInsert;
export type AgentPrompt = typeof agentPrompts.$inferSelect;
export type NewAgentPrompt = typeof agentPrompts.$inferInsert;
