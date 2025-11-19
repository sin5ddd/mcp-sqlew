/**
 * Search for decisions by tags with AND/OR logic
 * Provides flexible tag-based filtering with status and layer support
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter, getLayerId } from '../../../database.js';
import { getProjectContext } from '../../../utils/project-context.js';
import { STRING_TO_STATUS } from '../../../constants.js';
import { validateActionParams, parseStringArray } from '../internal/validation.js';
import { getTaggedDecisions } from '../../../utils/view-queries.js';
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

    // Get all decisions then filter in JavaScript
    let rows = await getTaggedDecisions(knex) as TaggedDecision[];

    // Filter by project_id
    rows = rows.filter(r => r.project_id === projectId);

    // Apply tag filtering based on match mode
    if (matchMode === 'AND') {
      // All tags must be present
      rows = rows.filter(r => {
        if (!r.tags) return false;
        return tags.every(tag => r.tags!.includes(tag));
      });
    } else if (matchMode === 'OR') {
      // Any tag must be present
      rows = rows.filter(r => {
        if (!r.tags) return false;
        return tags.some(tag => r.tags!.includes(tag));
      });
    } else {
      throw new Error(`Invalid match_mode: ${matchMode}. Must be 'AND' or 'OR'`);
    }

    // Optional status filter
    if (params.status) {
      if (!STRING_TO_STATUS[params.status]) {
        throw new Error(`Invalid status: ${params.status}. Must be 'active', 'deprecated', or 'draft'`);
      }
      rows = rows.filter(r => r.status === params.status);
    }

    // Optional layer filter
    if (params.layer) {
      // Validate layer exists
      const layerId = await getLayerId(actualAdapter, params.layer);
      if (layerId === null) {
        throw new Error(`Invalid layer: ${params.layer}. Must be one of: presentation, business, data, infrastructure, cross-cutting`);
      }
      rows = rows.filter(r => r.layer === params.layer);
    }

    // Sort by most recent
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
    throw new Error(`Failed to search by tags: ${message}`);
  }
}
