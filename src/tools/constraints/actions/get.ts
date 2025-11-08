/**
 * Retrieve constraints with advanced filtering
 * Uses v_tagged_constraints view for token efficiency
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter } from '../../../database.js';
import { validateCategory } from '../../../utils/validators.js';
import { validateActionParams } from '../../../utils/parameter-validator.js';
import { parseStringArray } from '../../../utils/param-parser.js';
import { getProjectContext } from '../../../utils/project-context.js';
import connectionManager from '../../../utils/connection-manager.js';
import type {
  GetConstraintsParams,
  GetConstraintsResponse,
  TaggedConstraint
} from '../types.js';

/**
 * Retrieve t_constraints with advanced filtering
 * Uses v_tagged_constraints view for token efficiency
 *
 * @param params - Filter parameters
 * @param adapter - Optional database adapter (for testing)
 * @returns Array of t_constraints matching filters
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

      // Build query using v_tagged_constraints view (already filters active=1)
      let query = knex('v_tagged_constraints')
        .where('project_id', projectId);

      // Filter by category
      if (params.category) {
        validateCategory(params.category);
        query = query.where('category', params.category);
      }

      // Filter by layer
      if (params.layer) {
        query = query.where('layer', params.layer);
      }

      // Filter by priority
      if (params.priority) {
        query = query.where('priority', params.priority);
      }

      // Filter by m_tags (OR logic - match ANY tag)
      if (params.tags && params.tags.length > 0) {
        // Parse tags (handles both arrays and JSON strings from MCP)
        const tags = parseStringArray(params.tags);
        query = query.where((builder) => {
          for (const tag of tags) {
            builder.orWhere('tags', 'like', `%${tag}%`);
          }
        });
      }

      // Note: v_tagged_constraints view already orders by priority DESC, category, ts DESC
      // Add limit if provided
      const limit = params.limit || 50;
      query = query.limit(limit);

      // Execute query
      const rows = await query.select('*') as TaggedConstraint[];

      // Parse m_tags from comma-separated to array for consistency
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
