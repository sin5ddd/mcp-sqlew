/**
 * Utility tools for MCP Shared Context Server
 * Database statistics, layer summaries, and manual cleanup
 *
 * CONVERTED: Using Knex.js with DatabaseAdapter (async/await)
 */

import { DatabaseAdapter } from '../adapters/index.js';
import { getAdapter } from '../database.js';
import { Knex } from 'knex';
import type {
  GetLayerSummaryResponse,
  ClearOldDataParams,
  ClearOldDataResponse,
  GetStatsResponse,
  GetActivityLogParams,
  GetActivityLogResponse,
  ActivityLogEntry,
  LayerSummary,
  FlushWALResponse,
} from '../types.js';
import { calculateMessageCutoff, calculateFileChangeCutoff, releaseInactiveAgents } from '../utils/retention.js';
import { cleanupWithCustomRetention } from '../utils/cleanup.js';

/**
 * Get summary statistics for all architecture layers
 * Uses the v_layer_summary view for token efficiency
 *
 * @param adapter - Optional database adapter (for testing)
 * @returns Layer summaries for all 5 standard layers
 */
export async function getLayerSummary(
  adapter?: DatabaseAdapter
): Promise<GetLayerSummaryResponse> {
  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  try {
    const summary = await knex('v_layer_summary')
      .select('layer', 'decisions_count', 'file_changes_count', 'constraints_count')
      .orderBy('layer') as LayerSummary[];

    return {
      summary,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get layer summary: ${message}`);
  }
}

/**
 * Clear old data from the database
 * Deletes messages and file changes older than specified thresholds
 * Preserves decision_history, constraints, and core decisions
 *
 * If parameters are not provided, uses config-based weekend-aware retention.
 * If parameters are provided, they override m_config settings (no weekend-awareness).
 *
 * @param params - Optional parameters for cleanup thresholds (overrides config)
 * @param adapter - Optional database adapter (for testing)
 * @returns Counts of deleted records
 */
export async function clearOldData(
  params?: ClearOldDataParams,
  adapter?: DatabaseAdapter
): Promise<ClearOldDataResponse> {
  const actualAdapter = adapter ?? getAdapter();

  try {
    return await actualAdapter.transaction(async (trx) => {
      let messagesDeleted = 0;
      let fileChangesDeleted = 0;
      let activityLogsDeleted = 0;

      if (params?.messages_older_than_hours !== undefined || params?.file_changes_older_than_days !== undefined) {
        // Parameters provided: use custom retention (no weekend-awareness)
        const result = await cleanupWithCustomRetention(
          actualAdapter,
          params.messages_older_than_hours,
          params.file_changes_older_than_days,
          trx
        );
        messagesDeleted = result.messagesDeleted;
        fileChangesDeleted = result.fileChangesDeleted;
        activityLogsDeleted = result.activityLogsDeleted;
      } else {
        // No parameters: use config-based weekend-aware retention
        const messagesThreshold = await calculateMessageCutoff(actualAdapter);
        const fileChangesThreshold = await calculateFileChangeCutoff(actualAdapter);

        // Delete messages
        messagesDeleted = await trx('t_agent_messages')
          .where('ts', '<', messagesThreshold)
          .delete();

        // Delete file changes
        fileChangesDeleted = await trx('t_file_changes')
          .where('ts', '<', fileChangesThreshold)
          .delete();

        // Delete activity logs (uses same threshold as messages per constraint #4)
        activityLogsDeleted = await trx('t_activity_log')
          .where('ts', '<', messagesThreshold)
          .delete();
      }

      // Release inactive generic agent slots (24 hours of inactivity)
      const agentsReleased = await releaseInactiveAgents(actualAdapter, 24, trx);

      return {
        success: true,
        messages_deleted: messagesDeleted,
        file_changes_deleted: fileChangesDeleted,
        activity_logs_deleted: activityLogsDeleted,
        agents_released: agentsReleased,
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to clear old data: ${message}`);
  }
}

