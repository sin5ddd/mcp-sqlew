/**
 * Add decision context action
 * Adds rich context (rationale, alternatives, tradeoffs) to a decision
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter, addDecisionContext as dbAddDecisionContext } from '../../../database.js';
import { validateActionParams } from '../internal/validation.js';

/**
 * Add decision context
 *
 * @param params - Context parameters
 * @param adapter - Optional database adapter (for testing)
 * @returns Response with success status
 */
export async function addDecisionContextAction(
  params: any,
  adapter?: DatabaseAdapter
): Promise<any> {
  // Validate parameters
  validateActionParams('decision', 'add_decision_context', params);

  const actualAdapter = adapter ?? getAdapter();

  try {
    // Parse JSON if provided as strings
    let alternatives = params.alternatives_considered || null;
    let tradeoffs = params.tradeoffs || null;

    // Convert to JSON strings
    if (alternatives !== null) {
      if (typeof alternatives === 'object') {
        alternatives = JSON.stringify(alternatives);
      } else if (typeof alternatives === 'string') {
        try {
          JSON.parse(alternatives);
        } catch {
          alternatives = JSON.stringify([alternatives]);
        }
      }
    }

    if (tradeoffs !== null) {
      if (typeof tradeoffs === 'object') {
        tradeoffs = JSON.stringify(tradeoffs);
      } else if (typeof tradeoffs === 'string') {
        try {
          JSON.parse(tradeoffs);
        } catch {
          tradeoffs = JSON.stringify({ description: tradeoffs });
        }
      }
    }

    const contextId = await dbAddDecisionContext(
      actualAdapter,
      params.key,
      params.rationale,
      alternatives,
      tradeoffs,
      params.decided_by || null,
      params.related_task_id || null,
      params.related_constraint_id || null
    );

    return {
      success: true,
      context_id: contextId,
      decision_key: params.key,
      message: `Decision context added successfully to "${params.key}"`
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to add decision context: ${message}`);
  }
}
