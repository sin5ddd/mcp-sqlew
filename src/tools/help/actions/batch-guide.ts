/**
 * Help Tool - batch_guide Action
 * Get guidance for batch operations
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter } from '../../../database.js';
import { HelpBatchGuideParams, HelpBatchGuideResult, HelpExample } from '../types.js';

/**
 * Get batch operation guide
 * Queries database for batch-specific examples and adds best practices
 */
export async function batchGuide(
  params: HelpBatchGuideParams,
  adapter?: DatabaseAdapter
): Promise<HelpBatchGuideResult | { error: string }> {
  const actualAdapter = adapter ?? getAdapter();
  const db = actualAdapter.getKnex();

  try {
    // Parse operation (e.g., "task.create_batch" → tool=task, action=create_batch)
    const parts = params.operation.split('.');
    if (parts.length !== 2) {
      return {
        error: 'Operation must be in format "tool.action" (e.g., "task.create_batch")'
      };
    }

    const [tool, action] = parts;

    // Query for batch-specific examples
    const examples = await db('t_help_action_examples')
      .join('m_help_actions', 't_help_action_examples.action_id', 'm_help_actions.action_id')
      .where('m_help_actions.tool_name', tool)
      .where('m_help_actions.action_name', action)
      .select(
        't_help_action_examples.example_title as title',
        't_help_action_examples.example_code as code',
        't_help_action_examples.explanation'
      );

    if (examples.length === 0) {
      return {
        error: `No examples found for operation "${params.operation}". Check tool and action names.`
      };
    }

    // Curated best practices for batch operations
    const bestPractices = [
      'Limit batch size to 20 items for optimal performance',
      'Use consistent metadata (layer, priority, tags) across batch',
      'Validate all items before submitting batch to avoid partial failures',
      'Consider transaction boundaries for data integrity',
      'Use atomic: true flag if all items must succeed or none'
    ];

    const helpExamples: HelpExample[] = examples.map((ex: any) => ({
      title: ex.title,
      code: ex.code,
      explanation: ex.explanation
    }));

    return {
      operation: params.operation,
      description: `Batch operation guide for ${tool}.${action}`,
      syntax: examples[0]?.code || '',
      best_practices: bestPractices,
      examples: helpExamples
    };

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: `Failed to query batch guide: ${message}` };
  }
}
