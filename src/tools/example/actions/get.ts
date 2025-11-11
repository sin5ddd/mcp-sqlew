/**
 * Example Tool - get Action
 * Get examples by tool, action, or topic
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter } from '../../../database.js';
import { ExampleGetParams, ExampleResult } from '../types.js';

/**
 * Get examples for specific tool/action/topic
 * Returns all matching examples from t_help_action_examples
 */
export async function getExample(
  params: ExampleGetParams,
  adapter?: DatabaseAdapter
): Promise<ExampleResult[] | { error: string }> {
  const actualAdapter = adapter ?? getAdapter();
  const db = actualAdapter.getKnex();

  try {
    let query = db('t_help_action_examples')
      .join('m_help_actions', 't_help_action_examples.action_id', 'm_help_actions.action_id')
      .select(
        't_help_action_examples.example_id',
        't_help_action_examples.example_title as title',
        'm_help_actions.tool_name as tool',
        'm_help_actions.action_name as action',
        't_help_action_examples.example_code as code',
        't_help_action_examples.explanation'
      );

    // Apply filters
    if (params.tool) {
      query = query.where('m_help_actions.tool_name', params.tool);
    }

    if (params.action_name) {
      query = query.where('m_help_actions.action_name', params.action_name);
    }

    if (params.topic) {
      query = query.where(function() {
        this.where('t_help_action_examples.example_title', 'like', `%${params.topic}%`)
          .orWhere('t_help_action_examples.explanation', 'like', `%${params.topic}%`);
      });
    }

    const examples = await query;

    if (examples.length === 0) {
      return { error: 'No examples found matching the criteria' };
    }

    return examples;
  } catch (error) {
    return { error: `Failed to retrieve examples: ${(error as Error).message}` };
  }
}
