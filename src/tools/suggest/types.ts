/**
 * Suggest Tool - Type Definitions
 */

import type { Knex } from 'knex';

/**
 * Available suggest actions
 */
export type SuggestAction =
  | 'by_key'
  | 'by_tags'
  | 'by_context'
  | 'check_duplicate'
  | 'help';

/**
 * Target type for suggestions
 * - 'decision': Search for similar decisions (default)
 * - 'constraint': Search for similar constraints
 */
export type SuggestTarget = 'decision' | 'constraint';

/**
 * Parameters for suggest tool
 */
export interface SuggestParams {
  action: SuggestAction;
  target?: SuggestTarget;  // Default: 'decision'
  // For decisions (existing)
  key?: string;
  // For constraints (NEW)
  text?: string;
  constraint_text?: string;  // Alias for text
  category?: string;
  // Common
  tags?: string[];
  layer?: string;
  priority?: number;
  min_score?: number;
  limit?: number;
  knex?: Knex;  // Optional transaction context to avoid connection pool exhaustion
}

/**
 * Suggestion structure returned by all suggest actions
 */
export interface Suggestion {
  key: string;
  value: string | number;
  score: number;
  reason: string;
  score_breakdown: Record<string, number>;
  layer?: string;
  tags?: string[];
}

/**
 * Response structure for by_key, by_tags, by_context actions
 */
export interface SuggestResponse {
  query?: any;
  query_key?: string;
  query_tags?: string[];
  count: number;
  suggestions: Suggestion[];
}

/**
 * Response structure for check_duplicate action
 */
export interface CheckDuplicateResponse {
  is_duplicate: boolean;
  match_type: 'exact' | 'similar' | 'none';
  existing_decision?: {
    key: string;
    value: string | number;
    version: string;
  };
  similar_decisions?: Suggestion[];
  recommendation: string;
}

/**
 * Internal candidate structure (before scoring)
 */
export interface DecisionCandidate {
  key_id: number;
  key: string;
  value: string | number;
  layer: string;
  ts: number;
  tags: string;  // Comma-separated from GROUP_CONCAT
  tag_count?: number;
}
