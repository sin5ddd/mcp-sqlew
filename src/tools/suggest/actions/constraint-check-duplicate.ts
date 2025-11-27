/**
 * Constraint Duplicate Detection
 *
 * Two-phase duplicate detection:
 * 1. Exact match check on constraint_text
 * 2. Similarity check with configurable threshold
 *
 * Prevents creation of duplicate or near-duplicate constraints.
 */

import { getAdapter } from '../../../database/index.js';
import { checkExactConstraintMatch } from '../internal/constraint-queries.js';
import { constraintByText, type ConstraintSuggestion } from './constraint-by-text.js';

/**
 * Parameters for constraint duplicate check
 */
export interface ConstraintCheckDuplicateParams {
  text: string;
  category?: string;
}

/**
 * Existing constraint structure for exact match
 */
export interface ExistingConstraint {
  id: number;
  constraint_text: string;
  category: string;
  layer?: string;
  priority: number;
}

/**
 * Response structure for duplicate check
 */
export interface ConstraintCheckDuplicateResponse {
  is_duplicate: boolean;
  match_type: 'exact' | 'similar' | 'none';
  existing?: ExistingConstraint;
  similar_constraints?: ConstraintSuggestion[];
  score?: number;
  recommendation: string;
}

/**
 * Check if a constraint already exists (duplicate detection)
 *
 * Two-phase detection:
 * 1. Check for exact constraint_text match (optionally within same category)
 * 2. If no exact match, check for high similarity (default threshold 70)
 *
 * @param params - Parameters with constraint text to check
 * @returns Duplicate detection result with recommendation
 */
export async function constraintCheckDuplicate(
  params: ConstraintCheckDuplicateParams
): Promise<ConstraintCheckDuplicateResponse> {
  if (!params.text) {
    throw new Error('Missing required parameter: text');
  }

  const adapter = getAdapter();
  const knex = adapter.getKnex();

  // Phase 1: Check for exact match
  const exactMatch = await checkExactConstraintMatch(knex, params.text, params.category);

  if (exactMatch) {
    return {
      is_duplicate: true,
      match_type: 'exact',
      existing: {
        id: exactMatch.constraint_id,
        constraint_text: exactMatch.constraint_text,
        category: exactMatch.category,
        layer: exactMatch.layer ?? undefined,
        priority: exactMatch.priority,
      },
      recommendation: 'Exact constraint already exists. Consider updating the existing constraint instead.',
    };
  }

  // Phase 2: Check for similar constraints with high threshold
  const similarResult = await constraintByText({
    text: params.text,
    limit: 3,
    min_score: 70, // High threshold for duplicate detection
  });

  if (similarResult.count > 0) {
    const topMatch = similarResult.suggestions[0];
    return {
      is_duplicate: false,
      match_type: 'similar',
      similar_constraints: similarResult.suggestions,
      score: topMatch.score,
      recommendation: `Found ${similarResult.count} similar constraint(s). Review before creating to avoid duplication.`,
    };
  }

  // No duplicates found
  return {
    is_duplicate: false,
    match_type: 'none',
    recommendation: 'No duplicates found. Safe to create new constraint.',
  };
}