/**
 * Get comprehensive database statistics
 * Returns counts for all major tables and database health metrics
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
    // Helper to get count from a table
    const getCount = async (table: string, where?: string): Promise<number> => {
      let query = knex(table).count('* as count');

      if (where) {
        query = query.whereRaw(where);
      }

      const result = await query.first() as { count: number };
      return result.count;
    };

    // Get all statistics (note: all await calls!)
    const agents = await getCount('m_agents');
    const files = await getCount('m_files');
    const context_keys = await getCount('m_context_keys');

    // Decisions (active vs total)
    const active_decisions = await getCount('t_decisions', 'status = 1');
    const total_decisions = await getCount('t_decisions');

    // Messages
    const messages = await getCount('t_agent_messages');

    // File changes
    const file_changes = await getCount('t_file_changes');

    // Constraints (active vs total)
    const active_constraints = await getCount('t_constraints', 'active = 1');
    const total_constraints = await getCount('t_constraints');

    // Metadata
    const tags = await getCount('m_tags');
    const scopes = await getCount('m_scopes');
    const layers = await getCount('m_layers');

    // Task statistics (v3.x)
    const total_tasks = await getCount('t_tasks');
    const active_tasks = await getCount('t_tasks', 'status_id NOT IN (5, 6)'); // Exclude done and archived

    // Tasks by status (1=todo, 2=in_progress, 3=waiting_review, 4=blocked, 5=done, 6=archived)
    const tasks_by_status = {
      todo: await getCount('t_tasks', 'status_id = 1'),
      in_progress: await getCount('t_tasks', 'status_id = 2'),
      waiting_review: await getCount('t_tasks', 'status_id = 3'),
      blocked: await getCount('t_tasks', 'status_id = 4'),
      done: await getCount('t_tasks', 'status_id = 5'),
      archived: await getCount('t_tasks', 'status_id = 6'),
    };

    // Tasks by priority (1=low, 2=medium, 3=high, 4=critical)
    const tasks_by_priority = {
      low: await getCount('t_tasks', 'priority = 1'),
      medium: await getCount('t_tasks', 'priority = 2'),
      high: await getCount('t_tasks', 'priority = 3'),
      critical: await getCount('t_tasks', 'priority = 4'),
    };

    // Review status (v3.4.0) - tasks in waiting_review awaiting git commits
    const review_status = {
      awaiting_commit: tasks_by_status.waiting_review,
      // Tasks in waiting_review for >24h (may need attention)
      overdue_review: await getCount('t_tasks', `status_id = 3 AND updated_ts < unixepoch() - 86400`),
    };

    return {
      agents,
      files,
      context_keys,
      active_decisions,
      total_decisions,
      messages,
      file_changes,
      active_constraints,
      total_constraints,
      tags,
      scopes,
      layers,
      total_tasks,
      active_tasks,
      tasks_by_status,
      tasks_by_priority,
      review_status, // v3.4.0: Enhanced review visibility
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get database statistics: ${message}`);
  }
}

/**
 * Get activity log entries with filtering
 * Supports time-based filtering (relative or absolute) and agent/action filtering
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
      );

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

/**
 * Force WAL checkpoint to flush pending transactions to main database file
 * Uses TRUNCATE mode for complete flush - useful before git commits
 *
 * @param adapter - Optional database adapter (for testing)
 * @returns Checkpoint result with pages flushed
 */
