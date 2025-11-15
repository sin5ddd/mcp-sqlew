/**
 * Suggest by Full Context
 *
 * Hybrid scoring combining key similarity, tags, layer, and priority.
 * Used by auto-trigger suggestions feature.
 */

import type { Knex } from 'knex';
import { getAdapter } from '../../../database/index.js';
import { parseGroupConcatTags } from '../../../utils/tag-parser.js';
import { scoreAndRankSuggestions, filterByThreshold, limitSuggestions, type SuggestionContext } from '../../../utils/suggestion-scorer.js';
import { buildContextQuery } from '../internal/queries.js';
import type { SuggestResponse, DecisionCandidate } from '../types.js';

export interface ByContextParams {
  key: string;
  tags?: string[];
  layer?: string;
  priority?: number;
  limit?: number;
  min_score?: number;
  knex?: Knex;  // Optional transaction context
}

/**
 * Suggest by full context (hybrid scoring)
 *
 * Combines key similarity, tags, layer, priority for comprehensive suggestions.
 * Supports transaction context to avoid connection pool exhaustion.
 *
 * @param params - Full context parameters
 * @returns Suggestions ranked by hybrid score
 */
export async function suggestByContext(params: ByContextParams): Promise<SuggestResponse> {
  if (!params.key) {
    throw new Error('Missing required parameter: key');
  }

  // Use provided knex (transaction context) or get adapter
  const knex = params.knex || getAdapter().getKnex();

  // Build and execute context query (exclude current key to prevent self-suggestion)
  const candidates = await buildContextQuery(knex, params.tags, params.key) as DecisionCandidate[];

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

  // Score and rank with full context
  const context: SuggestionContext = {
    key: params.key,
    tags: params.tags ?? [],
    layer: params.layer,
    priority: params.priority,
  };

  let suggestions = scoreAndRankSuggestions(context, parsed);
  suggestions = filterByThreshold(suggestions, params.min_score ?? 30);
  suggestions = limitSuggestions(suggestions, params.limit ?? 5);

  return {
    query: {
      key: params.key,
      tags: params.tags,
      layer: params.layer,
      priority: params.priority,
    },
    count: suggestions.length,
    suggestions: suggestions.map(s => ({
      key: s.key,
      value: s.value,
      score: s.score,
      reason: s.reason,
      score_breakdown: s.score_breakdown,
      tags: s.tags,  // Include tags for match detail analysis
      layer: s.layer,  // Include layer for match detail analysis
      ts: s.updated_ts,  // Include timestamp for version info
    })),
  };
}
