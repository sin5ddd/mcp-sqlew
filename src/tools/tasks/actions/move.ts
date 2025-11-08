/**
 * Task move action (status transitions)
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter } from '../../../database.js';
import { FileWatcher } from '../../../watcher/index.js';
import { validateActionParams } from '../../../utils/parameter-validator.js';
import connectionManager from '../../../utils/connection-manager.js';
import { logTaskStatusChange } from '../../../utils/activity-logging.js';
import { detectAndTransitionStaleTasks, autoArchiveOldDoneTasks } from '../../../utils/task-stale-detection.js';
import { TASK_STATUS } from '../types.js';
import { validateStatusTransition, getStatusId, getStatusName } from '../internal/state-machine.js';

/**
 * Move task to different status
 */
export async function moveTask(params: {
  task_id: number;
  new_status: string;
}, adapter?: DatabaseAdapter): Promise<any> {
  validateActionParams('task', 'move', params);

  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  if (!params.task_id) {
    throw new Error('Parameter "task_id" is required');
  }

  if (!params.new_status) {
    throw new Error('Parameter "new_status" is required');
  }

  try {
    // Run auto-stale detection and auto-archive before move
    await detectAndTransitionStaleTasks(actualAdapter);
    await autoArchiveOldDoneTasks(actualAdapter);

    return await connectionManager.executeWithRetry(async () => {
      return await actualAdapter.transaction(async (trx) => {
        // Get current status
        const taskRow = await trx('t_tasks')
          .where({ id: params.task_id })
          .select('status_id')
          .first() as { status_id: number } | undefined;

        if (!taskRow) {
          throw new Error(`Task with id ${params.task_id} not found`);
        }

        const currentStatusId = taskRow.status_id;
        const newStatusId = getStatusId(params.new_status);

        // Validate transition
        validateStatusTransition(currentStatusId, params.new_status);

        // Update status
        const updateData: any = {
          status_id: newStatusId
        };

        // Set completed_ts when moving to done
        if (newStatusId === TASK_STATUS.DONE) {
          updateData.completed_ts = Math.floor(Date.now() / 1000);
        }

        await trx('t_tasks')
          .where({ id: params.task_id })
          .update(updateData);

        // Activity logging (replaces trigger)
        const systemAgentId = 1;
        await logTaskStatusChange(trx, {
          task_id: params.task_id,
          old_status: currentStatusId,
          new_status: newStatusId,
          agent_id: systemAgentId
        });

        // Update watcher if moving to done or archived (stop watching)
        if (params.new_status === 'done' || params.new_status === 'archived') {
          try {
            const watcher = FileWatcher.getInstance();
            watcher.unregisterTask(params.task_id);
          } catch (error) {
            // Watcher may not be initialized, ignore
          }
        }

        return {
          success: true,
          task_id: params.task_id,
          old_status: getStatusName(currentStatusId),
          new_status: params.new_status,
          message: `Task ${params.task_id} moved from ${getStatusName(currentStatusId)} to ${params.new_status}`
        };
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Preserve validation errors (they already contain helpful information)
    if (message.startsWith('{') && message.includes('"error"')) {
      throw error;
    }

    throw new Error(`Failed to move task: ${message}`);
  }
}
