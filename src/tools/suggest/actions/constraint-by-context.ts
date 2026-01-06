/**
 * Constraint Suggest by Full Context
 *
 * Hybrid scoring combining text similarity, tags, layer, and priority.
 * Most comprehensive search for finding related constraints.
 */

import type { Knex } from 'knex';
import { getAdapter } from '../../../database/index.js';
import {
  buildConstraintQuery,
  type ConstraintCandidate as QueryConstraintCandidate,
} from '../internal/constraint-queries.js';
import {
  transformAndScoreConstraints,
  parseConstraintTags,
} from '../../../utils/suggest-helpers.js';
import type {
  ConstraintScoringContext,
  ScoreBreakdown,
  ScoredConstraint,
} from '../../../utils/constraint-scorer.js';

/**
 * Parameters for constraint by context search
 */
export interface ConstraintByContextParams {
  text?: string;
  tags?: string[];
  layer?: string;
  priority?: number;
  limit?: number;
  min_score?: number;
  knex?: Knex; // Optional transaction context
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
  ts?: number;
}

/**
 * Response structure for constraint suggestions
 */
export interface ConstraintSuggestResponse {
  query: {
    text?: string;
    tags?: string[];
    layer?: string;
    priority?: number;
  };
  count: number;
  suggestions: ConstraintSuggestion[];
}

/**
 * Suggest constraints by full context (hybrid scoring)
 *
 * Combines text similarity, tags, layer, and priority for comprehensive
 * constraint suggestions. Supports transaction context to avoid
 * connection pool exhaustion.
 *
 * Scoring breakdown (100 points max):
 * - Tag overlap: 40 points (10 per matching tag, max 4)
 * - Layer match: 25 points
 * - Text similarity: 20 points (Levenshtein distance)
 * - Recency: 10 points
 * - Priority: 5 points
 *
 * @param params - Full context parameters
 * @returns Suggestions ranked by hybrid score
 */
export async function constraintByContext(
  params: ConstraintByContextParams
): Promise<ConstraintSuggestResponse> {
  // At least one search criteria must be provided
  if (!params.text && (!params.tags || params.tags.length === 0) && !params.layer) {
    throw new Error('At least one search criteria (text, tags, or layer) must be provided');
  }

  // Use provided knex (transaction context) or get adapter
  const knex = params.knex || getAdapter().getKnex();

  // Build and execute constraint query
  let query = buildConstraintQuery(knex, { distinct: true });

  // Filter by layer if specified (for more efficient query)
  if (params.layer) {
    query = query.where('l.name', params.layer);
  }

  const candidates = (await query) as QueryConstraintCandidate[];

  // Score constraints with full context
  const context: ConstraintScoringContext = {
    text: params.text ?? '',
    tags: params.tags ?? [],
    layer: params.layer,
    priority: params.priority,
  };

  const suggestions = transformAndScoreConstraints(candidates, context, {
    minScore: params.min_score,
    limit: params.limit,
  });

  // Map to include ts from original candidates
  const candidateMap = new Map(candidates.map(c => [c.constraint_id, c.ts]));

  return {
    query: {
      text: params.text,
      tags: params.tags,
      layer: params.layer,
      priority: params.priority,
    },
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
      ts: candidateMap.get(s.id),
    })),
  };
}
