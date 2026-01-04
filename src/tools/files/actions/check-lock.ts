/**
 * Check if a file is "locked" (recently modified by another agent)
 * Useful to prevent concurrent edits by multiple agents
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter } from '../../../database.js';
import { getProjectContext } from '../../../utils/project-context.js';
import connectionManager from '../../../utils/connection-manager.js';
import { CHANGE_TYPE_TO_STRING } from '../../../constants.js';
import { validateActionParams } from '../internal/validation.js';
import { normalizeParams } from '../../../utils/param-normalizer.js';
import type { CheckFileLockParams, CheckFileLockResponse } from '../types.js';

/**
 * Check if a file is "locked" (recently modified by another agent).
 * Useful to prevent concurrent edits by multiple agents.
 *
 * @param params - File path and lock duration
 * @param adapter - Optional database adapter (for testing)
 * @returns Lock status with details
 */
export async function checkFileLock(
  params: CheckFileLockParams,
  adapter?: DatabaseAdapter
): Promise<CheckFileLockResponse> {
  const actualAdapter = adapter ?? getAdapter();

  // Normalize aliases: path → file_path, duration → lock_duration
  const normalizedParams = normalizeParams(params, {
    path: 'file_path',
    duration: 'lock_duration'
  }) as CheckFileLockParams;

  try {
    // Fail-fast: Validate project context is initialized (Constraint #29)
    const projectId = getProjectContext().getProjectId();

    // Validate parameters
    validateActionParams('file', 'check_lock', normalizedParams);

    // Execute with connection retry
    return await connectionManager.executeWithRetry(async () => {
      const knex = actualAdapter.getKnex();
      const lockDuration = normalizedParams.lock_duration || 300; // Default 5 minutes
      const currentTime = Math.floor(Date.now() / 1000);
      const lockThreshold = currentTime - lockDuration;

      // Get the most recent change to this file within current project
      // Note: Agent tracking removed in v4.0 - last_agent field removed
      const result = await knex('v4_file_changes as fc')
        .join('v4_files as f', 'fc.file_id', 'f.id')
        .where('f.path', normalizedParams.file_path)
        .where('fc.project_id', projectId)
        .select('fc.change_type', 'fc.ts')
        .orderBy('fc.ts', 'desc')
        .limit(1)
        .first() as { change_type: number; ts: number } | undefined;

      if (!result) {
        // File never changed
        return {
          locked: false,
        };
      }

      // Check if within lock duration
      if (result.ts >= lockThreshold) {
        return {
          locked: true,
          last_change: new Date(result.ts * 1000).toISOString(),
          change_type: CHANGE_TYPE_TO_STRING[result.change_type as 1 | 2 | 3],
        };
      }

      // Not locked (too old)
      return {
        locked: false,
        last_change: new Date(result.ts * 1000).toISOString(),
        change_type: CHANGE_TYPE_TO_STRING[result.change_type as 1 | 2 | 3],
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to check file lock: ${message}`);
  }
}
