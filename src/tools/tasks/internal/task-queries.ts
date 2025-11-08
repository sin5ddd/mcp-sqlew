/**
 * Task query helper functions
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getProjectContext } from '../../../utils/project-context.js';

/**
 * Internal helper: Query task dependencies (used by getTask and getDependencies)
 */
export async function queryTaskDependencies(
  adapter: DatabaseAdapter,
  taskId: number,
  includeDetails: boolean = false
): Promise<{ blockers: any[], blocking: any[] }> {
  const knex = adapter.getKnex();
  const projectId = getProjectContext().getProjectId();

  // Build query based on include_details flag
  const selectFields = includeDetails
    ? [
        't.id',
        't.title',
        's.name as status',
        't.priority',
        'aa.name as assigned_to',
        't.created_ts',
        't.updated_ts',
        'td.description'
      ]
    : [
        't.id',
        't.title',
        's.name as status',
        't.priority'
      ];

  // Get blockers (tasks that block this task) - with project_id isolation
  let blockersQuery = knex('t_tasks as t')
    .join('t_task_dependencies as d', 't.id', 'd.blocker_task_id')
    .leftJoin('m_task_statuses as s', 't.status_id', 's.id')
    .leftJoin('m_agents as aa', 't.assigned_agent_id', 'aa.id')
    .where({ 'd.blocked_task_id': taskId, 'd.project_id': projectId, 't.project_id': projectId })
    .select(selectFields);

  if (includeDetails) {
    blockersQuery = blockersQuery
      .leftJoin('t_task_details as td', function() {
        this.on('t.id', '=', 'td.task_id')
            .andOn('t.project_id', '=', 'td.project_id');
      });
  }

  const blockers = await blockersQuery;

  // Get blocking (tasks this task blocks) - with project_id isolation
  let blockingQuery = knex('t_tasks as t')
    .join('t_task_dependencies as d', 't.id', 'd.blocked_task_id')
    .leftJoin('m_task_statuses as s', 't.status_id', 's.id')
    .leftJoin('m_agents as aa', 't.assigned_agent_id', 'aa.id')
    .where({ 'd.blocker_task_id': taskId, 'd.project_id': projectId, 't.project_id': projectId })
    .select(selectFields);

  if (includeDetails) {
    blockingQuery = blockingQuery
      .leftJoin('t_task_details as td', function() {
        this.on('t.id', '=', 'td.task_id')
            .andOn('t.project_id', '=', 'td.project_id');
      });
  }

  const blocking = await blockingQuery;

  return { blockers, blocking };
}
