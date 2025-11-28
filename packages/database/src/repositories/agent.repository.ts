import { eq, and, desc } from 'drizzle-orm';
import { DrizzleDB } from '../connection';
import {
  codingAgents,
  agentPrompts,
  CodingAgent,
  NewCodingAgent,
  AgentPrompt,
  NewAgentPrompt,
} from '../schema/agents';
import { createId } from '@paralleldrive/cuid2';

export class AgentRepository {
  constructor(private db: DrizzleDB) {}

  // Coding Agents methods

  /**
   * Find all coding agents
   */
  findAllAgents(): CodingAgent[] {
    return this.db.select().from(codingAgents).orderBy(desc(codingAgents.createdAt)).all();
  }

  /**
   * Find an agent by ID
   */
  findAgentById(id: string): CodingAgent | undefined {
    return this.db.select().from(codingAgents).where(eq(codingAgents.id, id)).get();
  }

  /**
   * Find an agent by name
   */
  findAgentByName(name: string): CodingAgent | undefined {
    return this.db.select().from(codingAgents).where(eq(codingAgents.name, name)).get();
  }

  /**
   * Get the default agent
   */
  getDefaultAgent(): CodingAgent | undefined {
    return this.db
      .select()
      .from(codingAgents)
      .where(eq(codingAgents.isDefault, true))
      .get();
  }

  /**
   * Create a new coding agent
   */
  createAgent(data: Omit<NewCodingAgent, 'id' | 'createdAt' | 'updatedAt'>): CodingAgent {
    const now = new Date();

    // If this agent is set as default, unset other defaults
    if (data.isDefault) {
      this.db
        .update(codingAgents)
        .set({ isDefault: false })
        .where(eq(codingAgents.isDefault, true))
        .run();
    }

    const agent = this.db
      .insert(codingAgents)
      .values({
        id: createId(),
        name: data.name,
        type: data.type,
        endpoint: data.endpoint,
        config: data.config,
        hookConfig: data.hookConfig,
        isDefault: data.isDefault ?? false,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    return agent;
  }

  /**
   * Update a coding agent
   */
  updateAgent(
    id: string,
    data: Partial<Omit<CodingAgent, 'id' | 'createdAt' | 'updatedAt'>>
  ): CodingAgent | undefined {
    // If setting this agent as default, unset other defaults
    if (data.isDefault) {
      this.db
        .update(codingAgents)
        .set({ isDefault: false })
        .where(eq(codingAgents.isDefault, true))
        .run();
    }

    const updated = this.db
      .update(codingAgents)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(codingAgents.id, id))
      .returning()
      .get();

    return updated;
  }

  /**
   * Delete a coding agent
   */
  deleteAgent(id: string): boolean {
    const result = this.db.delete(codingAgents).where(eq(codingAgents.id, id)).run();
    return result.changes > 0;
  }

  /**
   * Set an agent as default
   */
  setDefaultAgent(id: string): CodingAgent | undefined {
    // Unset all defaults
    this.db
      .update(codingAgents)
      .set({ isDefault: false })
      .where(eq(codingAgents.isDefault, true))
      .run();

    // Set the specified agent as default
    return this.updateAgent(id, { isDefault: true });
  }

  // Agent Prompts methods

  /**
   * Find all prompts
   */
  findAllPrompts(): AgentPrompt[] {
    return this.db.select().from(agentPrompts).orderBy(desc(agentPrompts.createdAt)).all();
  }

  /**
   * Find prompts by agent ID
   */
  findPromptsByAgent(agentId: string): AgentPrompt[] {
    return this.db
      .select()
      .from(agentPrompts)
      .where(eq(agentPrompts.agentId, agentId))
      .orderBy(desc(agentPrompts.createdAt))
      .all();
  }

  /**
   * Find prompts by category
   */
  findPromptsByCategory(category: string): AgentPrompt[] {
    return this.db
      .select()
      .from(agentPrompts)
      .where(eq(agentPrompts.category, category))
      .orderBy(desc(agentPrompts.createdAt))
      .all();
  }

  /**
   * Find a prompt by ID
   */
  findPromptById(id: string): AgentPrompt | undefined {
    return this.db.select().from(agentPrompts).where(eq(agentPrompts.id, id)).get();
  }

  /**
   * Get default prompts
   */
  getDefaultPrompts(): AgentPrompt[] {
    return this.db
      .select()
      .from(agentPrompts)
      .where(eq(agentPrompts.isDefault, true))
      .all();
  }

  /**
   * Create a new prompt
   */
  createPrompt(data: Omit<NewAgentPrompt, 'id' | 'createdAt'>): AgentPrompt {
    const prompt = this.db
      .insert(agentPrompts)
      .values({
        id: createId(),
        agentId: data.agentId,
        name: data.name,
        category: data.category,
        content: data.content,
        isDefault: data.isDefault ?? false,
        createdAt: new Date(),
      })
      .returning()
      .get();

    return prompt;
  }

  /**
   * Update a prompt
   */
  updatePrompt(
    id: string,
    data: Partial<Omit<AgentPrompt, 'id' | 'createdAt'>>
  ): AgentPrompt | undefined {
    const updated = this.db
      .update(agentPrompts)
      .set(data)
      .where(eq(agentPrompts.id, id))
      .returning()
      .get();

    return updated;
  }

  /**
   * Delete a prompt
   */
  deletePrompt(id: string): boolean {
    const result = this.db.delete(agentPrompts).where(eq(agentPrompts.id, id)).run();
    return result.changes > 0;
  }

  /**
   * Delete all prompts for an agent
   */
  deletePromptsByAgent(agentId: string): void {
    this.db.delete(agentPrompts).where(eq(agentPrompts.agentId, agentId)).run();
  }
}
