/**
 * Help Tool - workflow_hints Action
 * Get common next actions after current action
 *
 * TOML-based implementation (v5.0+)
 * Loads from src/help-data/*.toml instead of database
 */

import { getHelpLoader } from '../../../help-loader.js';
import { HelpWorkflowHintsParams, HelpNextActionsResult } from '../types.js';

/**
 * Get workflow hints (common next actions)
 * Uses HelpSystemLoader (TOML-based)
 */
export async function workflowHints(
  params: HelpWorkflowHintsParams
): Promise<HelpNextActionsResult | { error: string }> {
  const loader = await getHelpLoader();

  // Verify tool and action exist
  const action = loader.getAction(params.tool, params.current_action);
  if (!action) {
    return {
      error: `Action "${params.tool}.${params.current_action}" not found in help system`
    };
  }

  // Get next actions from use case sequences
  const nextActions = loader.getNextActions(params.tool, params.current_action);

  return {
    tool: params.tool,
    action: params.current_action,
    next_actions: nextActions
  };
}
