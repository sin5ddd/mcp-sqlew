/**
 * List decision contexts action
 * Query decision contexts with optional filters
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter, listDecisionContexts as dbListDecisionContexts } from '../../../database.js';
import { validateActionParams } from '../internal/validation.js';
import { normalizeParams } from '../../../utils/param-normalizer.js';

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
  // Normalize aliases: key → decision_key
  const normalizedParams = normalizeParams(params, {
    key: 'decision_key'
  });

  // Validate parameters
  validateActionParams('decision', 'list_decision_contexts', normalizedParams);

  const actualAdapter = adapter ?? getAdapter();

  try {
    const contexts = await dbListDecisionContexts(actualAdapter, {
      decisionKey: normalizedParams.decision_key,
      relatedTaskId: normalizedParams.related_task_id,
      relatedConstraintId: normalizedParams.related_constraint_id,
      decidedBy: normalizedParams.decided_by,
      limit: normalizedParams.limit || 50,
      offset: normalizedParams.offset || 0
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
