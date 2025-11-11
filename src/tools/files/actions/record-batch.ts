/**
 * Record multiple file changes in a single batch operation (FR-005)
 * Supports atomic (all succeed or all fail) and non-atomic modes
 * Limit: 50 items per batch (constraint #3)
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter } from '../../../database.js';
import { validateBatchParams, validateFileChangeItem } from '../internal/validation.js';
import { recordFileChangeInternal } from '../internal/queries.js';
import { getProjectContext } from '../../../utils/project-context.js';
import { validateBatch, formatBatchValidationError } from '../../../utils/batch-validation.js';
import type {
  RecordFileChangeBatchParams,
  RecordFileChangeBatchResponse
} from '../types.js';

/**
 * Record multiple file changes in a single batch operation (FR-005)
 * Supports atomic (all succeed or all fail) and non-atomic modes
 * Limit: 50 items per batch (constraint #3)
 *
 * @param params - Batch parameters with array of file changes and atomic flag
 * @param adapter - Optional database adapter (for testing)
 * @returns Response with success status and detailed results for each item
 */
export async function recordFileChangeBatch(
  params: RecordFileChangeBatchParams,
  adapter?: DatabaseAdapter
): Promise<RecordFileChangeBatchResponse> {
  const actualAdapter = adapter ?? getAdapter();

  // Validate batch parameters
  validateBatchParams('file', 'file_changes', params.file_changes, 'record', 50);

  if (params.file_changes.length === 0) {
    return {
      success: true,
      inserted: 0,
      failed: 0,
      results: []
    };
  }

  // Pre-validate all items before transaction
  const validationResult = await validateBatch(
    params.file_changes,
    validateFileChangeItem,
    actualAdapter
  );

  if (!validationResult.valid) {
    throw new Error(formatBatchValidationError(validationResult));
  }

  // Fail-fast: Validate project context is initialized (Constraint #29)
  const projectId = getProjectContext().getProjectId();

  const atomic = params.atomic !== undefined ? params.atomic : true;

  try {
    if (atomic) {
      // Atomic mode: All or nothing
      const results = await actualAdapter.transaction(async (trx) => {
        const processedResults = [];

        for (const fileChange of params.file_changes) {
          try {
            const result = await recordFileChangeInternal(fileChange, actualAdapter, projectId, trx);
            processedResults.push({
              file_path: fileChange.file_path,
              change_id: result.change_id,
              timestamp: result.timestamp,
              success: true,
              error: undefined
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Batch failed at file "${fileChange.file_path}": ${message}`);
          }
        }

        return processedResults;
      });

      return {
        success: true,
        inserted: results.length,
        failed: 0,
        results: results
      };
    } else {
      // Non-atomic mode: Process each independently
      const results = [];
      let inserted = 0;
      let failed = 0;

      for (const fileChange of params.file_changes) {
        try {
          const result = await actualAdapter.transaction(async (trx) => {
            return await recordFileChangeInternal(fileChange, actualAdapter, projectId, trx);
          });

          results.push({
            file_path: fileChange.file_path,
            change_id: result.change_id,
            timestamp: result.timestamp,
            success: true,
            error: undefined
          });
          inserted++;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          results.push({
            file_path: fileChange.file_path,
            change_id: undefined,
            timestamp: undefined,
            success: false,
            error: message
          });
          failed++;
        }
      }

      return {
        success: failed === 0,
        inserted: inserted,
        failed: failed,
        results: results
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to execute batch operation: ${message}`);
  }
}
