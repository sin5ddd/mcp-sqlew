/**
 * Constraint Suggest by Tag Overlap
 *
 * Finds constraints that share tags with the search criteria.
 * Scores based on tag overlap count and layer match.
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
 * Parameters for constraint by tags search
 */
export interface ConstraintByTagsParams {
  tags: string[];
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
  query_tags: string[];
  count: number;
  suggestions: ConstraintSuggestion[];
}

/**
 * Suggest constraints by tag overlap
 *
 * Finds constraints that share one or more tags with the search criteria.
 * Scores based on tag overlap count plus layer match bonus.
 *
 * @param params - Parameters with tags to match
 * @returns Suggestions ranked by tag overlap and similarity
 */
export async function constraintByTags(
  params: ConstraintByTagsParams
): Promise<ConstraintSuggestResponse> {
  if (!params.tags || params.tags.length === 0) {
    throw new Error('Missing required parameter: tags');
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

  // Filter to only constraints that have at least one matching tag
  const filteredParsed = parsed.filter((c) =>
    c.tags.some((tag) => params.tags.includes(tag))
  );

  // Score constraints based on tag overlap
  const context: ConstraintScoringContext = {
    text: '', // No text matching for tag-based search
    tags: params.tags,
    layer: params.layer,
  };

  let suggestions = scoreConstraints(filteredParsed, context);
  suggestions = filterByThreshold(suggestions, params.min_score ?? 30);
  suggestions = limitSuggestions(suggestions, params.limit ?? 5);

  return {
    query_tags: params.tags,
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
