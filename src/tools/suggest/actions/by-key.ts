/**
 * Suggest by Key Pattern
 *
 * Uses Levenshtein distance and common prefix matching
 * to find similar decision keys.
 */

import { getAdapter } from '../../../database/index.js';
import { transformAndScoreDecisions } from '../../../utils/suggest-helpers.js';
import type { SuggestionContext } from '../../../utils/suggestion-scorer.js';
import { buildDecisionQuery } from '../internal/queries.js';
import type { SuggestResponse, DecisionCandidate } from '../types.js';

export interface ByKeyParams {
  key: string;
  limit?: number;
  min_score?: number;
}

/**
 * Suggest decisions by key pattern similarity
 *
 * @param params - Parameters with key pattern
 * @returns Suggestions ranked by similarity score
 */
export async function suggestByKey(params: ByKeyParams): Promise<SuggestResponse> {
  if (!params.key) {
    throw new Error('Missing required parameter: key');
  }

  const adapter = getAdapter();
  const knex = adapter.getKnex();

  // Fetch candidate decisions (all active decisions)
  const candidates = await buildDecisionQuery(knex) as DecisionCandidate[];

  // Score and rank based on key similarity
  const context: SuggestionContext = {
    key: params.key,
    tags: [],
  };

  // Use lower default threshold (20) for key-only searches
  // Key similarity max is 20 points, so default 30 would never match
  const suggestions = transformAndScoreDecisions(candidates, context, {
    minScore: params.min_score ?? 20,
    limit: params.limit,
  });

  return {
    query_key: params.key,
    count: suggestions.length,
    suggestions: suggestions.map(s => ({
      key: s.key,
      value: s.value,
      score: s.score,
      reason: s.reason,
      score_breakdown: s.score_breakdown,
    })),
  };
}
