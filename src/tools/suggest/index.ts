/**
 * Suggest Tool - Main Entry Point
 *
 * Intelligent discovery of related decisions and constraints
 * to prevent duplicates and ensure consistency.
 */

import { suggestByKey } from './actions/by-key.js';
import { suggestByTags } from './actions/by-tags.js';
import { suggestByContext } from './actions/by-context.js';
import { checkDuplicate } from './actions/check-duplicate.js';
import { getSuggestHelp } from './help/help.js';
import type { SuggestParams, SuggestResponse, CheckDuplicateResponse } from './types.js';

// Re-export types for external use
export type { SuggestParams, SuggestResponse, CheckDuplicateResponse } from './types.js';

/**
 * Main suggest tool handler
 *
 * Routes to appropriate action based on params.action.
 *
 * @param params - Suggest parameters with action type
 * @returns Response from the selected action
 */
export async function handleSuggestAction(
  params: SuggestParams
): Promise<any> {
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
