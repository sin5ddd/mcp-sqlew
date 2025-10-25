/**
 * Database connection and initialization module
 * Handles database setup with Knex.js and DatabaseAdapter pattern
 */

import { Knex } from 'knex';
import knexConfig from './knexfile.js';
import { DatabaseAdapter, createDatabaseAdapter, SQLiteAdapter } from './adapters/index.js';

// Global adapter instance
let adapterInstance: DatabaseAdapter | null = null;

/**
 * Initialize database with adapter pattern
 */
export async function initializeDatabase(
  config?: {
    databaseType?: 'sqlite' | 'postgresql' | 'mysql';
    connection?: any;
    configPath?: string;
  }
): Promise<DatabaseAdapter> {
  if (adapterInstance) {
    return adapterInstance;
  }

  const dbType = config?.databaseType || 'sqlite';
  const adapter = createDatabaseAdapter(dbType);

  // Use config from knexfile or provided config
  const knexConnConfig = config?.connection
    ? { ...knexConfig.development, connection: config.connection }
    : knexConfig.development;

  await adapter.connect(knexConnConfig);

  // Run migrations if needed
  const knex = adapter.getKnex();
  await knex.migrate.latest();

  console.log('✓ Database initialized with Knex adapter');

  adapterInstance = adapter;
  return adapter;
}

/**
 * Get current database adapter
 */
export function getAdapter(): DatabaseAdapter {
  if (!adapterInstance) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return adapterInstance;
}

/**
 * Close database connection
 */
export async function closeDatabase(): Promise<void> {
  if (adapterInstance) {
    await adapterInstance.disconnect();
    adapterInstance = null;
    console.log('✓ Database connection closed');
  }
}

// ============================================================================
// Helper Functions for Master Table Management (Async)
// ============================================================================

/**
 * Get or create agent by name
 */
