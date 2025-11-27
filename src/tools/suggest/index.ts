/**
 * Suggest Tool - Main Entry Point
 *
 * Intelligent discovery of related decisions and constraints
 * to prevent duplicates and ensure consistency.
 */

// Decision suggest actions
import { suggestByKey } from './actions/by-key.js';
import { suggestByTags } from './actions/by-tags.js';
import { suggestByContext } from './actions/by-context.js';
import { checkDuplicate } from './actions/check-duplicate.js';
// Constraint suggest actions
// Note: constraintByText is not used directly - by_key falls through to constraintByContext
import { constraintByTags } from './actions/constraint-by-tags.js';
import { constraintByContext } from './actions/constraint-by-context.js';
import { constraintCheckDuplicate } from './actions/constraint-check-duplicate.js';
import { getSuggestHelp } from './help/help.js';
import type { SuggestParams, SuggestResponse, CheckDuplicateResponse, SuggestTarget } from './types.js';

// Re-export types for external use
export type { SuggestParams, SuggestResponse, CheckDuplicateResponse, SuggestTarget } from './types.js';

/**
 * Handle constraint suggest actions
 *
 * @param params - Suggest parameters with action type
 * @returns Response from constraint suggest action
 */
async function handleConstraintAction(params: SuggestParams): Promise<any> {
  // Resolve text from either 'text' or 'constraint_text' parameter
  const text = params.text ?? params.constraint_text;

  switch (params.action) {
    case 'by_key':
      // For constraints, 'by_key' is equivalent to 'by_text' (text pattern search)
      // Fall through to by_text behavior
    case 'by_context':
      // For constraints, use constraint by context with all available params
      return await constraintByContext({
        text: text,
        tags: params.tags,
        layer: params.layer,
        priority: params.priority,
        limit: params.limit,
        min_score: params.min_score,
        knex: params.knex,
      });

    case 'by_tags':
      return await constraintByTags({
        tags: params.tags!,
        layer: params.layer,
        limit: params.limit,
        min_score: params.min_score,
      });

    case 'check_duplicate':
      return await constraintCheckDuplicate({
        text: text!,
        category: params.category,
      });

    case 'help':
      return getSuggestHelp();

    default:
      throw new Error(`Unknown suggest action: ${params.action}`);
  }
}

/**
 * Handle decision suggest actions (original behavior)
 *
 * @param params - Suggest parameters with action type
 * @returns Response from decision suggest action
 */
async function handleDecisionAction(params: SuggestParams): Promise<any> {
  switch (params.action) {
    case 'by_key':
      return await suggestByKey({
        key: params.key!,
        limit: params.limit,
        min_score: params.min_score,
      });

    case 'by_tags':
      return await suggestByTags({
        tags: params.tags!,
        layer: params.layer,
        limit: params.limit,
        min_score: params.min_score,
      });

    case 'by_context':
      return await suggestByContext({
        key: params.key!,
        tags: params.tags,
        layer: params.layer,
        priority: params.priority,
        limit: params.limit,
        min_score: params.min_score,
        knex: params.knex,  // Pass transaction context
      });

    case 'check_duplicate':
      return await checkDuplicate({
        key: params.key!,
      });

    case 'help':
      return getSuggestHelp();

    default:
      throw new Error(`Unknown suggest action: ${params.action}`);
  }
}

/**
 * Main suggest tool handler
 *
 * Routes to appropriate action based on params.action and params.target.
 * Default target is 'decision' for backward compatibility.
 *
 * @param params - Suggest parameters with action type
 * @returns Response from the selected action
 */
export async function handleSuggestAction(
  params: SuggestParams
): Promise<any> {
  const target: SuggestTarget = params.target ?? 'decision';

  if (target === 'constraint') {
    return await handleConstraintAction(params);
  }

  // Default: decision suggestions (backward compatible)
  return await handleDecisionAction(params);
}
