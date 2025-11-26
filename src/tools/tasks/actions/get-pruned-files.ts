/**
 * Task get pruned files action (v3.5.0)
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter } from '../../../database.js';

/**
 * Get pruned files for a task (v3.5.0 Auto-Pruning)
 * Returns audit trail of files that were auto-pruned as non-existent
 */
export async function getPrunedFiles(params: {
  task_id: number;
  limit?: number;
}, adapter?: DatabaseAdapter): Promise<any> {
  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  try {
    // Validate task_id
    if (!params.task_id || typeof params.task_id !== 'number') {
      throw new Error('task_id is required and must be a number');
    }

    // Validate task exists
    const task = await knex('v4_tasks').where({ id: params.task_id }).first();
    if (!task) {
      throw new Error(`Task not found: ${params.task_id}`);
    }

    // Get pruned files
    const limit = params.limit || 100;
    const rows = await knex('v4_task_pruned_files as tpf')
      .leftJoin('v4_context_keys as k', 'tpf.linked_decision_id', 'k.id')
      .where('tpf.task_id', params.task_id)
      .select(
        'tpf.id',
        'tpf.file_path',
        knex.raw(`datetime(tpf.pruned_ts, 'unixepoch') as pruned_at`),
        'k.key_name as linked_decision'
      )
      .orderBy('tpf.pruned_ts', 'desc')
      .limit(limit) as Array<{
        id: number;
        file_path: string;
        pruned_at: string;
        linked_decision: string | null;
      }>;

    return {
      success: true,
      task_id: params.task_id,
      pruned_files: rows,
      count: rows.length,
      message: rows.length > 0
        ? `Found ${rows.length} pruned file(s) for task ${params.task_id}`
        : `No pruned files for task ${params.task_id}`
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get pruned files: ${message}`);
  }
}
