/**
 * Use Case Tool - list_all Action
 * List all use cases with filtering and pagination
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter } from '../../../database.js';
import { queryHelpListUseCases } from '../../help-queries.js';
import { UseCaseListAllParams, UseCaseListAllResult } from '../types.js';

/**
 * List all use cases with filtering
 * Reuses existing queryHelpListUseCases from help-queries.ts
 */
export async function listAllUseCases(
  params: UseCaseListAllParams,
  adapter?: DatabaseAdapter
): Promise<UseCaseListAllResult | { error: string; available_categories?: string[] }> {
  const actualAdapter = adapter ?? getAdapter();
  return queryHelpListUseCases(actualAdapter, {
    category: params.category,
    complexity: params.complexity,
    limit: params.limit || 20,
    offset: params.offset || 0
  });
}
