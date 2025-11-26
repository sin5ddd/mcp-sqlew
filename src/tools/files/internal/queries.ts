/**
 * Shared database queries for file operations
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { Knex } from 'knex';
import {
  getOrCreateFile,
  getLayerId
} from '../../../database.js';
import {
  STRING_TO_CHANGE_TYPE,
  STANDARD_LAYERS
} from '../../../constants.js';
import { validateChangeType } from '../../../utils/validators.js';
import type { RecordFileChangeParams, RecordFileChangeResponse } from '../types.js';

/**
 * Internal helper: Record file change without transaction wrapper
 * Used by recordFileChange (with transaction) and recordFileChangeBatch (manages its own transaction)
 *
 * @param params - File change parameters
 * @param adapter - Database adapter instance
 * @param projectId - Project ID
 * @param trx - Optional transaction
 * @returns Success response with change ID and timestamp
 */
export async function recordFileChangeInternal(
  params: RecordFileChangeParams,
  adapter: DatabaseAdapter,
  projectId: number,
  trx?: Knex.Transaction
): Promise<RecordFileChangeResponse> {
  const knex = trx || adapter.getKnex();

  // Validate change_type
  validateChangeType(params.change_type);
  const changeTypeInt = STRING_TO_CHANGE_TYPE[params.change_type];

  // Validate layer if provided
  let layerId: number | null = null;
  if (params.layer) {
    if (!STANDARD_LAYERS.includes(params.layer as any)) {
      throw new Error(
        `Invalid layer: ${params.layer}. Must be one of: ${STANDARD_LAYERS.join(', ')}`
      );
    }
    layerId = await getLayerId(adapter, params.layer, trx);
    if (layerId === null) {
      throw new Error(`Layer not found: ${params.layer}`);
    }
  }

  // Auto-register file (v3.7.3: pass projectId)
  // Note: Agent tracking removed in v4.0
  const fileId = await getOrCreateFile(adapter, projectId, params.file_path, trx);

  // Current timestamp
  const ts = Math.floor(Date.now() / 1000);

  // Insert file change record with project_id (agent_id removed in v4.0)
  const [changeId] = await knex('v4_file_changes').insert({
    file_id: fileId,
    layer_id: layerId,
    change_type: changeTypeInt,
    description: params.description || null,
    project_id: projectId,
    ts: ts
  });

  const timestamp = new Date(ts * 1000).toISOString();

  return {
    success: true,
    change_id: Number(changeId),
    timestamp: timestamp,
  };
}
