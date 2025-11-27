/**
 * Constraint Suggest by Text Pattern
 *
 * Uses Levenshtein distance to find similar constraints
 * based on constraint_text similarity.
 */

import { getAdapter } from '../../../database/index.js';
import {
  buildConstraintQuery,
  parseConstraintTags,
  type ConstraintCandidate as QueryConstraintCandidate,
} from '../internal/constraint-queries.js';
import {
  scoreConstraints,
  filterByThreshold,
  limitSuggestions,
  type ConstraintScoringContext,
  type ScoredConstraint,
  type ScoreBreakdown,
} from '../../../utils/constraint-scorer.js';

/**
 * Parameters for constraint by text search
 */
export interface ConstraintByTextParams {
  text: string;
  layer?: string;
  limit?: number;
  min_score?: number;
}

/**
 * Constraint suggestion structure
 */
export interface ConstraintSuggestion {
  id: number;
  constraint_text: string;
  category: string;
  score: number;
  reason: string;
  score_breakdown: ScoreBreakdown;
  layer?: string;
  tags?: string[];
}

/**
 * Response structure for constraint suggestions
 */
export interface ConstraintSuggestResponse {
  query_text: string;
  count: number;
  suggestions: ConstraintSuggestion[];
}

/**
 * Suggest constraints by text pattern similarity
 *
 * Uses Levenshtein distance to score constraint text similarity.
 *
 * @param params - Parameters with text pattern to search
 * @returns Suggestions ranked by text similarity score
 */
export async function constraintByText(
  params: ConstraintByTextParams
): Promise<ConstraintSuggestResponse> {
  if (!params.text) {
    throw new Error('Missing required parameter: text');
  }

  const adapter = getAdapter();
  const knex = adapter.getKnex();

  // Build and execute constraint query
  let query = buildConstraintQuery(knex, { distinct: true });

  // Filter by layer if specified
  if (params.layer) {
    query = query.where('l.name', params.layer);
  }

  const candidates = (await query) as QueryConstraintCandidate[];

  // Transform candidates for scorer (parse tags from GROUP_CONCAT)
  const parsed = candidates.map((c) => ({
    id: c.constraint_id,
    constraint_text: c.constraint_text,
    category: c.category,
    tags: parseConstraintTags(c.tags),
    layer: c.layer,
    priority: c.priority,
    ts: c.ts,
  }));

  // Score constraints based on text similarity
  const context: ConstraintScoringContext = {
    text: params.text,
    tags: [],
    layer: params.layer,
  };

  let suggestions = scoreConstraints(parsed, context);
  suggestions = filterByThreshold(suggestions, params.min_score ?? 30);
  suggestions = limitSuggestions(suggestions, params.limit ?? 5);

  return {
    query_text: params.text,
    count: suggestions.length,
    suggestions: suggestions.map((s: ScoredConstraint) => ({
      id: s.id,
      constraint_text: s.constraint_text,
      category: s.category,
      score: s.score,
      reason: s.reason,
      score_breakdown: s.score_breakdown,
      layer: s.layer,
      tags: s.tags,
    })),
  };
}