export async function flushWAL(
  adapter?: DatabaseAdapter
): Promise<FlushWALResponse> {
  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  try {
    // Execute TRUNCATE checkpoint - most aggressive mode
    // Blocks until complete, ensures all WAL data written to main DB file
    // Returns array: [[busy, log, checkpointed]]
    // - busy: number of frames not checkpointed due to locks
    // - log: total number of frames in WAL file
    // - checkpointed: number of frames checkpointed
    const result = await knex.raw('PRAGMA wal_checkpoint(TRUNCATE)') as any;

    // Parse result array format from Knex
    const pagesFlushed = result?.[0]?.[0]?.[2] || 0;

    return {
      success: true,
      mode: 'TRUNCATE',
      pages_flushed: pagesFlushed,
      message: `WAL checkpoint completed successfully. ${pagesFlushed} pages flushed to main database file.`
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to flush WAL: ${message}`);
  }
}

/**
 * Get help documentation for stats tool
 * @returns Help documentation object
 */
export function statsHelp(): any {
  return {
    tool: 'stats',
    description: 'View database statistics, activity logs, manage data cleanup, and WAL checkpoints',
    note: '💡 TIP: Use action: "example" to see comprehensive usage scenarios and real-world examples for all stats actions.',
    actions: {
      layer_summary: 'Get summary by layer. No params required',
      db_stats: 'Get database statistics. No params required',
      clear: 'Clear old data. Params: messages_older_than_hours, file_changes_older_than_days',
      activity_log: 'Get activity log (v3.0.0). Params: since (e.g., "5m", "1h", "2d"), agent_names (array or ["*"]), actions (filter by action types), limit (default: 100)',
      flush: 'Force WAL checkpoint to flush pending transactions to main database file. No params required. Uses TRUNCATE mode for complete flush. Useful before git commits to ensure database file is up-to-date.'
    },
    examples: {
      layer_summary: '{ action: "layer_summary" }',
      db_stats: '{ action: "db_stats" }',
      clear: '{ action: "clear", messages_older_than_hours: 48, file_changes_older_than_days: 14 }',
      activity_log: '{ action: "activity_log", since: "1h", agent_names: ["bot1", "bot2"], limit: 50 }',
      flush: '{ action: "flush" }'
    },
    documentation: {
      workflows: 'docs/WORKFLOWS.md - Activity monitoring, automatic cleanup workflows (602 lines, ~30k tokens)',
      best_practices: 'docs/BEST_PRACTICES.md - Database health, cleanup strategies (345 lines, ~17k tokens)',
      shared_concepts: 'docs/SHARED_CONCEPTS.md - Layer definitions for layer_summary (339 lines, ~17k tokens)',
      architecture: 'docs/ARCHITECTURE.md - Database schema, views, statistics tables'
    }
  };
}

/**
 * Get comprehensive examples for stats tool
 * @returns Examples documentation object
 */
export function statsExample(): any {
  return {
    tool: 'stats',
    description: 'Database statistics and maintenance examples',
    scenarios: {
      layer_analysis: {
        title: 'Architecture Layer Summary',
        example: {
          request: '{ action: "layer_summary" }',
          response_structure: '{ layer: string, decision_count: number, file_changes: number, active_constraints: number }[]',
          use_case: 'Understand which layers have most activity and decisions'
        }
      },
      database_health: {
        title: 'Database Statistics',
        example: {
          request: '{ action: "db_stats" }',
          response_structure: '{ decisions: N, messages: N, file_changes: N, constraints: N, db_size_mb: N }',
          use_case: 'Monitor database growth and table sizes'
        }
      },
      activity_monitoring: {
        title: 'Activity Log Queries',
        examples: [
          {
            scenario: 'Recent activity (last hour)',
            request: '{ action: "activity_log", since: "1h", limit: 50 }',
            explanation: 'View all agent activity in the past hour'
          },
          {
            scenario: 'Specific agent activity',
            request: '{ action: "activity_log", since: "24h", agent_names: ["backend-agent", "frontend-agent"] }',
            explanation: 'Track what specific agents have been doing'
          },
          {
            scenario: 'Filter by action type',
            request: '{ action: "activity_log", since: "2d", actions: ["set_decision", "create_task"] }',
            explanation: 'See only specific types of actions'
          }
        ]
      },
      data_cleanup: {
        title: 'Maintenance and Cleanup',
        examples: [
          {
            scenario: 'Manual cleanup with specific retention',
            request: '{ action: "clear", messages_older_than_hours: 48, file_changes_older_than_days: 14 }',
            explanation: 'Override config and delete old data'
          },
          {
            scenario: 'Config-based automatic cleanup',
            request: '{ action: "clear" }',
            explanation: 'Use configured retention settings (respects weekend-aware mode)'
          }
        ]
      },
      wal_management: {
        title: 'WAL Checkpoint (Git Workflow)',
        workflow: [
          {
            step: 1,
            action: 'Make changes to context (decisions, tasks, etc.)',
            explanation: 'SQLite WAL mode keeps changes in separate file'
          },
          {
            step: 2,
            action: 'Before git commit, flush WAL',
            request: '{ action: "flush" }',
            explanation: 'Merges WAL changes into main .db file'
          },
          {
            step: 3,
            action: 'Commit database file',
            explanation: 'Database file now contains all changes for version control'
          }
        ]
      }
    },
    best_practices: {
      monitoring: [
        'Check layer_summary regularly to identify hotspots',
        'Monitor db_stats to prevent database bloat',
        'Use activity_log for debugging multi-agent issues',
        'Set appropriate retention periods based on project needs'
      ],
      cleanup: [
        'Run periodic cleanup to manage database size',
        'Use weekend-aware mode for business hour retention',
        'Consider longer retention for important decisions',
        'Test cleanup with manual parameters before automating'
      ],
      wal_checkpoints: [
        'Always flush before git commits for clean diffs',
        'WAL mode improves concurrent access performance',
        'Checkpoint automatically happens on shutdown',
        'Manual flush ensures immediate persistence'
      ]
    }
  };
}


