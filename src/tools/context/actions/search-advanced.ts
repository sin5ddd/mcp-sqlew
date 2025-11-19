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
import { getTaggedDecisions } from '../../../utils/view-queries.js';
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
    // Get all decisions then filter in JavaScript
    let rows = await getTaggedDecisions(knex) as TaggedDecision[];

    // Filter by project_id
    rows = rows.filter(r => r.project_id === projectId);

    // Filter by layers (OR relationship)
    if (params.layers && params.layers.length > 0) {
      rows = rows.filter(r => r.layer && params.layers!.includes(r.layer));
    }

    // Filter by tags_all (AND relationship - must have ALL tags)
    if (params.tags_all && params.tags_all.length > 0) {
      const tagsAll = parseStringArray(params.tags_all);
      rows = rows.filter(r => {
        if (!r.tags) return false;
        return tagsAll.every(tag => r.tags!.includes(tag));
      });
    }

    // Filter by tags_any (OR relationship - must have ANY tag)
    if (params.tags_any && params.tags_any.length > 0) {
      const tagsAny = parseStringArray(params.tags_any);
      rows = rows.filter(r => {
        if (!r.tags) return false;
        return tagsAny.some(tag => r.tags!.includes(tag));
      });
    }

    // Exclude tags
    if (params.exclude_tags && params.exclude_tags.length > 0) {
      const excludeTags = parseStringArray(params.exclude_tags);
      rows = rows.filter(r => {
        if (!r.tags) return true; // No tags means no excluded tags
        return !excludeTags.some(tag => r.tags!.includes(tag));
      });
    }

    // Filter by scopes with wildcard support
    if (params.scopes && params.scopes.length > 0) {
      const scopes = parseStringArray(params.scopes);
      rows = rows.filter(r => {
        if (!r.scopes) return false;
        return scopes.some(scope => {
          if (scope.includes('*')) {
            // Wildcard pattern - convert to regex
            const regexPattern = scope.replace(/\*/g, '.*');
            const regex = new RegExp(regexPattern);
            return r.scopes!.split(',').some(s => regex.test(s.trim()));
          } else {
            // Exact match
            return r.scopes!.includes(scope);
          }
        });
      });
    }

    // Temporal filtering - updated_after
    if (params.updated_after) {
      const timestamp = parseRelativeTime(params.updated_after);
      if (timestamp !== null) {
        rows = rows.filter(r => {
          const updatedTs = new Date(r.updated).getTime() / 1000;
          return updatedTs >= timestamp;
        });
      } else {
        throw new Error(`Invalid updated_after format: ${params.updated_after}. Use ISO timestamp or relative time like "7d", "2h", "30m"`);
      }
    }

    // Temporal filtering - updated_before
    if (params.updated_before) {
      const timestamp = parseRelativeTime(params.updated_before);
      if (timestamp !== null) {
        rows = rows.filter(r => {
          const updatedTs = new Date(r.updated).getTime() / 1000;
          return updatedTs <= timestamp;
        });
      } else {
        throw new Error(`Invalid updated_before format: ${params.updated_before}. Use ISO timestamp or relative time like "7d", "2h", "30m"`);
      }
    }

    // Filter by decided_by (OR relationship)
    if (params.decided_by && params.decided_by.length > 0) {
      rows = rows.filter(r => r.decided_by && params.decided_by!.includes(r.decided_by));
    }

    // Filter by statuses (OR relationship)
    if (params.statuses && params.statuses.length > 0) {
      rows = rows.filter(r => params.statuses!.includes(r.status));
    }

    // Full-text search in value field
    if (params.search_text) {
      rows = rows.filter(r => r.value.includes(params.search_text!));
    }

    // Count total matching records (before pagination)
    const totalCount = rows.length;

    // Sorting
    const sortBy = params.sort_by || 'updated';
    const sortOrder = params.sort_order || 'desc';

    // Validate sort parameters
    validateSortParams(sortBy, sortOrder);

    rows.sort((a, b) => {
      let aVal: any;
      let bVal: any;

      if (sortBy === 'updated') {
        aVal = new Date(a.updated).getTime();
        bVal = new Date(b.updated).getTime();
      } else {
        aVal = a[sortBy as keyof TaggedDecision];
        bVal = b[sortBy as keyof TaggedDecision];
      }

      if (sortOrder === 'asc') {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      } else {
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
      }
    });

    // Pagination
    const limit = params.limit !== undefined ? params.limit : 20;
    const offset = params.offset || 0;

    // Validate pagination parameters
    validatePaginationParams(limit, offset);

    rows = rows.slice(offset, offset + limit);

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
