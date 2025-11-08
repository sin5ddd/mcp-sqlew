/**
 * Set or update a decision in the context
 * Auto-detects numeric vs string values and routes to appropriate table
 * Supports tags, layers, scopes, and version tracking
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter } from '../../../database.js';
import { getProjectContext } from '../../../utils/project-context.js';
import connectionManager from '../../../utils/connection-manager.js';
import {
  debugLogFunctionEntry,
  debugLogFunctionExit,
  debugLogTransaction,
  debugLogCriticalError
} from '../../../utils/debug-logger.js';
import { validateActionParams } from '../internal/validation.js';
import { setDecisionInternal } from '../internal/queries.js';
import type { SetDecisionParams, SetDecisionResponse } from '../types.js';

/**
 * Set or update a decision in the context
 *
 * @param params - Decision parameters
 * @param adapter - Optional database adapter (for testing)
 * @returns Response with success status and metadata
 */
export async function setDecision(
  params: SetDecisionParams,
  adapter?: DatabaseAdapter
): Promise<SetDecisionResponse> {
  debugLogFunctionEntry('setDecision', params);

  // Validate parameters
  try {
    validateActionParams('decision', 'set', params);
  } catch (error) {
    throw error;
  }

  const actualAdapter = adapter ?? getAdapter();

  try {
    debugLogTransaction('START', 'setDecision');

    // Validate project context (Constraint #29 - fail-fast before mutations)
    const projectId = getProjectContext().getProjectId();

    // Use transaction for atomicity with connection retry
    const result = await connectionManager.executeWithRetry(async () => {
      return await actualAdapter.transaction(async (trx) => {
        debugLogTransaction('COMMIT', 'setDecision-transaction-begin');
        const internalResult = await setDecisionInternal(params, actualAdapter, projectId, trx);
        debugLogTransaction('COMMIT', 'setDecision-transaction-end');
        return internalResult;
      });
    });

    debugLogFunctionExit('setDecision', true, result);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    debugLogCriticalError('setDecision', error, {
      function: 'setDecision',
      params
    });
    debugLogTransaction('ROLLBACK', 'setDecision');
    debugLogFunctionExit('setDecision', false, undefined, error);
    throw new Error(`Failed to set decision: ${message}`);
  }
}
