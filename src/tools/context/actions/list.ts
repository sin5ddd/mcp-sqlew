/**
 * Get context decisions with advanced filtering
 * Uses cross-database query functions for portability
 * Supports filtering by status, layer, tags, and scope
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter } from '../../../database.js';
import { getProjectContext } from '../../../utils/project-context.js';
import { debugLog } from '../../../utils/debug-logger.js';
import { STRING_TO_STATUS } from '../../../constants.js';
import { validateActionParams } from '../internal/validation.js';
import { getTaggedDecisions } from '../../../utils/view-queries.js';
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
    const refProject = await knex('v4_projects')
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
    // Get all decisions then filter in JavaScript
    let rows = await getTaggedDecisions(knex) as TaggedDecision[];

    // Filter by project_id
    rows = rows.filter(r => r.project_id === projectId);

    // Filter by status
    if (params.status) {
      if (!STRING_TO_STATUS[params.status]) {
        throw new Error(`Invalid status: ${params.status}`);
      }
      rows = rows.filter(r => r.status === params.status);
    }

    // Filter by layer
    if (params.layer) {
      rows = rows.filter(r => r.layer === params.layer);
    }

    // Filter by scope
    if (params.scope) {
      rows = rows.filter(r => r.scopes && r.scopes.includes(params.scope!));
    }

    // Filter by tags
    if (params.tags && params.tags.length > 0) {
      const tagMatch = params.tag_match || 'OR';

      if (tagMatch === 'AND') {
        // All tags must be present
        rows = rows.filter(r => {
          if (!r.tags) return false;
          return params.tags!.every(tag => r.tags!.includes(tag));
        });
      } else {
        // Any tag must be present (OR)
        rows = rows.filter(r => {
          if (!r.tags) return false;
          return params.tags!.some(tag => r.tags!.includes(tag));
        });
      }
    }

    // Sort by most recent (updated field is already a datetime string)
    rows.sort((a, b) => {
      const dateA = new Date(a.updated).getTime();
      const dateB = new Date(b.updated).getTime();
      return dateB - dateA; // desc
    });

    return {
      decisions: rows,
      count: rows.length
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get context: ${message}`);
  }
}
