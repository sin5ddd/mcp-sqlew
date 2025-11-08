/**
 * Search for decisions by tags with AND/OR logic
 * Provides flexible tag-based filtering with status and layer support
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter, getLayerId } from '../../../database.js';
import { getProjectContext } from '../../../utils/project-context.js';
import { STRING_TO_STATUS } from '../../../constants.js';
import { validateActionParams, parseStringArray } from '../internal/validation.js';
import type { SearchByTagsParams, SearchByTagsResponse, TaggedDecision } from '../types.js';

/**
 * Search for decisions by tags
 *
 * @param params - Search parameters (tags, match_mode, status, layer)
 * @param adapter - Optional database adapter (for testing)
 * @returns Array of decisions matching tag criteria
 */
export async function searchByTags(
  params: SearchByTagsParams,
  adapter?: DatabaseAdapter
): Promise<SearchByTagsResponse> {
  // Validate parameters
  try {
    validateActionParams('decision', 'search_tags', params);
  } catch (error) {
    throw error;
  }

  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  // Validate project context
  const projectId = getProjectContext().getProjectId();

  // Validate required parameters
  if (!params.tags || params.tags.length === 0) {
    throw new Error('Parameter "tags" is required and must contain at least one tag');
  }

  try {
    // Parse tags (handles both arrays and JSON strings from MCP)
    const tags = parseStringArray(params.tags);

    const matchMode = params.match_mode || 'OR';
    let query = knex('v_tagged_decisions').where('project_id', projectId);

    // Apply tag filtering based on match mode
    if (matchMode === 'AND') {
      // All tags must be present
      for (const tag of tags) {
        query = query.where('tags', 'like', `%${tag}%`);
      }
    } else if (matchMode === 'OR') {
      // Any tag must be present
      query = query.where((builder) => {
        for (const tag of tags) {
          builder.orWhere('tags', 'like', `%${tag}%`);
        }
      });
    } else {
      throw new Error(`Invalid match_mode: ${matchMode}. Must be 'AND' or 'OR'`);
    }

    // Optional status filter
    if (params.status) {
      if (!STRING_TO_STATUS[params.status]) {
        throw new Error(`Invalid status: ${params.status}. Must be 'active', 'deprecated', or 'draft'`);
      }
      query = query.where('status', params.status);
    }

    // Optional layer filter
    if (params.layer) {
      // Validate layer exists
      const layerId = await getLayerId(actualAdapter, params.layer);
      if (layerId === null) {
        throw new Error(`Invalid layer: ${params.layer}. Must be one of: presentation, business, data, infrastructure, cross-cutting`);
      }
      query = query.where('layer', params.layer);
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
    throw new Error(`Failed to search by tags: ${message}`);
  }
}
