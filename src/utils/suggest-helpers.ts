/**
 * Suggest Helper Functions
 *
 * Shared transformation and scoring logic for suggest actions.
 * Reduces code duplication across decision and constraint suggest operations.
 *
 * @since v4.3.1
 */

import { parseGroupConcatTags } from './tag-parser.js';
import {
  scoreAndRankSuggestions,
  filterByThreshold as filterDecisionsByThreshold,
  limitSuggestions as limitDecisionSuggestions,
  type SuggestionContext,
  type ScoredSuggestion
} from './suggestion-scorer.js';
import {
  scoreConstraints,
  filterByThreshold as filterConstraintsByThreshold,
  limitSuggestions as limitConstraintSuggestions,
  type ConstraintScoringContext,
  type ScoredConstraint
} from './constraint-scorer.js';
import type { DecisionCandidate } from '../tools/suggest/types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Parsed constraint candidate for scorer
 */
export interface ParsedConstraint {
  id: number;
  constraint_text: string;
  category: string;
  tags: string[];
  layer: string;
  priority: number;
  ts: number;
}

/**
 * Query constraint candidate from database
 */
export interface QueryConstraintCandidate {
  constraint_id: number;
  constraint_text: string;
  category: string;
  tags: string | null;
  layer: string | null;
  priority: number;
  ts: number;
}

/**
 * Options for transform and score operations
 */
export interface TransformScoreOptions {
  minScore?: number;
  limit?: number;
}

// ============================================================================
// Decision Helpers
// ============================================================================

/**
 * Transform decision candidates and score them
 *
 * Consolidates the common pattern of:
 * 1. Parse GROUP_CONCAT tags
 * 2. Map to scorer format
 * 3. Score and rank
 * 4. Filter by threshold
 * 5. Apply limit
 *
 * @param candidates - Raw candidates from database query
 * @param context - Scoring context (key, tags, layer, priority)
 * @param options - Optional min_score and limit
 * @returns Scored and filtered suggestions
 */
export function transformAndScoreDecisions(
  candidates: DecisionCandidate[],
  context: SuggestionContext,
  options?: TransformScoreOptions
): ScoredSuggestion[] {
  // Parse tags from GROUP_CONCAT and map to scorer format
  const parsed = candidates.map((c: DecisionCandidate) => ({
    key_id: c.key_id,
    key: c.key,
    value: String(c.value),  // Convert to string for scorer
    tags: parseGroupConcatTags(c.tags),
    layer: c.layer,
    priority: 0,  // Default priority (not stored in DB)
    updated_ts: c.ts,  // Rename ts to updated_ts for scorer
  }));

  // Score, filter, and limit
  let suggestions = scoreAndRankSuggestions(context, parsed);
  suggestions = filterDecisionsByThreshold(suggestions, options?.minScore ?? 30);
  suggestions = limitDecisionSuggestions(suggestions, options?.limit ?? 5);

  return suggestions;
}

// ============================================================================
// Constraint Helpers
// ============================================================================

/**
 * Parse constraint tags from GROUP_CONCAT result
 *
 * @param tags - Comma-separated tags string or null
 * @returns Array of tag strings
 */
export function parseConstraintTags(tags: string | null): string[] {
  if (!tags) return [];
  return tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
}

/**
 * Transform constraint candidates and score them
 *
 * Consolidates the common pattern of:
 * 1. Parse GROUP_CONCAT tags
 * 2. Map to scorer format
 * 3. Score constraints
 * 4. Filter by threshold
 * 5. Apply limit
 *
 * @param candidates - Raw candidates from database query
 * @param context - Scoring context (text, tags, layer, priority)
 * @param options - Optional min_score and limit
 * @returns Scored and filtered constraint suggestions
 */
export function transformAndScoreConstraints(
  candidates: QueryConstraintCandidate[],
  context: ConstraintScoringContext,
  options?: TransformScoreOptions
): ScoredConstraint[] {
  // Parse tags from GROUP_CONCAT and map to scorer format
  const parsed: ParsedConstraint[] = candidates.map((c) => ({
    id: c.constraint_id,
    constraint_text: c.constraint_text,
    category: c.category,
    tags: parseConstraintTags(c.tags),
    layer: c.layer ?? '',  // Convert null to empty string
    priority: c.priority,
    ts: c.ts,
  }));

  // Score, filter, and limit
  let suggestions = scoreConstraints(parsed, context);
  suggestions = filterConstraintsByThreshold(suggestions, options?.minScore ?? 30);
  suggestions = limitConstraintSuggestions(suggestions, options?.limit ?? 5);

  return suggestions;
}
