/**
 * Example Tool - search Action
 * Search examples by keyword
 *
 * TOML-based implementation (v5.0+)
 * Loads from src/help-data/*.toml instead of database
 */

import { getHelpLoader } from '../../../help-loader.js';
import { ExampleSearchParams, ExampleSearchResult } from '../types.js';

/**
 * Search examples by keyword with optional filters
 * Uses HelpSystemLoader (TOML-based)
 */
export async function searchExamples(
  params: ExampleSearchParams
): Promise<ExampleSearchResult | { error: string }> {
  const loader = await getHelpLoader();

  const results = loader.searchExamples(params.keyword, {
    tool: params.tool,
    limit: 20
  });

  return {
    total: results.length,
    examples: results.map((r, index) => ({
      example_id: index + 1,
      title: r.example.title,
      tool: r.tool,
      action: r.action,
      preview: r.example.code.substring(0, 100) + (r.example.code.length > 100 ? '...' : '')
    }))
  };
}
