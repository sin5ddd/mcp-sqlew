/**
 * Get comprehensive database statistics
 * Returns counts for all major tables and database health metrics
 * PROJECT-SCOPED: Only returns counts for current project (Constraint #38)
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter } from '../../../database.js';
import { getProjectContext } from '../../../utils/project-context.js';
import connectionManager from '../../../utils/connection-manager.js';
import { validateActionParams } from '../../../utils/parameter-validator.js';
import type { GetStatsResponse } from '../types.js';

/**
 * Get comprehensive database statistics
 *
 * @param adapter - Optional database adapter (for testing)
 * @returns Complete database statistics
 */
export async function getStats(
  adapter?: DatabaseAdapter
): Promise<GetStatsResponse> {
  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  try {
    // Validate parameters
    validateActionParams('stats', 'db_stats', {});

    return await connectionManager.executeWithRetry(async () => {
      // Get current project ID (Constraint #38 - project-scoped by default)
      const projectId = getProjectContext().getProjectId();

      // Helper to get count from a table with project_id filtering
      const getCount = async (table: string, additionalWhere?: Record<string, any>): Promise<number> => {
        let query = knex(table)
          .count('* as count')
          .where('project_id', projectId);

        if (additionalWhere) {
          query = query.where(additionalWhere);
        }

        const result = await query.first() as { count: number };
        return result.count;
      };

      // Helper to get count from master tables (no project_id)
      const getMasterCount = async (table: string): Promise<number> => {
        const result = await knex(table)
          .count('* as count')
          .first() as { count: number };
        return result.count;
      };

      // Get all statistics (note: all await calls!)
      // Master tables - no project_id filtering
      const agents = await getMasterCount('m_agents');
      const files = await getMasterCount('m_files');
      const context_keys = await getMasterCount('m_context_keys');
      const tags = await getMasterCount('m_tags');
      const scopes = await getMasterCount('m_scopes');
      const layers = await getMasterCount('m_layers');

      // Decisions (active vs total) - project-scoped
      const active_decisions = await getCount('t_decisions', { status: 1 });
      const total_decisions = await getCount('t_decisions');

      // File changes - project-scoped
      const file_changes = await getCount('t_file_changes');

      // Constraints (active vs total) - project-scoped
      const active_constraints = await getCount('t_constraints', { active: 1 });
      const total_constraints = await getCount('t_constraints');

      // Task statistics (v3.x) - project-scoped
      const total_tasks = await getCount('t_tasks');

      // Active tasks (exclude done and archived)
      const active_tasks = await knex('t_tasks')
        .count('* as count')
        .where('project_id', projectId)
        .whereNotIn('status_id', [5, 6])
        .first() as { count: number };

      // Tasks by status (1=todo, 2=in_progress, 3=waiting_review, 4=blocked, 5=done, 6=archived)
      const tasks_by_status = {
        todo: await getCount('t_tasks', { status_id: 1 }),
        in_progress: await getCount('t_tasks', { status_id: 2 }),
        waiting_review: await getCount('t_tasks', { status_id: 3 }),
        blocked: await getCount('t_tasks', { status_id: 4 }),
        done: await getCount('t_tasks', { status_id: 5 }),
        archived: await getCount('t_tasks', { status_id: 6 }),
      };

      // Tasks by priority (1=low, 2=medium, 3=high, 4=critical)
      const tasks_by_priority = {
        low: await getCount('t_tasks', { priority: 1 }),
        medium: await getCount('t_tasks', { priority: 2 }),
        high: await getCount('t_tasks', { priority: 3 }),
        critical: await getCount('t_tasks', { priority: 4 }),
      };

      // Review status (v3.4.0) - tasks in waiting_review awaiting git commits
      // Overdue review: tasks in waiting_review for >24h (may need attention)
      const now = Math.floor(Date.now() / 1000);
      const overdueThreshold = now - 86400; // 24 hours ago

      const overdue_review_result = await knex('t_tasks')
        .count('* as count')
        .where('project_id', projectId)
        .where('status_id', 3)
        .where('updated_ts', '<', overdueThreshold)
        .first() as { count: number };

      const review_status = {
        awaiting_commit: tasks_by_status.waiting_review,
        overdue_review: overdue_review_result.count,
      };

      return {
        agents,
        files,
        context_keys,
        active_decisions,
        total_decisions,
        file_changes,
        active_constraints,
        total_constraints,
        tags,
        scopes,
        layers,
        total_tasks,
        active_tasks: active_tasks.count,
        tasks_by_status,
        tasks_by_priority,
        review_status, // v3.4.0: Enhanced review visibility
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get database statistics: ${message}`);
  }
}
