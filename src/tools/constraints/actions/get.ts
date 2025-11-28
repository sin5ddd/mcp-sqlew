/**
 * Retrieve constraints with advanced filtering
 * Uses JOIN queries instead of database views for cross-DB compatibility
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter } from '../../../database.js';
import { validateCategory } from '../../../utils/validators.js';
import { validateActionParams } from '../../../utils/parameter-validator.js';
import { parseStringArray } from '../../../utils/param-parser.js';
import { getProjectContext } from '../../../utils/project-context.js';
import connectionManager from '../../../utils/connection-manager.js';
import { UniversalKnex } from '../../../utils/universal-knex.js';
import type {
  GetConstraintsParams,
  GetConstraintsResponse,
  TaggedConstraint
} from '../types.js';

/**
 * Retrieve v4_constraints with advanced filtering
 * Uses JOIN queries for cross-database compatibility (no views)
 *
 * @param params - Filter parameters
 * @param adapter - Optional database adapter (for testing)
 * @returns Array of v4_constraints matching filters
 */
export async function getConstraints(
  params: GetConstraintsParams,
  adapter?: DatabaseAdapter
): Promise<GetConstraintsResponse> {
  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  try {
    return await connectionManager.executeWithRetry(async () => {
      // Fail-fast project_id validation (Constraint #29)
      const projectId = getProjectContext().getProjectId();

      // Validate parameters
      validateActionParams('constraint', 'get', params);

      const db = new UniversalKnex(knex);

      // Build query using JOINs (no views - cross-DB compatible)
      let query = knex('v4_constraints as c')
        .join('v4_constraint_categories as cat', 'c.category_id', 'cat.id')
        .leftJoin('v4_layers as l', 'c.layer_id', 'l.id')
        .where('c.project_id', projectId)
        .where('c.active', db.boolTrue());

      // Filter by category
      if (params.category) {
        validateCategory(params.category);
        query = query.where('cat.name', params.category);
      }

      // Filter by layer
      if (params.layer) {
        query = query.where('l.name', params.layer);
      }

      // Filter by priority
      if (params.priority) {
        // Convert priority string to integer for DB query
        const priorityMap: Record<string, number> = {
          low: 1, medium: 2, high: 3, critical: 4
        };
        const priorityInt = priorityMap[params.priority];
        if (priorityInt !== undefined) {
          query = query.where('c.priority', priorityInt);
        }
      }

      // Filter by tags (OR logic - match ANY tag)
      if (params.tags && params.tags.length > 0) {
        const tags = parseStringArray(params.tags);
        query = query.whereExists(function() {
          this.select(knex.raw('1'))
            .from('v4_constraint_tags as ct')
            .join('v4_tags as t', 'ct.tag_id', 't.id')
            .whereRaw('ct.constraint_id = c.id')
            .whereIn('t.name', tags);
        });
      }

      // Order by priority DESC, category, ts DESC
      query = query
        .orderBy('c.priority', 'desc')
        .orderBy('cat.name', 'asc')
        .orderBy('c.ts', 'desc');

      // Add limit
      const limit = params.limit || 50;
      query = query.limit(limit);

      // Select columns with tags subquery
      const rows = await query.select([
        'c.id',
        'c.project_id',
        'cat.name as category',
        'l.name as layer',
        'c.constraint_text',
        knex.raw(`CASE c.priority
          WHEN 1 THEN 'low'
          WHEN 2 THEN 'medium'
          WHEN 3 THEN 'high'
          ELSE 'critical'
        END as priority`),
        knex.raw(`${db.dateFunction('c.ts')} as created_at`),
        // Tags subquery
        knex.raw(`(
          SELECT ${db.stringAgg('t2.name', ',')}
          FROM v4_constraint_tags ct2
          JOIN v4_tags t2 ON ct2.tag_id = t2.id
          WHERE ct2.constraint_id = c.id
        ) as tags`),
      ]) as TaggedConstraint[];

      // Parse tags from comma-separated to array for consistency
      const constraints = rows.map(row => ({
        ...row,
        tags: row.tags ? row.tags.split(',') : null,
      })) as any[];

      return {
        constraints,
        count: constraints.length,
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get constraints: ${message}`);
  }
}
