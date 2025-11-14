/**
 * Suggest Tool - Internal Query Builders
 *
 * Common decision query patterns used across suggest actions.
 * Handles multi-project support, numeric/string values, and tag aggregation.
 */

import type { Knex } from 'knex';
import { getProjectContext } from '../../../utils/project-context.js';
import { formatGroupConcatTags } from '../../../utils/tag-parser.js';
import type { DecisionCandidate } from '../types.js';

/**
 * Build base decision query with all necessary JOINs
 *
 * Returns a query builder for t_decisions with:
 * - m_context_keys (for key names)
 * - m_layers (for layer names)
 * - t_decision_tags + m_tags (for tags with GROUP_CONCAT)
 * - t_decisions_numeric (for numeric values with COALESCE)
 *
 * Includes multi-project support (v3.7.0+)
 *
 * @param knex - Knex instance (or transaction context)
 * @param options - Query options
 * @returns Knex query builder
 */
export function buildDecisionQuery(
  knex: Knex,
  options: {
    distinct?: boolean;
    includeTagCount?: boolean;
  } = {}
): Knex.QueryBuilder {
  const projectId = getProjectContext().getProjectId();
  const { distinct = false, includeTagCount = false } = options;

  const selectFields = [
    'd.key_id',
    'ck.key',
    knex.raw('COALESCE(NULLIF(d.value, \'\'), dn.value) as value'),  // NULLIF converts empty string to NULL
    'l.name as layer',
    'd.ts',
    formatGroupConcatTags(knex, distinct),
  ];

  if (includeTagCount) {
    selectFields.push(knex.raw('COUNT(DISTINCT ti.tag_name) as tag_count'));
  }

  // Use LEFT JOIN for m_layers to include decisions without layer
  return knex('t_decisions as d')
    .select(...selectFields)
    .join('m_context_keys as ck', 'd.key_id', 'ck.id')
    .leftJoin('m_layers as l', 'd.layer_id', 'l.id')
    .leftJoin('t_decision_tags as dt', function() {
      this.on('dt.decision_key_id', '=', 'd.key_id')
          .andOn('dt.project_id', '=', knex.raw('?', [projectId]));
    })
    .leftJoin('m_tags as t', 'dt.tag_id', 't.id')
    .leftJoin('t_decisions_numeric as dn', function() {
      this.on('dn.key_id', '=', 'd.key_id')
          .andOn('dn.project_id', '=', knex.raw('?', [projectId]));
    })
    .where('d.project_id', projectId)
    .where('d.status', 1)
    .groupBy('d.key_id');
}

/**
 * Build decision query for tag-based suggestions (optimized with m_tag_index)
 *
 * Uses denormalized m_tag_index table for faster tag lookups.
 *
 * @param knex - Knex instance (or transaction context)
 * @param tags - Array of tag names to match
 * @param layer - Optional layer filter
 * @returns Knex query builder
 */
export function buildTagIndexQuery(
  knex: Knex,
  tags: string[],
  layer?: string
): Knex.QueryBuilder {
  const projectId = getProjectContext().getProjectId();

  let query = knex('m_tag_index as ti')
    .select(
      'd.key_id',
      'ck.key',
      knex.raw('COALESCE(d.value, dn.value) as value'),
      'l.name as layer',
      'd.ts',
      formatGroupConcatTags(knex, true),  // DISTINCT for m_tag_index queries
      knex.raw('COUNT(DISTINCT ti.tag_name) as tag_count')
    )
    .join('t_decisions as d', 'ti.decision_id', 'd.key_id')
    .join('m_context_keys as ck', 'd.key_id', 'ck.id')
    .join('m_layers as l', 'd.layer_id', 'l.id')
    .leftJoin('t_decision_tags as dt', 'd.key_id', 'dt.decision_key_id')
    .leftJoin('m_tags as t', 'dt.tag_id', 't.id')
    .leftJoin('t_decisions_numeric as dn', 'd.key_id', 'dn.key_id')
    .whereIn('ti.tag_name', tags)
    .where('d.status', 1);

  if (layer) {
    query = query.where('l.name', layer);
  }

  return query
    .groupBy('d.key_id')
    .orderBy('tag_count', 'desc');
}

/**
 * Build decision query with optional tag filtering
 *
 * Used by by_context action for hybrid suggestions.
 *
 * @param knex - Knex instance (or transaction context)
 * @param tags - Optional array of tags to filter by
 * @returns Knex query builder
 */
export function buildContextQuery(
  knex: Knex,
  tags?: string[]
): Knex.QueryBuilder {
  const projectId = getProjectContext().getProjectId();

  let query = buildDecisionQuery(knex, { distinct: true });

  // If tags provided, filter to only tag matches using m_tag_index
  if (tags && tags.length > 0) {
    query = query.whereExists(function(this: any) {
      this.select(knex.raw('1'))
        .from('m_tag_index as ti')
        .whereRaw('ti.decision_id = d.key_id')
        .whereIn('ti.tag_name', tags);
    });
  }

  return query;
}

/**
 * Check if decision key exists (exact match)
 *
 * @param knex - Knex instance (or transaction context)
 * @param key - Decision key to check
 * @returns Existing decision or null
 */
export async function checkExactMatch(
  knex: Knex,
  key: string
): Promise<{ key: string; value: string | number; version: string } | null> {
  const projectId = getProjectContext().getProjectId();

  // Check string decisions (t_decisions)
  const stringDecision = await knex('t_decisions as d')
    .select(
      'd.key_id',
      'ck.key',
      'd.value',
      'd.version'
    )
    .join('m_context_keys as ck', 'd.key_id', 'ck.id')
    .where('ck.key', key)
    .where('d.project_id', projectId)
    .where('d.status', 1)
    .first();

  if (stringDecision) {
    return {
      key: stringDecision.key,
      value: stringDecision.value,
      version: stringDecision.version,
    };
  }

  // Check numeric decisions (t_decisions_numeric)
  const numericDecision = await knex('t_decisions_numeric as dn')
    .select(
      'dn.key_id',
      'ck.key',
      'dn.value',
      'dn.version'
    )
    .join('m_context_keys as ck', 'dn.key_id', 'ck.id')
    .where('ck.key', key)
    .where('dn.project_id', projectId)
    .where('dn.status', 1)
    .first();

  if (numericDecision) {
    return {
      key: numericDecision.key,
      value: numericDecision.value,
      version: numericDecision.version,
    };
  }

  return null;
}
