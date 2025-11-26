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
import { getTaskBoard } from '../../../utils/view-queries.js';
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

    // Get all tasks then filter in JavaScript
    let rows = await getTaskBoard(knex);

    // Filter by project_id (Constraint #22: Multi-project isolation)
    rows = rows.filter(r => r.project_id === projectId);

    // Filter by status
    if (params.status) {
      if (!STATUS_TO_ID[params.status]) {
        throw new Error(`Invalid status: ${params.status}. Must be one of: todo, in_progress, waiting_review, blocked, done, archived`);
      }
      rows = rows.filter(r => r.status === params.status);
    }

    // Filter by assigned agent
    if (params.assigned_agent) {
      rows = rows.filter(r => r.assigned_to === params.assigned_agent);
    }

    // Filter by layer
    if (params.layer) {
      rows = rows.filter(r => r.layer === params.layer);
    }

    // Filter by tags
    if (params.tags && params.tags.length > 0) {
      // Parse tags (handles both arrays and JSON strings from MCP)
      const tags = parseStringArray(params.tags);
      rows = rows.filter(r => {
        if (!r.tags) return false;
        return tags.every(tag => r.tags!.includes(tag));
      });
    }

    // Add dependency counts if requested
    if (params.include_dependency_counts) {
      const blockerCounts = await knex('v4_task_dependencies')
        .select('blocked_task_id')
        .count('* as count')
        .groupBy('blocked_task_id')
        .then(results => new Map(results.map((r: any) => [r.blocked_task_id, Number(r.count)])));

      const blockingCounts = await knex('v4_task_dependencies')
        .select('blocker_task_id')
        .count('* as count')
        .groupBy('blocker_task_id')
        .then(results => new Map(results.map((r: any) => [r.blocker_task_id, Number(r.count)])));

      rows = rows.map(row => ({
        ...row,
        blocked_by_count: blockerCounts.get(row.task_id) || 0,
        blocking_count: blockingCounts.get(row.task_id) || 0
      }));
    }

    // Sort by updated timestamp (most recent first)
    rows.sort((a, b) => {
      const dateA = new Date(a.updated).getTime();
      const dateB = new Date(b.updated).getTime();
      return dateB - dateA; // desc
    });

    // Pagination
    const limit = params.limit !== undefined ? params.limit : 50;
    const offset = params.offset || 0;

    validateRange(limit, 'Parameter "limit"', 0, 100);
    validateRange(offset, 'Parameter "offset"', 0, Number.MAX_SAFE_INTEGER);

    rows = rows.slice(offset, offset + limit);

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
