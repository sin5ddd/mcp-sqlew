/**
 * Help Tool - workflow_hints Action
 * Get common next actions after current action
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter } from '../../../database.js';
import { queryHelpNextActions } from '../../help-queries.js';
import { HelpWorkflowHintsParams, HelpNextActionsResult } from '../types.js';

/**
 * Get workflow hints (common next actions)
 * Reuses existing queryHelpNextActions from help-queries.ts
 */
export async function workflowHints(
  params: HelpWorkflowHintsParams,
  adapter?: DatabaseAdapter
): Promise<HelpNextActionsResult | { error: string }> {
  const actualAdapter = adapter ?? getAdapter();
  return queryHelpNextActions(actualAdapter, params.tool, params.current_action);
}
