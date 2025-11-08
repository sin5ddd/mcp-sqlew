/**
 * Task batch create action
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter } from '../../../database.js';
import { validateBatchParams } from '../../../utils/parameter-validator.js';
import connectionManager from '../../../utils/connection-manager.js';
import { createTaskInternal } from './create.js';

/**
 * Create multiple tasks atomically
 */
export async function batchCreateTasks(params: {
  tasks: Array<{
    title: string;
    description?: string;
    priority?: number;
    assigned_agent?: string;
    layer?: string;
    tags?: string[];
  }>;
  atomic?: boolean;
}, adapter?: DatabaseAdapter): Promise<any> {
  validateBatchParams('task', 'tasks', params.tasks, 'create', 50);

  const actualAdapter = adapter ?? getAdapter();

  if (!params.tasks || !Array.isArray(params.tasks)) {
    throw new Error('Parameter "tasks" is required and must be an array');
  }

  if (params.tasks.length > 50) {
    throw new Error('Parameter "tasks" must contain at most 50 items');
  }

  const atomic = params.atomic !== undefined ? params.atomic : true;

  try {
    if (atomic) {
      // Atomic mode: All or nothing
      const results = await connectionManager.executeWithRetry(async () => {
        return await actualAdapter.transaction(async (trx) => {
          const processedResults = [];

          for (const task of params.tasks) {
            try {
              const result = await createTaskInternal(task, actualAdapter, trx);
              processedResults.push({
                title: task.title,
                task_id: result.task_id,
                success: true,
                error: undefined
              });
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              throw new Error(`Batch failed at task "${task.title}": ${errorMessage}`);
            }
          }

          return processedResults;
        });
      });

      return {
        success: true,
        created: results.length,
        failed: 0,
        results: results
      };
    } else {
      // Non-atomic mode: Process each independently
      const results = [];
      let created = 0;
      let failed = 0;

      for (const task of params.tasks) {
        try {
          const result = await connectionManager.executeWithRetry(async () => {
            return await actualAdapter.transaction(async (trx) => {
              return await createTaskInternal(task, actualAdapter, trx);
            });
          });

          results.push({
            title: task.title,
            task_id: result.task_id,
            success: true,
            error: undefined
          });
          created++;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          results.push({
            title: task.title,
            task_id: undefined,
            success: false,
            error: errorMessage
          });
          failed++;
        }
      }

      return {
        success: failed === 0,
        created: created,
        failed: failed,
        results: results
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to execute batch operation: ${message}`);
  }
}
