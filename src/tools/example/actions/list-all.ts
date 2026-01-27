/**
 * Example Tool - list_all Action
 * List all available examples with filtering
 *
 * TOML-based implementation (v5.0+)
 * Loads from src/help-data/*.toml instead of database
 */

import { getHelpLoader } from '../../../help-loader.js';
import { ExampleListAllParams, ExampleListAllResult } from '../types.js';

/**
 * List all examples with optional filtering and pagination
 * Uses HelpSystemLoader (TOML-based)
 */
export async function listAllExamples(
  params: ExampleListAllParams
): Promise<ExampleListAllResult | { error: string }> {
  const loader = await getHelpLoader();

  const result = loader.listExamples({
    tool: params.tool,
    limit: params.limit || 20,
    offset: params.offset || 0
  });

  return {
    total: result.total,
    filtered: result.examples.length,
    examples: result.examples.map((e, index) => ({
      example_id: index + 1,
      title: e.title,
      tool: e.tool,
      action: e.action
    }))
  };
}
