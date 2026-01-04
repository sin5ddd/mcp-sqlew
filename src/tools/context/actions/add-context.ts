/**
 * Add decision context action
 * Adds rich context (rationale, alternatives, tradeoffs) to a decision
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter, addDecisionContext as dbAddDecisionContext } from '../../../database.js';
import { validateActionParams } from '../internal/validation.js';
import { normalizeParams } from '../../../utils/param-normalizer.js';

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
  // Normalize aliases: alternatives → alternatives_considered, etc.
  const normalizedParams = normalizeParams(params, {
    alternatives: 'alternatives_considered',
    task_id: 'related_task_id',
    constraint_id: 'related_constraint_id'
  });

  // Validate parameters
  validateActionParams('decision', 'add_decision_context', normalizedParams);

  const actualAdapter = adapter ?? getAdapter();

  try {
    // Parse JSON if provided as strings
    let alternatives = normalizedParams.alternatives_considered || null;
    let tradeoffs = normalizedParams.tradeoffs || null;

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
      normalizedParams.key,
      normalizedParams.rationale,
      alternatives,
      tradeoffs,
      normalizedParams.decided_by || null,
      normalizedParams.related_task_id || null,
      normalizedParams.related_constraint_id || null
    );

    return {
      success: true,
      context_id: contextId,
      decision_key: normalizedParams.key,
      message: `Decision context added successfully to "${normalizedParams.key}"`
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to add decision context: ${message}`);
  }
}
