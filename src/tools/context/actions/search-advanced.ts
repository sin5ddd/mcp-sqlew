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
import { normalizeParams } from '../../../utils/param-normalizer.js';
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
  // Normalize aliases: after → updated_after, before → updated_before
  const normalizedParams = normalizeParams(params, {
    after: 'updated_after',
    before: 'updated_before'
  }) as SearchAdvancedParams;

  // Validate parameters
  validateActionParams('decision', 'search_advanced', normalizedParams);

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
    if (normalizedParams.layers && normalizedParams.layers.length > 0) {
      rows = rows.filter(r => r.layer && normalizedParams.layers!.includes(r.layer));
    }

    // Filter by tags_all (AND relationship - must have ALL tags)
    if (normalizedParams.tags_all && normalizedParams.tags_all.length > 0) {
      const tagsAll = parseStringArray(normalizedParams.tags_all);
      rows = rows.filter(r => {
        if (!r.tags) return false;
        return tagsAll.every(tag => r.tags!.includes(tag));
      });
    }

    // Filter by tags_any (OR relationship - must have ANY tag)
    if (normalizedParams.tags_any && normalizedParams.tags_any.length > 0) {
      const tagsAny = parseStringArray(normalizedParams.tags_any);
      rows = rows.filter(r => {
        if (!r.tags) return false;
        return tagsAny.some(tag => r.tags!.includes(tag));
      });
    }

    // Exclude tags
    if (normalizedParams.exclude_tags && normalizedParams.exclude_tags.length > 0) {
      const excludeTags = parseStringArray(normalizedParams.exclude_tags);
      rows = rows.filter(r => {
        if (!r.tags) return true; // No tags means no excluded tags
        return !excludeTags.some(tag => r.tags!.includes(tag));
      });
    }

    // Filter by scopes with wildcard support
    if (normalizedParams.scopes && normalizedParams.scopes.length > 0) {
      const scopes = parseStringArray(normalizedParams.scopes);
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
    if (normalizedParams.updated_after) {
      const timestamp = parseRelativeTime(normalizedParams.updated_after);
      if (timestamp !== null) {
        rows = rows.filter(r => {
          const updatedTs = new Date(r.updated).getTime() / 1000;
          return updatedTs >= timestamp;
        });
      } else {
        throw new Error(`Invalid updated_after format: ${normalizedParams.updated_after}. Use ISO timestamp or relative time like "7d", "2h", "30m"`);
      }
    }

    // Temporal filtering - updated_before
    if (normalizedParams.updated_before) {
      const timestamp = parseRelativeTime(normalizedParams.updated_before);
      if (timestamp !== null) {
        rows = rows.filter(r => {
          const updatedTs = new Date(r.updated).getTime() / 1000;
          return updatedTs <= timestamp;
        });
      } else {
        throw new Error(`Invalid updated_before format: ${normalizedParams.updated_before}. Use ISO timestamp or relative time like "7d", "2h", "30m"`);
      }
    }

    // Filter by decided_by (OR relationship)
    if (normalizedParams.decided_by && normalizedParams.decided_by.length > 0) {
      rows = rows.filter(r => r.decided_by && normalizedParams.decided_by!.includes(r.decided_by));
    }

    // Filter by statuses (OR relationship)
    if (normalizedParams.statuses && normalizedParams.statuses.length > 0) {
      rows = rows.filter(r => normalizedParams.statuses!.includes(r.status));
    }

    // Full-text search in value field
    if (normalizedParams.search_text) {
      rows = rows.filter(r => r.value.includes(normalizedParams.search_text!));
    }

    // Count total matching records (before pagination)
    const totalCount = rows.length;

    // Sorting
    const sortBy = normalizedParams.sort_by || 'updated';
    const sortOrder = normalizedParams.sort_order || 'desc';

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
    const limit = normalizedParams.limit !== undefined ? normalizedParams.limit : 20;
    const offset = normalizedParams.offset || 0;

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