export async function getOrCreateAgent(
  adapter: DatabaseAdapter,
  name: string,
  trx?: Knex.Transaction
): Promise<number> {
  const knex = trx || adapter.getKnex();

  // Try to insert (will be ignored if exists)
  await knex('m_agents').insert({ name }).onConflict('name').ignore();

  // Get the ID
  const result = await knex('m_agents').where({ name }).first('id');

  if (!result) {
    throw new Error(`Failed to get or create agent: ${name}`);
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
  path: string,
  trx?: Knex.Transaction
): Promise<number> {
  const knex = trx || adapter.getKnex();

  await knex('m_files').insert({ path }).onConflict('path').ignore();

  const result = await knex('m_files').where({ path }).first('id');

  if (!result) {
    throw new Error(`Failed to get or create file: ${path}`);
  }

  return result.id;
}

/**
 * Get or create tag by name
 */
export async function getOrCreateTag(
  adapter: DatabaseAdapter,
  name: string,
  trx?: Knex.Transaction
): Promise<number> {
  const knex = trx || adapter.getKnex();

  await knex('m_tags').insert({ name }).onConflict('name').ignore();

  const result = await knex('m_tags').where({ name }).first('id');

  if (!result) {
    throw new Error(`Failed to get or create tag: ${name}`);
  }

  return result.id;
}

/**
 * Get or create scope by name
 */
export async function getOrCreateScope(
  adapter: DatabaseAdapter,
  name: string,
  trx?: Knex.Transaction
): Promise<number> {
  const knex = trx || adapter.getKnex();

  await knex('m_scopes').insert({ name }).onConflict('name').ignore();

  const result = await knex('m_scopes').where({ name }).first('id');

  if (!result) {
    throw new Error(`Failed to get or create scope: ${name}`);
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
 * Get layer ID by name
 */
export async function getLayerId(
  adapter: DatabaseAdapter,
  name: string,
  trx?: Knex.Transaction
): Promise<number | null> {
  const knex = trx || adapter.getKnex();
  const result = await knex('m_layers').where({ name }).first('id');
  return result ? result.id : null;
}

/**
 * Get constraint category ID by name
 */
export async function getCategoryId(
  adapter: DatabaseAdapter,
  name: string,
  trx?: Knex.Transaction
): Promise<number | null> {
  const knex = trx || adapter.getKnex();
  const result = await knex('m_constraint_categories').where({ name }).first('id');
  return result ? result.id : null;
}

// ============================================================================
// Configuration Management (Async)
// ============================================================================

/**
 * Get configuration value from m_config table
 */
export async function getConfigValue(
  adapter: DatabaseAdapter,
  key: string
): Promise<string | null> {
  const knex = adapter.getKnex();
  const result = await knex('m_config').where({ key }).first('value');
  return result ? result.value : null;
}

/**
 * Set configuration value in m_config table
 */
export async function setConfigValue(
  adapter: DatabaseAdapter,
  key: string,
  value: string | number | boolean
): Promise<void> {
  const knex = adapter.getKnex();
  const stringValue = String(value);
  await knex('m_config')
    .insert({ key, value: stringValue })
    .onConflict('key')
    .merge({ value: stringValue });
}

/**
 * Get configuration value as boolean
 */
export async function getConfigBool(
  adapter: DatabaseAdapter,
  key: string,
  defaultValue: boolean = false
): Promise<boolean> {
  const value = await getConfigValue(adapter, key);
  if (value === null) return defaultValue;
  return value === '1' || value.toLowerCase() === 'true';
}

/**
 * Get configuration value as integer
 */
export async function getConfigInt(
  adapter: DatabaseAdapter,
  key: string,
  defaultValue: number = 0
): Promise<number> {
  const value = await getConfigValue(adapter, key);
  if (value === null) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Get all configuration as an object
 */
export async function getAllConfig(adapter: DatabaseAdapter): Promise<Record<string, string>> {
  const knex = adapter.getKnex();
  const rows = await knex('m_config').select('key', 'value');
  const config: Record<string, string> = {};
  for (const row of rows) {
    config[row.key] = row.value;
  }
  return config;
}

// ============================================================================
// Decision Context Management (Async - v3.2.2)
// ============================================================================

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
    decided_by_agent_id: agentId,
    related_task_id: relatedTaskId,
    related_constraint_id: relatedConstraintId,
    decision_date: Math.floor(Date.now() / 1000),
  });

  return id;
}

/**
 * Get decision with context
 */
export async function getDecisionWithContext(
  adapter: DatabaseAdapter,
  decisionKey: string
): Promise<{
  key: string;
  value: string;
  version: string;
  status: string;
  layer: string | null;
  decided_by: string | null;
  updated: string;
  context: Array<{
    id: number;
    rationale: string;
    alternatives_considered: string | null;
    tradeoffs: string | null;
    decided_by: string | null;
    decision_date: string;
    related_task_id: number | null;
    related_constraint_id: number | null;
  }>;
} | null> {
  const knex = adapter.getKnex();

  // First get the decision
  const decision = await knex('t_decisions as d')
    .join('m_context_keys as k', 'd.key_id', 'k.id')
    .leftJoin('m_layers as l', 'd.layer_id', 'l.id')
    .leftJoin('m_agents as a', 'd.agent_id', 'a.id')
    .where('k.key', decisionKey)
    .select(
      'k.key',
      'd.value',
      'd.version',
      knex.raw(`CASE d.status WHEN 1 THEN 'active' WHEN 2 THEN 'deprecated' ELSE 'draft' END as status`),
      'l.name as layer',
      'a.name as decided_by',
      knex.raw(`datetime(d.ts, 'unixepoch') as updated`)
    )
    .first();

  if (!decision) return null;

  // Get all contexts for this decision
  const contexts = await knex('t_decision_context as dc')
    .join('m_context_keys as k', 'dc.decision_key_id', 'k.id')
    .leftJoin('m_agents as a', 'dc.decided_by_agent_id', 'a.id')
    .where('k.key', decisionKey)
    .select(
      'dc.id',
      'dc.rationale',
      'dc.alternatives_considered',
      'dc.tradeoffs',
      'a.name as decided_by',
      knex.raw(`datetime(dc.decision_date, 'unixepoch') as decision_date`),
      'dc.related_task_id',
      'dc.related_constraint_id'
    )
    .orderBy('dc.decision_date', 'desc');

  return {
    ...decision,
    context: contexts,
  };
}

/**
 * List decision contexts with optional filters
 */
export async function listDecisionContexts(
  adapter: DatabaseAdapter,
  filters?: {
    decisionKey?: string;
    relatedTaskId?: number;
    relatedConstraintId?: number;
    decidedBy?: string;
    limit?: number;
    offset?: number;
  }
): Promise<Array<{
  id: number;
  decision_key: string;
  rationale: string;
  alternatives_considered: string | null;
  tradeoffs: string | null;
  decided_by: string | null;
  decision_date: string;
  related_task_id: number | null;
  related_constraint_id: number | null;
}>> {
  const knex = adapter.getKnex();

  let query = knex('t_decision_context as dc')
    .join('m_context_keys as k', 'dc.decision_key_id', 'k.id')
    .leftJoin('m_agents as a', 'dc.decided_by_agent_id', 'a.id')
    .select(
      'dc.id',
      'k.key as decision_key',
      'dc.rationale',
      'dc.alternatives_considered',
      'dc.tradeoffs',
      'a.name as decided_by',
      knex.raw(`datetime(dc.decision_date, 'unixepoch') as decision_date`),
      'dc.related_task_id',
      'dc.related_constraint_id'
    );

  if (filters?.decisionKey) {
    query = query.where('k.key', filters.decisionKey);
  }

  if (filters?.relatedTaskId !== undefined) {
    query = query.where('dc.related_task_id', filters.relatedTaskId);
  }

  if (filters?.relatedConstraintId !== undefined) {
    query = query.where('dc.related_constraint_id', filters.relatedConstraintId);
  }

  if (filters?.decidedBy) {
    query = query.where('a.name', filters.decidedBy);
  }

  query = query.orderBy('dc.decision_date', 'desc');

  if (filters?.limit) {
    query = query.limit(filters.limit);
  }

  if (filters?.offset) {
    query = query.offset(filters.offset);
  }

  return await query;
}

/**
 * Backwards compatibility alias for getAdapter
 */
export function getDatabase(): DatabaseAdapter {
  return getAdapter();
}

/**
 * Execute a function within a database transaction
 */
export async function transaction<T>(
  callback: (trx: Knex.Transaction) => Promise<T>
): Promise<T> {
  const adapter = getAdapter();
  const knex = adapter.getKnex();
  return await knex.transaction(callback);
}

// Export adapter types for tool functions
export { DatabaseAdapter };
