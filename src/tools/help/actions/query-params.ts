/**
 * Help Tool - query_params Action
 * Get parameter list only (quick reference)
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter } from '../../../database.js';
import { queryHelpParams } from '../../help-queries.js';
import { HelpQueryParamsParams, HelpParamsResult } from '../types.js';

/**
 * Query parameter list only for quick reference
 * Reuses existing queryHelpParams from help-queries.ts
 */
export async function queryParams(
  params: HelpQueryParamsParams,
  adapter?: DatabaseAdapter
): Promise<HelpParamsResult | { error: string; available_actions?: string[] }> {
  const actualAdapter = adapter ?? getAdapter();
  return queryHelpParams(actualAdapter, params.tool, params.target_action);
}
