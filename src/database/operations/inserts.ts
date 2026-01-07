/**
 * Database insert operations module
 */

import { Knex } from 'knex';
import type { DatabaseAdapter } from '../../adapters/index.js';
import { getProjectContext } from '../../utils/project-context.js';
import { validateNoCaseInsensitiveDuplicate } from '../../utils/case-insensitive-validator.js';

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
 * Get or create agent by name (DEPRECATED - v4.0)
 *
 * Agent tracking has been removed in v4.0 as the messaging system was removed
 * in v3.6.5 and agent attribution is no longer needed.
 *
 * This function is kept for backward compatibility but always returns null.
 * Callers should be updated to not rely on agent IDs.
 *
 * @deprecated Agent tracking removed in v4.0
 */
export async function getOrCreateAgent(
  _adapter: DatabaseAdapter,
  _name: string,
  _trx?: Knex.Transaction
): Promise<number | null> {
  // Agent tracking removed in v4.0 - return null
  return null;
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

  await knex('m_context_keys').insert({ key_name: key }).onConflict('key_name').ignore();

  const result = await knex('m_context_keys').where({ key_name: key }).first('id');

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
  await knex('v4_files')
    .insert({ project_id: projectId, path })
    .onConflict(['project_id', 'path'])  // Composite conflict resolution (v3.7.3)
    .ignore();

  const result = await knex('v4_files')
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

  // Case-insensitive duplicate check (v4.0.2)
  // Prevents creating 'DRY' when 'dry' already exists
  await validateNoCaseInsensitiveDuplicate(
    knex, 'm_tags', 'name', name, 'tag', { project_id: projectId }
  );

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

  // Case-insensitive duplicate check (v4.0.2)
  // Prevents creating 'Global' when 'global' already exists
  await validateNoCaseInsensitiveDuplicate(
    knex, 'm_scopes', 'name', name, 'scope', { project_id: projectId }
  );

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
 *
 * @param decidedBy - @deprecated Agent tracking removed in v4.0. Parameter kept for backward compatibility but ignored.
 */
export async function addDecisionContext(
  adapter: DatabaseAdapter,
  decisionKey: string,
  rationale: string,
  alternatives: string | null = null,
  tradeoffs: string | null = null,
  decidedBy: string | null = null,  // @deprecated - ignored in v4.0
  relatedTaskId: number | null = null,
  relatedConstraintId: number | null = null
): Promise<number> {
  // Validate JSON inputs
  validateAlternativesJson(alternatives);
  validateTradeoffsJson(tradeoffs);

  const knex = adapter.getKnex();

  // Get decision key ID
  const keyId = await getOrCreateContextKey(adapter, decisionKey);

  // Note: decidedBy/agent_id removed in v4.0 - agent tracking no longer used

  // Get project ID (v4 multi-project support)
  const projectId = getProjectContext().getProjectId();

  // Insert context
  const [id] = await knex('t_decision_context').insert({
    decision_key_id: keyId,
    project_id: projectId,  // Required v4 field
    rationale,
    alternatives_considered: alternatives,
    tradeoffs,
    related_task_id: relatedTaskId,
    related_constraint_id: relatedConstraintId,
    decision_date: Math.floor(Date.now() / 1000),
    ts: Math.floor(Date.now() / 1000),
  });

  return id;
}
