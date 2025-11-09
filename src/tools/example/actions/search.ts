/**
 * Example Tool - search Action
 * Search examples by keyword
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter } from '../../../database.js';
import { ExampleSearchParams, ExampleSearchResult } from '../types.js';

/**
 * Search examples by keyword with optional filters
 * Returns truncated preview of matching examples
 */
export async function searchExamples(
  params: ExampleSearchParams,
  adapter?: DatabaseAdapter
): Promise<ExampleSearchResult | { error: string }> {
  const actualAdapter = adapter ?? getAdapter();
  const db = actualAdapter.getKnex();

  try {
    let query = db('t_help_action_examples')
      .join('m_help_actions', 't_help_action_examples.action_id', 'm_help_actions.action_id')
      .where(function() {
        this.where('t_help_action_examples.example_title', 'like', `%${params.keyword}%`)
          .orWhere('t_help_action_examples.explanation', 'like', `%${params.keyword}%`)
          .orWhere('t_help_action_examples.example_code', 'like', `%${params.keyword}%`);
      });

    // Apply optional filters
    if (params.tool) {
      query = query.where('m_help_actions.tool_name', params.tool);
    }

    if (params.action_name) {
      query = query.where('m_help_actions.action_name', params.action_name);
    }

    const examples = await query
      .select(
        't_help_action_examples.example_id',
        't_help_action_examples.example_title as title',
        'm_help_actions.tool_name as tool',
        'm_help_actions.action_name as action',
        't_help_action_examples.example_code as code'
      )
      .limit(20);  // Limit to 20 results

    if (examples.length === 0) {
      return {
        total: 0,
        examples: []
      };
    }

    return {
      total: examples.length,
      examples: examples.map(ex => ({
        example_id: ex.example_id,
        title: ex.title,
        tool: ex.tool,
        action: ex.action,
        preview: ex.code.substring(0, 100) + (ex.code.length > 100 ? '...' : '')
      }))
    };
  } catch (error) {
    return { error: `Failed to search examples: ${(error as Error).message}` };
  }
}
