/**
 * Clear old data from the database
 * Deletes messages and file changes older than specified thresholds
 * Preserves decision_history, constraints, and core decisions
 * PROJECT-SCOPED: Only deletes data from current project (Constraint #40)
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter } from '../../../database.js';
import { getProjectContext } from '../../../utils/project-context.js';
import connectionManager from '../../../utils/connection-manager.js';
import { validateActionParams } from '../../../utils/parameter-validator.js';
import { calculateFileChangeCutoff, releaseInactiveAgents } from '../../../utils/retention.js';
import { cleanupWithCustomRetention } from '../../../utils/cleanup.js';
import type { ClearOldDataParams, ClearOldDataResponse } from '../types.js';

/**
 * Clear old data from the database
 *
 * If parameters are not provided, uses config-based weekend-aware retention.
 * If parameters are provided, they override m_config settings (no weekend-awareness).
 *
 * @param params - Optional parameters for cleanup thresholds (overrides config)
 * @param adapter - Optional database adapter (for testing)
 * @returns Counts of deleted records
 */
export async function clearOldData(
  params?: ClearOldDataParams,
  adapter?: DatabaseAdapter
): Promise<ClearOldDataResponse> {
  const actualAdapter = adapter ?? getAdapter();

  try {
    // Validate parameters
    validateActionParams('stats', 'clear', params || {});

    return await connectionManager.executeWithRetry(async () => {
      // Get current project ID (Constraint #40 - respect project boundaries)
      const projectId = getProjectContext().getProjectId();

      // Calculate cutoff threshold BEFORE starting transaction to avoid connection pool deadlock
      // (calculateFileChangeCutoff queries m_config table, which would try to acquire a second connection)
      const fileChangesThreshold = params?.file_changes_older_than_days === undefined
        ? await calculateFileChangeCutoff(actualAdapter)
        : null;

      return await actualAdapter.transaction(async (trx) => {
        let messagesDeleted = 0;
        let fileChangesDeleted = 0;
        let activityLogsDeleted = 0;

        if (params?.messages_older_than_hours !== undefined || params?.file_changes_older_than_days !== undefined) {
          // Parameters provided: use custom retention (no weekend-awareness)
          const result = await cleanupWithCustomRetention(
            actualAdapter,
            params.messages_older_than_hours,
            params.file_changes_older_than_days,
            trx
          );
          messagesDeleted = result.messagesDeleted;
          fileChangesDeleted = result.fileChangesDeleted;
          activityLogsDeleted = result.activityLogsDeleted;
        } else {
          // No parameters: use config-based weekend-aware retention
          // (threshold already calculated above, before transaction started)

          // Delete file changes (project-scoped)
          fileChangesDeleted = await trx('t_file_changes')
            .where('project_id', projectId)
            .where('ts', '<', fileChangesThreshold!)
            .delete();

          // Delete activity logs (uses same threshold as file changes, project-scoped)
          activityLogsDeleted = await trx('t_activity_log')
            .where('project_id', projectId)
            .where('ts', '<', fileChangesThreshold!)
            .delete();
        }

        // Release inactive generic agent slots (24 hours of inactivity)
        const agentsReleased = await releaseInactiveAgents(actualAdapter, 24, trx);

        return {
          success: true,
          messages_deleted: messagesDeleted,
          file_changes_deleted: fileChangesDeleted,
          activity_logs_deleted: activityLogsDeleted,
          agents_released: agentsReleased,
        };
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to clear old data: ${message}`);
  }
}
