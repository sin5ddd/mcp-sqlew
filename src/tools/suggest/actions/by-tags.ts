/**
 * Suggest by Tag Overlap
 *
 * Fast query using m_tag_index denormalized table
 * for efficient tag matching.
 */

import { getAdapter } from '../../../database/index.js';
import { parseGroupConcatTags } from '../../../utils/tag-parser.js';
import { scoreAndRankSuggestions, filterByThreshold, limitSuggestions, type SuggestionContext } from '../../../utils/suggestion-scorer.js';
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
 * Uses m_tag_index for fast tag lookups.
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

  // Score and rank based on tag overlap
  const context: SuggestionContext = {
    key: '',
    tags: params.tags,
    layer: params.layer,
  };

  let suggestions = scoreAndRankSuggestions(context, parsed);
  suggestions = filterByThreshold(suggestions, params.min_score ?? 30);
  suggestions = limitSuggestions(suggestions, params.limit ?? 5);

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
