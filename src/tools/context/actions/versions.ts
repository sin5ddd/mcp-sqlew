/**
 * Get version history for a specific decision key
 * Returns all historical versions ordered by timestamp (newest first)
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter } from '../../../database.js';
import { getProjectContext } from '../../../utils/project-context.js';
import { validateActionParams } from '../internal/validation.js';
import type { GetVersionsParams, GetVersionsResponse } from '../types.js';

/**
 * Get version history for a decision
 *
 * @param params - Decision key to get history for
 * @param adapter - Optional database adapter (for testing)
 * @returns Array of historical versions with metadata
 */
export async function getVersions(
  params: GetVersionsParams,
  adapter?: DatabaseAdapter
): Promise<GetVersionsResponse> {
  // Validate parameters
  try {
    validateActionParams('decision', 'versions', params);
  } catch (error) {
    throw error;
  }

  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  // Validate project context
  const projectId = getProjectContext().getProjectId();

  // Validate required parameter
  if (!params.key || params.key.trim() === '') {
    throw new Error('Parameter "key" is required and cannot be empty');
  }

  try {
    // Get key_id for the decision
    const keyResult = await knex('m_context_keys')
      .where({ key_name: params.key })
      .first('id') as { id: number } | undefined;

    if (!keyResult) {
      // Key doesn't exist, return empty history
      return {
        key: params.key,
        history: [],
        count: 0
      };
    }

    const keyId = keyResult.id;

    // Query t_decision_history
    // Note: Agent tracking removed in v4.0 - agent field removed
    const rows = await knex('t_decision_history as dh')
      .where({ 'dh.key_id': keyId, 'dh.project_id': projectId })
      .select(
        'dh.version',
        'dh.value',
        knex.raw(`datetime(dh.ts, 'unixepoch') as timestamp`)
      )
      .orderBy('dh.ts', 'desc') as Array<{
        version: string;
        value: string;
        timestamp: string;
      }>;

    // Transform to response format
    const history = rows.map(row => ({
      version: row.version,
      value: row.value,
      timestamp: row.timestamp
    }));

    return {
      key: params.key,
      history: history,
      count: history.length
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get versions: ${message}`);
  }
}
