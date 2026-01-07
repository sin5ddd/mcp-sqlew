/**
 * Check for updates since a given timestamp (FR-003 Phase A)
 * Lightweight polling mechanism using COUNT queries
 * Token cost: ~5-10 tokens per check
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter } from '../../../database.js';
import { getProjectContext } from '../../../utils/project-context.js';
import { validateActionParams } from '../internal/validation.js';
import type { HasUpdatesParams, HasUpdatesResponse } from '../types.js';

/**
 * Check for updates since timestamp
 *
 * @param params - Agent name and since_timestamp (ISO 8601)
 * @param adapter - Optional database adapter (for testing)
 * @returns Boolean flag and counts for decisions
 */
export async function hasUpdates(
  params: HasUpdatesParams,
  adapter?: DatabaseAdapter
): Promise<HasUpdatesResponse> {
  // Validate parameters
  validateActionParams('decision', 'has_updates', params);

  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  // Validate project context
  const projectId = getProjectContext().getProjectId();

  try {
    // Parse ISO timestamp to Unix epoch
    const sinceDate = new Date(params.since_timestamp);
    if (isNaN(sinceDate.getTime())) {
      throw new Error(`Invalid since_timestamp format: ${params.since_timestamp}. Use ISO 8601 format (e.g., "2025-10-14T08:00:00Z")`);
    }
    const sinceTs = Math.floor(sinceDate.getTime() / 1000);

    // Count decisions updated since timestamp (both string and numeric tables)
    const decisionCount1 = await knex('v4_decisions')
      .where({ project_id: projectId })
      .where('ts', '>', sinceTs)
      .count('* as count')
      .first() as { count: number };

    const decisionCount2 = await knex('v4_decisions_numeric')
      .where({ project_id: projectId })
      .where('ts', '>', sinceTs)
      .count('* as count')
      .first() as { count: number };

    const decisionsCount = (decisionCount1?.count || 0) + (decisionCount2?.count || 0);

    // Determine if there are any updates
    const hasUpdatesFlag = decisionsCount > 0;

    return {
      has_updates: hasUpdatesFlag,
      counts: {
        decisions: decisionsCount
      }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to check for updates: ${message}`);
  }
}
