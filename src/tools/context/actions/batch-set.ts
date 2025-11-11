/**
 * Set multiple decisions in a single batch operation (FR-005)
 * Supports atomic (all succeed or all fail) and non-atomic modes
 * Limit: 50 items per batch (constraint #3)
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter } from '../../../database.js';
import { getProjectContext } from '../../../utils/project-context.js';
import connectionManager from '../../../utils/connection-manager.js';
import { validateDecisionItem } from '../internal/validation.js';
import { setDecisionInternal } from '../internal/queries.js';
import { validateBatch, formatBatchValidationError } from '../../../utils/batch-validation.js';
import type { SetDecisionBatchParams, SetDecisionBatchResponse } from '../types.js';

/**
 * Set multiple decisions in batch
 *
 * @param params - Batch parameters with array of decisions and atomic flag
 * @param adapter - Optional database adapter (for testing)
 * @returns Response with success status and detailed results for each item
 */
export async function setDecisionBatch(
  params: SetDecisionBatchParams,
  adapter?: DatabaseAdapter
): Promise<SetDecisionBatchResponse> {
  const actualAdapter = adapter ?? getAdapter();

  // Basic parameter validation
  if (!params.decisions || !Array.isArray(params.decisions)) {
    throw new Error('Parameter "decisions" is required and must be an array');
  }

  if (params.decisions.length > 50) {
    throw new Error('Parameter "decisions" must contain at most 50 items');
  }

  // Pre-validate all decisions before transaction (v3.8.0 enhancement)
  // Comprehensive field-level validation replaces old validateBatchParams
  const validationResult = await validateBatch(params.decisions, validateDecisionItem, actualAdapter);
  if (!validationResult.valid) {
    throw new Error(formatBatchValidationError(validationResult));
  }

  if (params.decisions.length === 0) {
    return {
      success: true,
      inserted: 0,
      failed: 0,
      results: []
    };
  }

  if (params.decisions.length > 50) {
    throw new Error('Parameter "decisions" must contain at most 50 items');
  }

  // Validate project context
  const projectId = getProjectContext().getProjectId();

  const atomic = params.atomic !== undefined ? params.atomic : true;

  try {
    if (atomic) {
      // Atomic mode: All or nothing
      const results = await connectionManager.executeWithRetry(async () => {
        return await actualAdapter.transaction(async (trx) => {
          const processedResults = [];

          for (const decision of params.decisions) {
            try {
              const result = await setDecisionInternal(decision, actualAdapter, projectId, trx);
              processedResults.push({
                key: decision.key,
                key_id: result.key_id,
                version: result.version,
                success: true,
                error: undefined
              });
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              throw new Error(`Batch failed at decision "${decision.key}": ${message}`);
            }
          }

          return processedResults;
        });
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

      for (const decision of params.decisions) {
        try {
          const result = await connectionManager.executeWithRetry(async () => {
            return await actualAdapter.transaction(async (trx) => {
              return await setDecisionInternal(decision, actualAdapter, projectId, trx);
            });
          });

          results.push({
            key: decision.key,
            key_id: result.key_id,
            version: result.version,
            success: true,
            error: undefined
          });
          inserted++;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          results.push({
            key: decision.key,
            key_id: undefined,
            version: undefined,
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
