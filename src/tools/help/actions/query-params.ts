/**
 * Help Tool - query_params Action
 * Get parameter list only (quick reference)
 *
 * TOML-based implementation (v5.0+)
 * Loads from src/help-data/*.toml instead of database
 */

import { getHelpLoader } from '../../../help-loader.js';
import { HelpQueryParamsParams, HelpParamsResult } from '../types.js';

/**
 * Query parameter list only for quick reference
 * Uses HelpSystemLoader (TOML-based)
 */
export async function queryParams(
  params: HelpQueryParamsParams
): Promise<HelpParamsResult | { error: string; available_actions?: string[] }> {
  const loader = await getHelpLoader();

  // Check if tool exists
  const tool = loader.getTool(params.tool);
  if (!tool) {
    return {
      error: `Tool "${params.tool}" not found`,
      available_actions: loader.getToolNames()
    };
  }

  // Get action
  const action = loader.getAction(params.tool, params.target_action);
  if (!action) {
    return {
      error: `Action "${params.target_action}" not found for tool "${params.tool}"`,
      available_actions: loader.getActionNames(params.tool)
    };
  }

  return {
    tool: params.tool,
    action: action.name,
    parameters: action.params
  };
}
