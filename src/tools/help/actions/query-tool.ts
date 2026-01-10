/**
 * Help Tool - query_tool Action
 * Get tool overview and all actions
 *
 * TOML-based implementation (v5.0+)
 * Loads from src/help-data/*.toml instead of database
 */

import { getHelpLoader } from '../../../help-loader.js';
import { HelpQueryToolParams, HelpToolResult } from '../types.js';

/**
 * Query tool overview and all actions
 * Uses HelpSystemLoader (TOML-based)
 */
export async function queryTool(
  params: HelpQueryToolParams
): Promise<HelpToolResult | { error: string; available_tools?: string[] }> {
  const loader = await getHelpLoader();

  // Get tool
  const tool = loader.getTool(params.tool);
  if (!tool) {
    return {
      error: `Tool "${params.tool}" not found`,
      available_tools: loader.getToolNames()
    };
  }

  return {
    tool: tool.name,
    description: tool.description,
    actions: tool.actions.map(a => ({
      name: a.name,
      description: a.description
    }))
  };
}
