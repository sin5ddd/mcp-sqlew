/**
 * Task remove dependency action
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter } from '../../../database.js';
import { validateActionParams } from '../../../utils/parameter-validator.js';

/**
 * Remove dependency between tasks
 */
export async function removeDependency(params: {
  blocker_task_id: number;
  blocked_task_id: number;
}, adapter?: DatabaseAdapter): Promise<any> {
  validateActionParams('task', 'remove_dependency', params);

  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  if (!params.blocker_task_id) {
    throw new Error('Parameter "blocker_task_id" is required');
  }

  if (!params.blocked_task_id) {
    throw new Error('Parameter "blocked_task_id" is required');
  }

  try {
    await knex('v4_task_dependencies')
      .where({
        blocker_task_id: params.blocker_task_id,
        blocked_task_id: params.blocked_task_id
      })
      .delete();

    return {
      success: true,
      message: `Dependency removed: Task #${params.blocker_task_id} no longer blocks Task #${params.blocked_task_id}`
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to remove dependency: ${message}`);
  }
}
