/**
 * Suggest by Tag Overlap
 *
 * Fast query using v4_tag_index denormalized table
 * for efficient tag matching.
 */

import { getAdapter } from '../../../database/index.js';
import { transformAndScoreDecisions } from '../../../utils/suggest-helpers.js';
import type { SuggestionContext } from '../../../utils/suggestion-scorer.js';
import { buildTagIndexQuery } from '../internal/queries.js';
import type { SuggestResponse, DecisionCandidate } from '../types.js';

export interface ByTagsParams {
  tags: string[];
  layer?: string;
  limit?: number;
  min_score?: number;
}

/**
 * Suggest decisions by tag overlap
 *
 * Uses v4_tag_index for fast tag lookups.
 *
 * @param params - Parameters with tags to match
 * @returns Suggestions ranked by tag overlap and similarity
 */
export async function suggestByTags(params: ByTagsParams): Promise<SuggestResponse> {
  if (!params.tags || params.tags.length === 0) {
    throw new Error('Missing required parameter: tags');
  }

  const adapter = getAdapter();
  const knex = adapter.getKnex();

  // Build and execute tag index query
  const candidates = await buildTagIndexQuery(knex, params.tags, params.layer) as DecisionCandidate[];

  // Score and rank based on tag overlap
  const context: SuggestionContext = {
    key: '',
    tags: params.tags,
    layer: params.layer,
  };

  // Lower default min_score for tag searches - tag matches are inherently valuable
  // since we're filtering by v4_tag_index first
  const suggestions = transformAndScoreDecisions(candidates, context, {
    minScore: params.min_score ?? 15,  // Lower threshold for tag-based searches
    limit: params.limit,
  });

  return {
    query_tags: params.tags,
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
