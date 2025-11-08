/**
 * List decision contexts action
 * Query decision contexts with optional filters
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter, listDecisionContexts as dbListDecisionContexts } from '../../../database.js';
import { validateActionParams } from '../internal/validation.js';

/**
 * List decision contexts
 *
 * @param params - Filter parameters
 * @param adapter - Optional database adapter (for testing)
 * @returns Array of decision contexts
 */
export async function listDecisionContextsAction(
  params: any,
  adapter?: DatabaseAdapter
): Promise<any> {
  // Validate parameters
  validateActionParams('decision', 'list_decision_contexts', params);

  const actualAdapter = adapter ?? getAdapter();

  try {
    const contexts = await dbListDecisionContexts(actualAdapter, {
      decisionKey: params.decision_key,
      relatedTaskId: params.related_task_id,
      relatedConstraintId: params.related_constraint_id,
      decidedBy: params.decided_by,
      limit: params.limit || 50,
      offset: params.offset || 0
    });

    return {
      success: true,
      contexts: contexts.map(ctx => ({
        ...ctx,
        // Parse JSON fields for display
        alternatives_considered: ctx.alternatives_considered ? JSON.parse(ctx.alternatives_considered) : null,
        tradeoffs: ctx.tradeoffs ? JSON.parse(ctx.tradeoffs) : null
      })),
      count: contexts.length
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to list decision contexts: ${message}`);
  }
}
