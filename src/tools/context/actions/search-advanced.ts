/**
 * Advanced query composition with complex filtering capabilities
 * Supports multiple filter types, sorting, and pagination
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter } from '../../../database.js';
import { getProjectContext } from '../../../utils/project-context.js';
import {
  validateActionParams,
  parseStringArray,
  parseRelativeTime,
  validatePaginationParams,
  validateSortParams
} from '../internal/validation.js';
import type { SearchAdvancedParams, SearchAdvancedResponse, TaggedDecision } from '../types.js';

/**
 * Advanced search with complex filtering
 *
 * @param params - Advanced search parameters with filtering, sorting, pagination
 * @param adapter - Optional database adapter (for testing)
 * @returns Filtered decisions with total count for pagination
 */
export async function searchAdvanced(
  params: SearchAdvancedParams = {},
  adapter?: DatabaseAdapter
): Promise<SearchAdvancedResponse> {
  // Validate parameters
  validateActionParams('decision', 'search_advanced', params);

  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  // Validate project context
  const projectId = getProjectContext().getProjectId();

  try {
    // Build base query using v_tagged_decisions view
    let query = knex('v_tagged_decisions').where('project_id', projectId);

    // Filter by layers (OR relationship)
    if (params.layers && params.layers.length > 0) {
      query = query.whereIn('layer', params.layers);
    }

    // Filter by tags_all (AND relationship - must have ALL tags)
    if (params.tags_all && params.tags_all.length > 0) {
      const tagsAll = parseStringArray(params.tags_all);
      for (const tag of tagsAll) {
        query = query.where((builder) => {
          builder.where('tags', 'like', `%${tag}%`).orWhere('tags', tag);
        });
      }
    }

    // Filter by tags_any (OR relationship - must have ANY tag)
    if (params.tags_any && params.tags_any.length > 0) {
      const tagsAny = parseStringArray(params.tags_any);
      query = query.where((builder) => {
        for (const tag of tagsAny) {
          builder.orWhere('tags', 'like', `%${tag}%`).orWhere('tags', tag);
        }
      });
    }

    // Exclude tags
    if (params.exclude_tags && params.exclude_tags.length > 0) {
      const excludeTags = parseStringArray(params.exclude_tags);
      for (const tag of excludeTags) {
        query = query.where((builder) => {
          builder.whereNull('tags')
            .orWhere((subBuilder) => {
              subBuilder.where('tags', 'not like', `%${tag}%`)
                .where('tags', '!=', tag);
            });
        });
      }
    }

    // Filter by scopes with wildcard support
    if (params.scopes && params.scopes.length > 0) {
      const scopes = parseStringArray(params.scopes);
      query = query.where((builder) => {
        for (const scope of scopes) {
          if (scope.includes('*')) {
            // Wildcard pattern - convert to LIKE pattern
            const likePattern = scope.replace(/\*/g, '%');
            builder.orWhere('scopes', 'like', `%${likePattern}%`)
              .orWhere('scopes', likePattern);
          } else {
            // Exact match
            builder.orWhere('scopes', 'like', `%${scope}%`)
              .orWhere('scopes', scope);
          }
        }
      });
    }

    // Temporal filtering - updated_after
    if (params.updated_after) {
      const timestamp = parseRelativeTime(params.updated_after);
      if (timestamp !== null) {
        query = query.whereRaw('unixepoch(updated) >= ?', [timestamp]);
      } else {
        throw new Error(`Invalid updated_after format: ${params.updated_after}. Use ISO timestamp or relative time like "7d", "2h", "30m"`);
      }
    }

    // Temporal filtering - updated_before
    if (params.updated_before) {
      const timestamp = parseRelativeTime(params.updated_before);
      if (timestamp !== null) {
        query = query.whereRaw('unixepoch(updated) <= ?', [timestamp]);
      } else {
        throw new Error(`Invalid updated_before format: ${params.updated_before}. Use ISO timestamp or relative time like "7d", "2h", "30m"`);
      }
    }

    // Filter by decided_by (OR relationship)
    if (params.decided_by && params.decided_by.length > 0) {
      query = query.whereIn('decided_by', params.decided_by);
    }

    // Filter by statuses (OR relationship)
    if (params.statuses && params.statuses.length > 0) {
      query = query.whereIn('status', params.statuses);
    }

    // Full-text search in value field
    if (params.search_text) {
      query = query.where('value', 'like', `%${params.search_text}%`);
    }

    // Count total matching records (before pagination)
    const countQuery = query.clone().count('* as total');
    const countResult = await countQuery.first() as { total: number };
    const totalCount = countResult.total;

    // Sorting
    const sortBy = params.sort_by || 'updated';
    const sortOrder = params.sort_order || 'desc';

    // Validate sort parameters
    validateSortParams(sortBy, sortOrder);

    query = query.orderBy(sortBy, sortOrder);

    // Pagination
    const limit = params.limit !== undefined ? params.limit : 20;
    const offset = params.offset || 0;

    // Validate pagination parameters
    validatePaginationParams(limit, offset);

    query = query.limit(limit).offset(offset);

    // Execute query
    const rows = await query.select('*') as TaggedDecision[];

    return {
      decisions: rows,
      count: rows.length,
      total_count: totalCount
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to execute advanced search: ${message}`);
  }
}
