/**
 * Get context decisions with advanced filtering
 * Uses v_tagged_decisions view for token efficiency
 * Supports filtering by status, layer, tags, and scope
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter } from '../../../database.js';
import { getProjectContext } from '../../../utils/project-context.js';
import { debugLog } from '../../../utils/debug-logger.js';
import { STRING_TO_STATUS } from '../../../constants.js';
import { validateActionParams } from '../internal/validation.js';
import type { GetContextParams, GetContextResponse, TaggedDecision } from '../types.js';

/**
 * Get context decisions with advanced filtering
 *
 * @param params - Filter parameters
 * @param adapter - Optional database adapter (for testing)
 * @returns Array of decisions with metadata
 */
export async function getContext(
  params: GetContextParams = {},
  adapter?: DatabaseAdapter
): Promise<GetContextResponse> {
  // Validate parameters
  try {
    validateActionParams('decision', 'list', params);
  } catch (error) {
    throw error;
  }

  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  // Determine which project to query (current or referenced)
  let projectId: number;

  if (params._reference_project) {
    // Cross-project query: look up the referenced project
    const refProject = await knex('m_projects')
      .where({ name: params._reference_project })
      .first<{ id: number; name: string }>();

    if (!refProject) {
      throw new Error(`Referenced project "${params._reference_project}" not found`);
    }

    projectId = refProject.id;
    debugLog('INFO', 'Cross-project query', {
      currentProject: getProjectContext().getProjectName(),
      referencedProject: params._reference_project,
      projectId
    });
  } else {
    // Normal query: use current project
    projectId = getProjectContext().getProjectId();
  }

  try {
    // Build query dynamically based on filters
    let query = knex('v_tagged_decisions').where('project_id', projectId);

    // Filter by status
    if (params.status) {
      if (!STRING_TO_STATUS[params.status]) {
        throw new Error(`Invalid status: ${params.status}`);
      }
      query = query.where('status', params.status);
    }

    // Filter by layer
    if (params.layer) {
      query = query.where('layer', params.layer);
    }

    // Filter by scope
    if (params.scope) {
      // Use LIKE for comma-separated scopes
      query = query.where('scopes', 'like', `%${params.scope}%`);
    }

    // Filter by tags
    if (params.tags && params.tags.length > 0) {
      const tagMatch = params.tag_match || 'OR';

      if (tagMatch === 'AND') {
        // All tags must be present
        for (const tag of params.tags) {
          query = query.where('tags', 'like', `%${tag}%`);
        }
      } else {
        // Any tag must be present (OR)
        query = query.where((builder) => {
          for (const tag of params.tags!) {
            builder.orWhere('tags', 'like', `%${tag}%`);
          }
        });
      }
    }

    // Order by most recent
    query = query.orderBy('updated', 'desc');

    // Execute query
    const rows = await query.select('*') as TaggedDecision[];

    return {
      decisions: rows,
      count: rows.length
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get context: ${message}`);
  }
}
