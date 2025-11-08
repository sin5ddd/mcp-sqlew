/**
 * Record a file change with optional layer assignment and description
 * Auto-registers the file and agent if they don't exist
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter } from '../../../database.js';
import { getProjectContext } from '../../../utils/project-context.js';
import connectionManager from '../../../utils/connection-manager.js';
import { validateActionParams } from '../internal/validation.js';
import { recordFileChangeInternal } from '../internal/queries.js';
import type { RecordFileChangeParams, RecordFileChangeResponse } from '../types.js';

/**
 * Record a file change with optional layer assignment and description.
 * Auto-registers the file and agent if they don't exist.
 *
 * @param params - File change parameters
 * @param adapter - Optional database adapter (for testing)
 * @returns Success response with change ID and timestamp
 */
export async function recordFileChange(
  params: RecordFileChangeParams,
  adapter?: DatabaseAdapter
): Promise<RecordFileChangeResponse> {
  const actualAdapter = adapter ?? getAdapter();

  try {
    // Validate parameters
    validateActionParams('file', 'record', params);

    // Fail-fast: Validate project context is initialized (Constraint #29)
    const projectId = getProjectContext().getProjectId();

    // Use transaction for atomicity with connection retry
    return await connectionManager.executeWithRetry(async () => {
      return await actualAdapter.transaction(async (trx) => {
        return await recordFileChangeInternal(params, actualAdapter, projectId, trx);
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to record file change: ${message}`);
  }
}
