/**
 * Get summary statistics for all architecture layers
 * Uses the v_layer_summary view for token efficiency
 * PROJECT-SCOPED: Only returns data for current project (Constraint #38)
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter } from '../../../database.js';
import { getProjectContext } from '../../../utils/project-context.js';
import connectionManager from '../../../utils/connection-manager.js';
import { validateActionParams } from '../../../utils/parameter-validator.js';
import type { GetLayerSummaryResponse, LayerSummary } from '../types.js';

/**
 * Get summary statistics for all architecture layers
 *
 * @param adapter - Optional database adapter (for testing)
 * @returns Layer summaries for all 5 standard layers
 */
export async function getLayerSummary(
  adapter?: DatabaseAdapter
): Promise<GetLayerSummaryResponse> {
  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  try {
    // Validate parameters
    validateActionParams('stats', 'layer_summary', {});

    return await connectionManager.executeWithRetry(async () => {
      // Get current project ID (Constraint #38 - project-scoped by default)
      const projectId = getProjectContext().getProjectId();

      const summary = await knex('v_layer_summary')
        .select('layer', 'decisions_count', 'file_changes_count', 'constraints_count')
        .where('project_id', projectId)
        .orderBy('layer') as LayerSummary[];

      return {
        summary,
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get layer summary: ${message}`);
  }
}
