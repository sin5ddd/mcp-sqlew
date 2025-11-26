/**
 * Example Tool - list_all Action
 * List all available examples with filtering
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter } from '../../../database.js';
import { ExampleListAllParams, ExampleListAllResult } from '../types.js';

/**
 * List all examples with optional filtering and pagination
 */
export async function listAllExamples(
  params: ExampleListAllParams,
  adapter?: DatabaseAdapter
): Promise<ExampleListAllResult | { error: string }> {
  const actualAdapter = adapter ?? getAdapter();
  const db = actualAdapter.getKnex();

  const limit = params.limit || 20;
  const offset = params.offset || 0;

  try {
    let query = db('v4_help_action_examples')
      .join('v4_help_actions', 'v4_help_action_examples.action_id', 'v4_help_actions.action_id');

    // Apply optional filters
    if (params.tool) {
      query = query.where('v4_help_actions.tool_name', params.tool);
    }

    // Get total count
    const totalResult = await query.clone().count('* as count').first();
    const total = totalResult ? Number(totalResult.count) : 0;

    // Get paginated results
    const examples = await query
      .select(
        'v4_help_action_examples.example_id',
        'v4_help_action_examples.example_title as title',
        'v4_help_actions.tool_name as tool',
        'v4_help_actions.action_name as action'
      )
      .limit(limit)
      .offset(offset);

    return {
      total,
      filtered: examples.length,
      examples
    };
  } catch (error) {
    return { error: `Failed to list examples: ${(error as Error).message}` };
  }
}
