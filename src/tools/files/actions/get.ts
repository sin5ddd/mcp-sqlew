/**
 * Get file changes with advanced filtering
 * Uses JOIN queries instead of database views for cross-DB compatibility
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
import { UniversalKnex } from '../../../utils/universal-knex.js';
import { normalizeParams } from '../../../utils/param-normalizer.js';
import { convertChangeTypeArray } from '../../../utils/enum-converter.js';
import type {
  GetFileChangesParams,
  GetFileChangesResponse,
  RecentFileChange
} from '../types.js';

/**
 * Get file changes with advanced filtering.
 * Uses JOIN queries for cross-database compatibility (no views).
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

  // Normalize aliases: path → file_path
  const normalizedParams = normalizeParams(params, {
    path: 'file_path'
  }) as GetFileChangesParams;

  try {
    // Fail-fast: Validate project context is initialized (Constraint #29)
    const projectId = getProjectContext().getProjectId();

    // Validate parameters
    validateActionParams('file', 'get', normalizedParams);

    // Execute with connection retry
    return await connectionManager.executeWithRetry(async () => {
      const knex = actualAdapter.getKnex();
      const db = new UniversalKnex(knex);
      const limit = normalizedParams.limit || DEFAULT_QUERY_LIMIT;

      // Build query using JOINs (no views - cross-DB compatible)
      // Note: Agent tracking removed in v4.0 - changed_by field removed
      let query = knex('v4_file_changes as fc')
        .join('v4_files as f', 'fc.file_id', 'f.id')
        .leftJoin('v4_layers as l', 'fc.layer_id', 'l.id')
        .where('fc.project_id', projectId);

      // Apply filter conditions
      if (normalizedParams.file_path) {
        query = query.where('f.path', normalizedParams.file_path);
      }

      // Note: agent_name filter removed in v4.0 (agent tracking removed)

      if (normalizedParams.layer) {
        // Validate layer
        if (!STANDARD_LAYERS.includes(normalizedParams.layer as any)) {
          throw new Error(
            `Invalid layer: ${normalizedParams.layer}. Must be one of: ${STANDARD_LAYERS.join(', ')}`
          );
        }
        query = query.where('l.name', normalizedParams.layer);
      }

      if (normalizedParams.change_type) {
        validateChangeType(normalizedParams.change_type);
        const changeTypeInt = STRING_TO_CHANGE_TYPE[normalizedParams.change_type];
        query = query.where('fc.change_type', changeTypeInt);
      }

      if (normalizedParams.since) {
        // Convert ISO 8601 to Unix epoch
        const sinceEpoch = Math.floor(new Date(normalizedParams.since).getTime() / 1000);
        query = query.where('fc.ts', '>=', sinceEpoch);
      }

      // Select columns with proper date formatting
      query = query.select(
        'f.path',
        'l.name as layer',
        'fc.change_type',
        'fc.description',
        knex.raw(`${db.dateFunction('fc.ts')} as changed_at`)
      );

      // Order and limit
      query = query
        .orderBy('fc.ts', 'desc')
        .limit(limit);

      const rawRows = await query;
      const rows = convertChangeTypeArray(rawRows) as RecentFileChange[];

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
