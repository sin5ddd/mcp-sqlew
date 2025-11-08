/**
 * Task get dependencies action
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter } from '../../../database.js';
import { validateActionParams } from '../../../utils/parameter-validator.js';
import { queryTaskDependencies } from '../internal/task-queries.js';

/**
 * Get dependencies for a task (bidirectional: what blocks this task, what this task blocks)
 */
export async function getDependencies(params: {
  task_id: number;
  include_details?: boolean;
}, adapter?: DatabaseAdapter): Promise<any> {
  validateActionParams('task', 'get_dependencies', params);

  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  if (!params.task_id) {
    throw new Error('Parameter "task_id" is required');
  }

  const includeDetails = params.include_details || false;

  try {
    // Check if task exists
    const taskExists = await knex('t_tasks').where({ id: params.task_id }).first();
    if (!taskExists) {
      throw new Error(`Task with id ${params.task_id} not found`);
    }

    // Use the shared helper function
    const deps = await queryTaskDependencies(actualAdapter, params.task_id, includeDetails);

    return {
      task_id: params.task_id,
      blockers: deps.blockers,
      blocking: deps.blocking
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Don't wrap error messages that are already descriptive
    if (message.includes('not found')) {
      throw new Error(message);
    }
    throw new Error(`Failed to get dependencies: ${message}`);
  }
}
