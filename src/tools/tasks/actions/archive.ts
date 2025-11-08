/**
 * Task archive action
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter } from '../../../database.js';
import { FileWatcher } from '../../../watcher/index.js';
import { validateActionParams } from '../../../utils/parameter-validator.js';
import connectionManager from '../../../utils/connection-manager.js';
import { logTaskStatusChange } from '../../../utils/activity-logging.js';
import { TASK_STATUS, ID_TO_STATUS } from '../types.js';

/**
 * Archive completed task
 */
export async function archiveTask(params: { task_id: number }, adapter?: DatabaseAdapter): Promise<any> {
  validateActionParams('task', 'archive', params);

  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  if (!params.task_id) {
    throw new Error('Parameter "task_id" is required');
  }

  try {
    return await connectionManager.executeWithRetry(async () => {
      return await actualAdapter.transaction(async (trx) => {
        // Check if task is in 'done' status
        const taskRow = await trx('t_tasks')
          .where({ id: params.task_id })
          .select('status_id')
          .first() as { status_id: number } | undefined;

        if (!taskRow) {
          throw new Error(`Task with id ${params.task_id} not found`);
        }

        if (taskRow.status_id !== TASK_STATUS.DONE) {
          throw new Error(`Task ${params.task_id} must be in 'done' status to archive (current: ${ID_TO_STATUS[taskRow.status_id]})`);
        }

        // Update to archived
        await trx('t_tasks')
          .where({ id: params.task_id })
          .update({ status_id: TASK_STATUS.ARCHIVED });

        // Activity logging
        const systemAgentId = 1;
        await logTaskStatusChange(trx, {
          task_id: params.task_id,
          old_status: TASK_STATUS.DONE,
          new_status: TASK_STATUS.ARCHIVED,
          agent_id: systemAgentId
        });

        // Unregister from file watcher (archived tasks don't need tracking)
        try {
          const watcher = FileWatcher.getInstance();
          watcher.unregisterTask(params.task_id);
        } catch (error) {
          // Watcher may not be initialized, ignore
        }

        return {
          success: true,
          task_id: params.task_id,
          message: `Task ${params.task_id} archived successfully`
        };
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to archive task: ${message}`);
  }
}
