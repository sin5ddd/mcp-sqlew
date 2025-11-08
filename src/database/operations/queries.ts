/**
 * Database query operations module
 */

import { Knex } from 'knex';
import type { DatabaseAdapter } from '../../adapters/index.js';

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
    .leftJoin('m_agents as a', 'dc.agent_id', 'a.id')
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
    .leftJoin('m_agents as a', 'dc.agent_id', 'a.id')
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
