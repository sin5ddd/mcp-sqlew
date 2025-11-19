/**
 * Help Tool - query_tool Action
 * Get tool overview and all actions
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter } from '../../../database.js';
import { queryHelpTool } from '../../help-queries.js';
import { HelpQueryToolParams, HelpToolResult } from '../types.js';

/**
 * Query tool overview and all actions
 * Reuses existing queryHelpTool from help-queries.ts
 */
export async function queryTool(
  params: HelpQueryToolParams,
  adapter?: DatabaseAdapter
): Promise<HelpToolResult | { error: string; available_tools?: string[] }> {
  const actualAdapter = adapter ?? getAdapter();
  return await queryHelpTool(actualAdapter, params.tool);
}
