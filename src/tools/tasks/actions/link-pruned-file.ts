/**
 * Task link pruned file action (v3.5.0)
 * Updated for v3.7.0 multi-project support
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter } from '../../../database.js';
import { getProjectContext } from '../../../utils/project-context.js';

/**
 * Link a pruned file to a decision (v3.5.0 Auto-Pruning)
 * Attaches WHY reasoning to pruned files for project archaeology
 */
export async function linkPrunedFile(params: {
  pruned_file_id: number;
  decision_key: string;
}, adapter?: DatabaseAdapter): Promise<any> {
  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  try {
    // Validate pruned_file_id
    if (!params.pruned_file_id || typeof params.pruned_file_id !== 'number') {
      throw new Error('pruned_file_id is required and must be a number');
    }

    // Validate decision_key
    if (!params.decision_key || typeof params.decision_key !== 'string') {
      throw new Error('decision_key is required and must be a string');
    }

    // Get project context (v3.7.0 multi-project support)
    const projectId = getProjectContext().getProjectId();

    // Get decision key_id (with project_id filter)
    const decision = await knex('v4_context_keys as k')
      .whereExists(function() {
        this.select('*')
          .from('v4_decisions as d')
          .whereRaw('d.key_id = k.id')
          .where('d.project_id', projectId);
      })
      .where('k.key_name', params.decision_key)
      .select('k.id as key_id')
      .first() as { key_id: number } | undefined;

    if (!decision) {
      throw new Error(`Decision not found: ${params.decision_key}`);
    }

    // Check if pruned file exists
    const prunedFile = await knex('v4_task_pruned_files')
      .where({ id: params.pruned_file_id })
      .select('id', 'task_id', 'file_path')
      .first() as { id: number; task_id: number; file_path: string } | undefined;

    if (!prunedFile) {
      throw new Error(`Pruned file record not found: ${params.pruned_file_id}`);
    }

    // Update the link
    const updated = await knex('v4_task_pruned_files')
      .where({ id: params.pruned_file_id })
      .update({ linked_decision_id: decision.key_id });

    if (updated === 0) {
      throw new Error(`Failed to link pruned file #${params.pruned_file_id} to decision ${params.decision_key}`);
    }

    return {
      success: true,
      pruned_file_id: params.pruned_file_id,
      decision_key: params.decision_key,
      task_id: prunedFile.task_id,
      file_path: prunedFile.file_path,
      message: `Linked pruned file "${prunedFile.file_path}" to decision "${params.decision_key}"`
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to link pruned file: ${message}`);
  }
}
