/**
 * Suggest by Full Context
 *
 * Hybrid scoring combining key similarity, tags, layer, and priority.
 * Used by auto-trigger suggestions feature.
 */

import type { Knex } from 'knex';
import { getAdapter } from '../../../database/index.js';
import { transformAndScoreDecisions } from '../../../utils/suggest-helpers.js';
import type { SuggestionContext } from '../../../utils/suggestion-scorer.js';
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

  // Score and rank with full context
  const context: SuggestionContext = {
    key: params.key,
    tags: params.tags ?? [],
    layer: params.layer,
    priority: params.priority,
  };

  // Use lower default threshold (20) for context searches without tags/layer
  // Key similarity max is 20 points, so default 30 may filter valid matches
  const suggestions = transformAndScoreDecisions(candidates, context, {
    minScore: params.min_score ?? 20,
    limit: params.limit,
  });

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
