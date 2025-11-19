/**
 * Get a specific decision by key
 * Returns full metadata including tags, layer, scopes, version
 * Optionally includes decision context (v3.2.2)
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter, getDecisionWithContext as dbGetDecisionWithContext } from '../../../database.js';
import { getProjectContext } from '../../../utils/project-context.js';
import { validateActionParams } from '../internal/validation.js';
import { getTaggedDecisions } from '../../../utils/view-queries.js';
import type { GetDecisionParams, GetDecisionResponse, TaggedDecision } from '../types.js';

/**
 * Get a specific decision by key
 *
 * @param params - Decision key and optional include_context flag
 * @param adapter - Optional database adapter (for testing)
 * @returns Decision details or not found
 */
export async function getDecision(
  params: GetDecisionParams & { include_context?: boolean },
  adapter?: DatabaseAdapter
): Promise<GetDecisionResponse> {
  // Validate parameters
  try {
    validateActionParams('decision', 'get', params);
  } catch (error) {
    throw error;
  }

  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  // Validate project context
  const projectId = getProjectContext().getProjectId();

  // Validate parameter
  if (!params.key || params.key.trim() === '') {
    throw new Error('Parameter "key" is required and cannot be empty');
  }

  try {
    // If include_context is true, use the context-aware function
    if (params.include_context) {
      const result = await dbGetDecisionWithContext(actualAdapter, params.key);

      if (!result) {
        return {
          found: false
        };
      }

      return {
        found: true,
        decision: {
          key: result.key,
          value: result.value,
          version: result.version,
          status: result.status as 'active' | 'deprecated' | 'draft',
          layer: result.layer,
          decided_by: result.decided_by,
          updated: result.updated,
          tags: null,
          scopes: null,
          project_id: projectId
        },
        context: result.context.map(ctx => ({
          ...ctx,
          alternatives_considered: ctx.alternatives_considered ? JSON.parse(ctx.alternatives_considered) : null,
          tradeoffs: ctx.tradeoffs ? JSON.parse(ctx.tradeoffs) : null
        }))
      };
    }

    // Standard query without context (backward compatible)
    const rows = await getTaggedDecisions(knex);
    const row = rows.find(r => r.key === params.key && r.project_id === projectId) as TaggedDecision | undefined;

    if (!row) {
      return {
        found: false
      };
    }

    return {
      found: true,
      decision: row
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get decision: ${message}`);
  }
}
