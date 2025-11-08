/**
 * Task list action
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter } from '../../../database.js';
import { getProjectContext } from '../../../utils/project-context.js';
import { validateActionParams } from '../../../utils/parameter-validator.js';
import { validateRange } from '../../../utils/validators.js';
import { parseStringArray } from '../../../utils/param-parser.js';
import { detectAndTransitionStaleTasks, autoArchiveOldDoneTasks, detectAndCompleteReviewedTasks, detectAndArchiveOnCommit } from '../../../utils/task-stale-detection.js';
import { STATUS_TO_ID } from '../types.js';

/**
 * List tasks (token-efficient, no descriptions)
 */
export async function listTasks(params: {
  status?: string;
  assigned_agent?: string;
  layer?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
  include_dependency_counts?: boolean;
} = {}, adapter?: DatabaseAdapter): Promise<any> {
  validateActionParams('task', 'list', params);

  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  // Get current project ID for filtering (Constraint #22)
  const projectId = getProjectContext().getProjectId();

  try {
    // Run auto-stale detection, git-aware completion, and auto-archive before listing
    const transitionCount = await detectAndTransitionStaleTasks(actualAdapter);
    const gitCompletedCount = await detectAndCompleteReviewedTasks(actualAdapter);
    const gitArchivedCount = await detectAndArchiveOnCommit(actualAdapter);
    const archiveCount = await autoArchiveOldDoneTasks(actualAdapter);

    // Build query with optional dependency counts
    let query;
    if (params.include_dependency_counts) {
      // Include dependency counts with LEFT JOINs
      const blockersCTE = knex('t_task_dependencies')
        .select('blocked_task_id')
        .count('* as blocked_by_count')
        .groupBy('blocked_task_id')
        .as('blockers');

      const blockingCTE = knex('t_task_dependencies')
        .select('blocker_task_id')
        .count('* as blocking_count')
        .groupBy('blocker_task_id')
        .as('blocking');

      query = knex('v_task_board as vt')
        .leftJoin(blockersCTE, 'vt.id', 'blockers.blocked_task_id')
        .leftJoin(blockingCTE, 'vt.id', 'blocking.blocker_task_id')
        .select(
          'vt.*',
          knex.raw('COALESCE(blockers.blocked_by_count, 0) as blocked_by_count'),
          knex.raw('COALESCE(blocking.blocking_count, 0) as blocking_count')
        );
    } else {
      // Standard query without dependency counts
      query = knex('v_task_board');
    }

    // Filter by project_id (Constraint #22: Multi-project isolation)
    query = query.where(params.include_dependency_counts ? 'vt.project_id' : 'project_id', projectId);

    // Filter by status
    if (params.status) {
      if (!STATUS_TO_ID[params.status]) {
        throw new Error(`Invalid status: ${params.status}. Must be one of: todo, in_progress, waiting_review, blocked, done, archived`);
      }
      query = query.where(params.include_dependency_counts ? 'vt.status' : 'status', params.status);
    }

    // Filter by assigned agent
    if (params.assigned_agent) {
      query = query.where(params.include_dependency_counts ? 'vt.assigned_to' : 'assigned_to', params.assigned_agent);
    }

    // Filter by layer
    if (params.layer) {
      query = query.where(params.include_dependency_counts ? 'vt.layer' : 'layer', params.layer);
    }

    // Filter by tags
    if (params.tags && params.tags.length > 0) {
      // Parse tags (handles both arrays and JSON strings from MCP)
      const tags = parseStringArray(params.tags);
      for (const tag of tags) {
        query = query.where(params.include_dependency_counts ? 'vt.tags' : 'tags', 'like', `%${tag}%`);
      }
    }

    // Order by updated timestamp (most recent first)
    query = query.orderBy(params.include_dependency_counts ? 'vt.updated_ts' : 'updated_ts', 'desc');

    // Pagination
    const limit = params.limit !== undefined ? params.limit : 50;
    const offset = params.offset || 0;

    validateRange(limit, 'Parameter "limit"', 0, 100);
    validateRange(offset, 'Parameter "offset"', 0, Number.MAX_SAFE_INTEGER);

    query = query.limit(limit).offset(offset);

    // Execute query
    const rows = await query;

    return {
      tasks: rows,
      count: rows.length,
      stale_tasks_transitioned: transitionCount,
      git_auto_completed: gitCompletedCount,
      git_archived: gitArchivedCount,
      archived_tasks: archiveCount
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to list tasks: ${message}`);
  }
}
