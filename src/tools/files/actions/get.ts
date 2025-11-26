/**
 * Get file changes with advanced filtering
 * Uses token-efficient view when no specific filters are applied
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter } from '../../../database.js';
import { getProjectContext } from '../../../utils/project-context.js';
import connectionManager from '../../../utils/connection-manager.js';
import {
  STRING_TO_CHANGE_TYPE,
  STANDARD_LAYERS,
  DEFAULT_QUERY_LIMIT
} from '../../../constants.js';
import { validateChangeType } from '../../../utils/validators.js';
import { validateActionParams } from '../internal/validation.js';
import { buildWhereClause, type FilterCondition } from '../../../utils/query-builder.js';
import type {
  GetFileChangesParams,
  GetFileChangesResponse,
  RecentFileChange
} from '../types.js';

/**
 * Get file changes with advanced filtering.
 * Uses token-efficient view when no specific filters are applied.
 *
 * @param params - Filter parameters
 * @param adapter - Optional database adapter (for testing)
 * @returns Array of file changes with metadata
 */
export async function getFileChanges(
  params: GetFileChangesParams = {},
  adapter?: DatabaseAdapter
): Promise<GetFileChangesResponse> {
  const actualAdapter = adapter ?? getAdapter();

  try {
    // Fail-fast: Validate project context is initialized (Constraint #29)
    const projectId = getProjectContext().getProjectId();

    // Validate parameters
    validateActionParams('file', 'get', params);

    // Execute with connection retry
    return await connectionManager.executeWithRetry(async () => {
      const knex = actualAdapter.getKnex();
      const limit = params.limit || DEFAULT_QUERY_LIMIT;

      // Build filter conditions using query builder
      const filterConditions: FilterCondition[] = [];

      if (params.file_path) {
        filterConditions.push({ type: 'equals', field: 'f.path', value: params.file_path });
      }

      if (params.agent_name) {
        filterConditions.push({ type: 'equals', field: 'a.name', value: params.agent_name });
      }

      if (params.layer) {
        // Validate layer
        if (!STANDARD_LAYERS.includes(params.layer as any)) {
          throw new Error(
            `Invalid layer: ${params.layer}. Must be one of: ${STANDARD_LAYERS.join(', ')}`
          );
        }
        filterConditions.push({ type: 'equals', field: 'l.name', value: params.layer });
      }

      if (params.change_type) {
        validateChangeType(params.change_type);
        const changeTypeInt = STRING_TO_CHANGE_TYPE[params.change_type];
        filterConditions.push({ type: 'equals', field: 'fc.change_type', value: changeTypeInt });
      }

      if (params.since) {
        // Convert ISO 8601 to Unix epoch
        const sinceEpoch = Math.floor(new Date(params.since).getTime() / 1000);
        filterConditions.push({ type: 'greaterThanOrEqual', field: 'fc.ts', value: sinceEpoch });
      }

      // Use view if no specific filters (token efficient)
      // Note: View already includes project_id filtering in application layer
      if (filterConditions.length === 0) {
        const rows = await knex('v_recent_file_changes')
          .where('project_id', projectId)
          .limit(limit)
          .select('*') as RecentFileChange[];

        return {
          changes: rows,
          count: rows.length,
        };
      }

      // Build WHERE clause using query builder
      const { whereClause, params: queryParams } = buildWhereClause(filterConditions);

      // Build query dynamically with filters
      let query = knex('v4_file_changes as fc')
        .join('v4_files as f', 'fc.file_id', 'f.id')
        .join('v4_agents as a', 'fc.agent_id', 'a.id')
        .leftJoin('v4_layers as l', 'fc.layer_id', 'l.id')
        .where('fc.project_id', projectId)
        .select(
          'f.path',
          'a.name as changed_by',
          'l.name as layer',
          knex.raw(`CASE fc.change_type
            WHEN 1 THEN 'created'
            WHEN 2 THEN 'modified'
            ELSE 'deleted'
          END as change_type`),
          'fc.description',
          knex.raw(`datetime(fc.ts, 'unixepoch') as changed_at`)
        )
        .orderBy('fc.ts', 'desc')
        .limit(limit);

      // Apply filter conditions
      if (params.file_path) {
        query = query.where('f.path', params.file_path);
      }

      if (params.agent_name) {
        query = query.where('a.name', params.agent_name);
      }

      if (params.layer) {
        query = query.where('l.name', params.layer);
      }

      if (params.change_type) {
        const changeTypeInt = STRING_TO_CHANGE_TYPE[params.change_type];
        query = query.where('fc.change_type', changeTypeInt);
      }

      if (params.since) {
        const sinceEpoch = Math.floor(new Date(params.since).getTime() / 1000);
        query = query.where('fc.ts', '>=', sinceEpoch);
      }

      const rows = await query as RecentFileChange[];

      return {
        changes: rows,
        count: rows.length,
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get file changes: ${message}`);
  }
}
