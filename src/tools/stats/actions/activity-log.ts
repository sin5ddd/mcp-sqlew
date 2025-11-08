/**
 * Get activity log entries with filtering
 * Supports time-based filtering (relative or absolute) and agent/action filtering
 * PROJECT-SCOPED: Only returns activity for current project (Constraint #38)
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter } from '../../../database.js';
import { getProjectContext } from '../../../utils/project-context.js';
import { validateActionParams } from '../../../utils/parameter-validator.js';
import type { GetActivityLogParams, GetActivityLogResponse, ActivityLogEntry } from '../types.js';

/**
 * Get activity log entries with filtering
 *
 * @param params - Filter parameters (since, agent_names, actions, limit)
 * @param adapter - Optional database adapter (for testing)
 * @returns Activity log entries with parsed details
 */
export async function getActivityLog(
  params?: GetActivityLogParams,
  adapter?: DatabaseAdapter
): Promise<GetActivityLogResponse> {
  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  try {
    // Validate parameters
    validateActionParams('stats', 'activity_log', params || {});

    // Get current project ID (Constraint #38 - project-scoped by default)
    const projectId = getProjectContext().getProjectId();

    let sinceTimestamp: number | null = null;

    if (params?.since) {
      const since = params.since;
      const now = Math.floor(Date.now() / 1000);

      const relativeMatch = since.match(/^(\d+)([mhd])$/);
      if (relativeMatch) {
        const value = parseInt(relativeMatch[1], 10);
        const unit = relativeMatch[2];

        let seconds = 0;
        switch (unit) {
          case 'm': seconds = value * 60; break;
          case 'h': seconds = value * 3600; break;
          case 'd': seconds = value * 86400; break;
        }

        sinceTimestamp = now - seconds;
      } else {
        try {
          const date = new Date(since);
          sinceTimestamp = Math.floor(date.getTime() / 1000);
        } catch {
          throw new Error(`Invalid 'since' parameter: ${since}. Use relative format (5m, 1h, 2d) or ISO 8601 timestamp`);
        }
      }
    }

    let query = knex('t_activity_log as al')
      .join('m_agents as a', 'al.agent_id', 'a.id')
      .leftJoin('m_layers as l', 'al.layer_id', 'l.id')
      .select(
        'al.id',
        'al.ts',
        'a.name as agent',
        'al.action_type',
        'al.target',
        'l.name as layer',
        'al.details'
      )
      .where('al.project_id', projectId);

    if (sinceTimestamp !== null) {
      query = query.where('al.ts', '>=', sinceTimestamp);
    }

    if (params?.agent_names && params.agent_names.length > 0 && !params.agent_names.includes('*')) {
      query = query.whereIn('a.name', params.agent_names);
    }

    if (params?.actions && params.actions.length > 0) {
      query = query.whereIn('al.action_type', params.actions);
    }

    const limit = params?.limit ?? 100;
    query = query.orderBy('al.ts', 'desc').limit(limit);

    const rows = await query as Array<{
      id: number;
      ts: number;
      agent: string;
      action_type: string;
      target: string;
      layer: string | null;
      details: string | null;
    }>;

    const activities: ActivityLogEntry[] = rows.map(row => ({
      id: row.id,
      timestamp: new Date(row.ts * 1000).toISOString(),
      agent: row.agent,
      action: row.action_type,
      target: row.target,
      layer: row.layer,
      details: row.details ? JSON.parse(row.details) : null,
    }));

    return {
      activities,
      count: activities.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get activity log: ${message}`);
  }
}
