/**
 * Suggest Tool - Constraint Query Builders
 *
 * Common constraint query patterns used for constraint suggest actions.
 * Handles multi-project support, tag aggregation, and category filtering.
 */

import type { Knex } from 'knex';
import { getProjectContext } from '../../../utils/project-context.js';

/**
 * Constraint candidate structure (before scoring)
 */
export interface ConstraintCandidate {
  constraint_id: number;
  constraint_text: string;
  category: string;
  layer: string | null;
  priority: number;
  ts: number;
  tags: string | null;  // Comma-separated from GROUP_CONCAT
}

/**
 * Build base constraint query with all necessary JOINs
 *
 * Returns a query builder for v4_constraints with:
 * - v4_constraint_categories (for category names)
 * - v4_layers (for layer names)
 * - v4_constraint_tags + v4_tags (for tags with GROUP_CONCAT)
 *
 * Includes multi-project support (v3.7.0+)
 *
 * @param knex - Knex instance (or transaction context)
 * @param options - Query options
 * @returns Knex query builder
 */
export function buildConstraintQuery(
  knex: Knex,
  options: {
    distinct?: boolean;
  } = {}
): Knex.QueryBuilder {
  const projectId = getProjectContext().getProjectId();
  const { distinct = false } = options;

  // Build GROUP_CONCAT for tags (with optional DISTINCT)
  const tagConcat = distinct
    ? knex.raw('GROUP_CONCAT(DISTINCT t.name) as tags')
    : knex.raw('GROUP_CONCAT(t.name) as tags');

  return knex('v4_constraints as c')
    .select(
      'c.id as constraint_id',
      'c.constraint_text',
      'cc.name as category',
      'l.name as layer',
      'c.priority',
      'c.ts',
      tagConcat
    )
    .join('v4_constraint_categories as cc', 'c.category_id', 'cc.id')
    .leftJoin('v4_layers as l', 'c.layer_id', 'l.id')
    .leftJoin('v4_constraint_tags as ct', 'c.id', 'ct.constraint_id')
    .leftJoin('v4_tags as t', 'ct.tag_id', 't.id')
    .where('c.project_id', projectId)
    .where('c.active', 1)
    .groupBy('c.id');
}

/**
 * Check for exact constraint text match within a category
 *
 * @param knex - Knex instance (or transaction context)
 * @param text - Constraint text to check
 * @param category - Optional category to filter by
 * @returns Existing constraint or null
 */
export async function checkExactConstraintMatch(
  knex: Knex,
  text: string,
  category?: string
): Promise<ConstraintCandidate | null> {
  const projectId = getProjectContext().getProjectId();

  let query = knex('v4_constraints as c')
    .select(
      'c.id as constraint_id',
      'c.constraint_text',
      'cc.name as category',
      'l.name as layer',
      'c.priority',
      'c.ts',
      knex.raw('GROUP_CONCAT(DISTINCT t.name) as tags')
    )
    .join('v4_constraint_categories as cc', 'c.category_id', 'cc.id')
    .leftJoin('v4_layers as l', 'c.layer_id', 'l.id')
    .leftJoin('v4_constraint_tags as ct', 'c.id', 'ct.constraint_id')
    .leftJoin('v4_tags as t', 'ct.tag_id', 't.id')
    .where('c.constraint_text', text)
    .where('c.project_id', projectId)
    .where('c.active', 1)
    .groupBy('c.id');

  if (category) {
    query = query.where('cc.name', category);
  }

  const result = await query.first();

  if (!result) {
    return null;
  }

  return result as ConstraintCandidate;
}

/**
 * Parse comma-separated tags string to array
 *
 * Handles null/undefined input and trims whitespace from each tag.
 *
 * @param tagString - Comma-separated tags string from GROUP_CONCAT
 * @returns Array of tag names (empty array if no tags)
 */
export function parseConstraintTags(tagString: string | null): string[] {
  if (!tagString) {
    return [];
  }
  return tagString
    .split(',')
    .map(tag => tag.trim())
    .filter(tag => tag.length > 0);
}
