/**
 * Help Tool - query_action Action
 * Get action documentation with parameters and examples
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter } from '../../../database.js';
import { queryHelpAction } from '../../help-queries.js';
import { HelpQueryActionParams, HelpActionResult } from '../types.js';

/**
 * Query single action with parameters and examples
 * Reuses existing queryHelpAction from help-queries.ts
 */
export async function queryAction(
  params: HelpQueryActionParams,
  adapter?: DatabaseAdapter
): Promise<HelpActionResult | { error: string; available_actions?: string[] }> {
  const actualAdapter = adapter ?? getAdapter();
  return queryHelpAction(actualAdapter, params.tool, params.target_action);
}
