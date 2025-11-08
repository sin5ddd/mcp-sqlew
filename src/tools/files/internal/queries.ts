/**
 * Shared database queries for file operations
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { Knex } from 'knex';
import {
  getOrCreateFile,
  getOrCreateAgent,
  getLayerId
} from '../../../database.js';
import {
  STRING_TO_CHANGE_TYPE,
  STANDARD_LAYERS
} from '../../../constants.js';
import { validateChangeType } from '../../../utils/validators.js';
import { logFileRecord } from '../../../utils/activity-logging.js';
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

  // Auto-register file and agent (v3.7.3: pass projectId)
  const fileId = await getOrCreateFile(adapter, projectId, params.file_path, trx);
  const agentId = await getOrCreateAgent(adapter, params.agent_name, trx);

  // Current timestamp
  const ts = Math.floor(Date.now() / 1000);

  // Insert file change record with project_id
  const [changeId] = await knex('t_file_changes').insert({
    file_id: fileId,
    agent_id: agentId,
    layer_id: layerId,
    change_type: changeTypeInt,
    description: params.description || null,
    project_id: projectId,
    ts: ts
  });

  // Activity logging (replaces trigger)
  await logFileRecord(knex, {
    file_path: params.file_path,
    change_type: changeTypeInt,
    agent_id: agentId,
    layer_id: layerId || undefined
  });

  const timestamp = new Date(ts * 1000).toISOString();

  return {
    success: true,
    change_id: Number(changeId),
    timestamp: timestamp,
  };
}
