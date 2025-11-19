/**
 * Check for Duplicate Decisions
 *
 * Detects exact matches or high similarity scores
 * to prevent duplicate decision creation.
 */

import { getAdapter } from '../../../database/index.js';
import { checkExactMatch } from '../internal/queries.js';
import { suggestByKey } from './by-key.js';
import type { CheckDuplicateResponse } from '../types.js';

export interface CheckDuplicateParams {
  key: string;
}

/**
 * Check if a key already exists (duplicate detection)
 *
 * Returns exact match if found, otherwise checks for similar keys.
 *
 * @param params - Parameters with key to check
 * @returns Duplicate detection result with recommendation
 */
export async function checkDuplicate(params: CheckDuplicateParams): Promise<CheckDuplicateResponse> {
  if (!params.key) {
    throw new Error('Missing required parameter: key');
  }

  const adapter = getAdapter();
  const knex = adapter.getKnex();

  // Check exact match first
  const exact = await checkExactMatch(knex, params.key);

  if (exact) {
    return {
      is_duplicate: true,
      match_type: 'exact',
      existing_decision: {
        key: exact.key,
        value: exact.value,
        version: exact.version,
      },
      recommendation: 'Update existing decision instead of creating new one',
    };
  }

  // Check similar keys with high similarity threshold
  const similar = await suggestByKey({
    key: params.key,
    limit: 1,
    min_score: 70,  // High threshold for duplicate detection
  });

  if (similar.count > 0) {
    return {
      is_duplicate: false,
      match_type: 'similar',
      similar_decisions: similar.suggestions,
      recommendation: 'Review similar decisions before creating new one',
    };
  }

  // No duplicates found
  return {
    is_duplicate: false,
    match_type: 'none',
    recommendation: 'No duplicates found, safe to create new decision',
  };
}
