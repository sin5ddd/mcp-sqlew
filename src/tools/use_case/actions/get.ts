/**
 * Use Case Tool - get Action
 * Get complete use case workflow by ID
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter } from '../../../database.js';
import { queryHelpUseCase } from '../../help-queries.js';
import { UseCaseGetParams, UseCaseResult } from '../types.js';

/**
 * Get complete use case workflow
 * Reuses existing queryHelpUseCase from help-queries.ts
 */
export async function getUseCase(
  params: UseCaseGetParams,
  adapter?: DatabaseAdapter
): Promise<UseCaseResult | { error: string }> {
  const actualAdapter = adapter ?? getAdapter();
  return queryHelpUseCase(actualAdapter, params.use_case_id);
}
