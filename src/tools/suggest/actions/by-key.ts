/**
 * Suggest by Key Pattern
 *
 * Uses Levenshtein distance and common prefix matching
 * to find similar decision keys.
 */

import { getAdapter } from '../../../database/index.js';
import { parseGroupConcatTags } from '../../../utils/tag-parser.js';
import { scoreAndRankSuggestions, filterByThreshold, limitSuggestions, type SuggestionContext } from '../../../utils/suggestion-scorer.js';
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

  // Parse tags from GROUP_CONCAT and add defaults for scorer
  const parsed = candidates.map((c: DecisionCandidate) => ({
    key_id: c.key_id,
    key: c.key,
    value: String(c.value),  // Convert to string for scorer
    tags: parseGroupConcatTags(c.tags),
    layer: c.layer,
    priority: 0,  // Default priority (not stored in DB)
    updated_ts: c.ts,  // Rename ts to updated_ts for scorer
  }));

  // Score and rank based on key similarity
  const context: SuggestionContext = {
    key: params.key,
    tags: [],
  };

  let suggestions = scoreAndRankSuggestions(context, parsed);
  suggestions = filterByThreshold(suggestions, params.min_score ?? 30);
  suggestions = limitSuggestions(suggestions, params.limit ?? 5);

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
