/**
 * Database insert operations module
 */

import { Knex } from 'knex';
import type { DatabaseAdapter } from '../../adapters/index.js';

/**
 * Validate JSON structure for alternatives array
 */
function validateAlternativesJson(alternatives: string | null): void {
  if (alternatives === null || alternatives === undefined) return;

  try {
    const parsed = JSON.parse(alternatives);
    if (!Array.isArray(parsed)) {
      throw new Error('alternatives_considered must be a JSON array');
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('alternatives_considered contains invalid JSON');
    }
    throw error;
  }
}

/**
 * Validate JSON structure for tradeoffs object
 */
function validateTradeoffsJson(tradeoffs: string | null): void {
  if (tradeoffs === null || tradeoffs === undefined) return;

  try {
    const parsed = JSON.parse(tradeoffs);
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('tradeoffs must be a JSON object');
    }
    if (parsed.pros !== undefined && !Array.isArray(parsed.pros)) {
      throw new Error('tradeoffs.pros must be an array');
    }
    if (parsed.cons !== undefined && !Array.isArray(parsed.cons)) {
      throw new Error('tradeoffs.cons must be an array');
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('tradeoffs contains invalid JSON');
    }
    throw error;
  }
}

/**
 * Get or create agent by name (simplified registry pattern)
 *
 * Creates a simple registry of agent names for attribution purposes.
 * No pooling, no reuse logic - each unique name gets exactly one record.
 *
 * - Empty/whitespace names: Generate unique generic-N name
 * - Named agents: Use exact name provided
 */
export async function getOrCreateAgent(
  adapter: DatabaseAdapter,
  name: string,
  trx?: Knex.Transaction
): Promise<number> {
  const knex = trx || adapter.getKnex();
  const now = Math.floor(Date.now() / 1000);

  // Handle empty names by generating unique generic-N identifier
  let agentName = name;
  if (!name || name.trim().length === 0) {
    // Find highest generic-N number and increment
    const maxGeneric = await knex('m_agents')
      .where('name', 'like', 'generic-%')
      .orderBy('name', 'desc')
      .first('name');

    let nextNumber = 1;
    if (maxGeneric && maxGeneric.name) {
      const match = maxGeneric.name.match(/^generic-(\d+)$/);
      if (match) {
        nextNumber = parseInt(match[1], 10) + 1;
      }
    }

    agentName = `generic-${nextNumber}`;
  }

  // Insert or update agent with upsert pattern
  // This handles both new agents and existing agents
  await knex('m_agents')
    .insert({
      name: agentName,
      last_active_ts: now
    })
    .onConflict('name')
    .merge({ last_active_ts: now });

  // Get the agent ID
  const result = await knex('m_agents')
    .where({ name: agentName })
    .first('id');

  if (!result) {
    throw new Error(`Failed to get or create agent: ${agentName}`);
  }

  return result.id;
}

/**
 * Get or create context key by name
 */
export async function getOrCreateContextKey(
  adapter: DatabaseAdapter,
  key: string,
  trx?: Knex.Transaction
): Promise<number> {
  const knex = trx || adapter.getKnex();

  await knex('m_context_keys').insert({ key }).onConflict('key').ignore();

  const result = await knex('m_context_keys').where({ key }).first('id');

  if (!result) {
    throw new Error(`Failed to get or create context key: ${key}`);
  }

  return result.id;
}

/**
 * Get or create file by path
 */
export async function getOrCreateFile(
  adapter: DatabaseAdapter,
  projectId: number,
  path: string,
  trx?: Knex.Transaction
): Promise<number> {
  const knex = trx || adapter.getKnex();

  // Insert with composite key (project_id, path)
  await knex('m_files')
    .insert({ project_id: projectId, path })
    .onConflict(['project_id', 'path'])  // Composite conflict resolution (v3.7.3)
    .ignore();

  const result = await knex('m_files')
    .where({ project_id: projectId, path })  // Filter by both columns (v3.7.3)
    .first('id');

  if (!result) {
    throw new Error(`Failed to get or create file: ${path} (project: ${projectId})`);
  }

  return result.id;
}

/**
 * Get or create tag by name
 */
export async function getOrCreateTag(
  adapter: DatabaseAdapter,
  projectId: number,
  name: string,
  trx?: Knex.Transaction
): Promise<number> {
  const knex = trx || adapter.getKnex();

  // Insert with composite key (project_id, name)
  await knex('m_tags')
    .insert({ project_id: projectId, name })
    .onConflict(['project_id', 'name'])  // Composite conflict resolution (v3.7.3)
    .ignore();

  const result = await knex('m_tags')
    .where({ project_id: projectId, name })  // Filter by both columns (v3.7.3)
    .first('id');

  if (!result) {
    throw new Error(`Failed to get or create tag: ${name} (project: ${projectId})`);
  }

  return result.id;
}

/**
 * Get or create scope by name
 */
export async function getOrCreateScope(
  adapter: DatabaseAdapter,
  projectId: number,
  name: string,
  trx?: Knex.Transaction
): Promise<number> {
  const knex = trx || adapter.getKnex();

  // Insert with composite key (project_id, name)
  await knex('m_scopes')
    .insert({ project_id: projectId, name })
    .onConflict(['project_id', 'name'])  // Composite conflict resolution (v3.7.3)
    .ignore();

  const result = await knex('m_scopes')
    .where({ project_id: projectId, name })  // Filter by both columns (v3.7.3)
    .first('id');

  if (!result) {
    throw new Error(`Failed to get or create scope: ${name} (project: ${projectId})`);
  }

  return result.id;
}

/**
 * Get or create category ID
 */
export async function getOrCreateCategoryId(
  adapter: DatabaseAdapter,
  category: string,
  trx?: Knex.Transaction
): Promise<number> {
  const knex = trx || adapter.getKnex();

  await knex('m_constraint_categories').insert({ name: category }).onConflict('name').ignore();

  const result = await knex('m_constraint_categories').where({ name: category }).first('id');

  if (!result) {
    throw new Error(`Failed to get or create category: ${category}`);
  }

  return result.id;
}

/**
 * Add decision context to a decision
 */
export async function addDecisionContext(
  adapter: DatabaseAdapter,
  decisionKey: string,
  rationale: string,
  alternatives: string | null = null,
  tradeoffs: string | null = null,
  decidedBy: string | null = null,
  relatedTaskId: number | null = null,
  relatedConstraintId: number | null = null
): Promise<number> {
  // Validate JSON inputs
  validateAlternativesJson(alternatives);
  validateTradeoffsJson(tradeoffs);

  const knex = adapter.getKnex();

  // Get decision key ID
  const keyId = await getOrCreateContextKey(adapter, decisionKey);

  // Get agent ID if provided
  let agentId: number | null = null;
  if (decidedBy) {
    agentId = await getOrCreateAgent(adapter, decidedBy);
  }

  // Insert context
  const [id] = await knex('t_decision_context').insert({
    decision_key_id: keyId,
    rationale,
    alternatives_considered: alternatives,
    tradeoffs,
    agent_id: agentId,
    related_task_id: relatedTaskId,
    related_constraint_id: relatedConstraintId,
    decision_date: Math.floor(Date.now() / 1000),
    ts: Math.floor(Date.now() / 1000),
  });

  return id;
}
