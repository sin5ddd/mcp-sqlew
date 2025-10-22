/**
 * Utility tools for MCP Shared Context Server
 * Database statistics, layer summaries, and manual cleanup
 */

import { getDatabase, transaction } from '../database.js';
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
  Database,
} from '../types.js';
import { calculateMessageCutoff, calculateFileChangeCutoff } from '../utils/retention.js';
import { cleanupWithCustomRetention } from '../utils/cleanup.js';

/**
 * Get summary statistics for all architecture layers
 * Uses the v_layer_summary view for token efficiency
 *
 * @param db - Optional database instance (for testing)
 * @returns Layer summaries for all 5 standard layers
 */
export function getLayerSummary(db?: Database): GetLayerSummaryResponse {
  const actualDb = db ?? getDatabase();

  try {
    // Query the v_layer_summary view for all layers
    const stmt = actualDb.prepare(`
      SELECT 
        layer,
        decisions_count,
        file_changes_count,
        constraints_count
      FROM v_layer_summary
      ORDER BY layer
    `);

    const summary = stmt.all() as LayerSummary[];

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
 * @param db - Optional database instance (for testing)
 * @returns Counts of deleted records
 */
export function clearOldData(params?: ClearOldDataParams, db?: Database): ClearOldDataResponse {
  const actualDb = db ?? getDatabase();

  try {
    return transaction(actualDb, () => {
      let messagesThreshold: number;
      let fileChangesThreshold: number;
      let messagesDeleted = 0;
      let fileChangesDeleted = 0;
      let activityLogsDeleted = 0;

      if (params?.messages_older_than_hours !== undefined || params?.file_changes_older_than_days !== undefined) {
        // Parameters provided: use custom retention (no weekend-awareness)
        const result = cleanupWithCustomRetention(
          actualDb,
          params.messages_older_than_hours,
          params.file_changes_older_than_days
        );
        messagesDeleted = result.messagesDeleted;
        fileChangesDeleted = result.fileChangesDeleted;
        activityLogsDeleted = result.activityLogsDeleted;
      } else {
        // No parameters: use config-based weekend-aware retention
        messagesThreshold = calculateMessageCutoff(actualDb);
        fileChangesThreshold = calculateFileChangeCutoff(actualDb);

        // Count and delete messages
        const messagesCount = actualDb.prepare(
          'SELECT COUNT(*) as count FROM t_agent_messages WHERE ts < ?'
        ).get(messagesThreshold) as { count: number };

        const deleteMessages = actualDb.prepare(
          'DELETE FROM t_agent_messages WHERE ts < ?'
        );
        deleteMessages.run(messagesThreshold);
        messagesDeleted = messagesCount.count;

        // Count and delete file changes
        const fileChangesCount = actualDb.prepare(
          'SELECT COUNT(*) as count FROM t_file_changes WHERE ts < ?'
        ).get(fileChangesThreshold) as { count: number };

        const deleteFileChanges = actualDb.prepare(
          'DELETE FROM t_file_changes WHERE ts < ?'
        );
        deleteFileChanges.run(fileChangesThreshold);
        fileChangesDeleted = fileChangesCount.count;

        // Count and delete activity logs (uses same threshold as messages per constraint #4)
        const activityLogsCount = actualDb.prepare(
          'SELECT COUNT(*) as count FROM t_activity_log WHERE ts < ?'
        ).get(messagesThreshold) as { count: number };

        const deleteActivityLogs = actualDb.prepare(
          'DELETE FROM t_activity_log WHERE ts < ?'
        );
        deleteActivityLogs.run(messagesThreshold);
        activityLogsDeleted = activityLogsCount.count;
      }

      return {
        success: true,
        messages_deleted: messagesDeleted,
        file_changes_deleted: fileChangesDeleted,
        activity_logs_deleted: activityLogsDeleted,
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
 * @param db - Optional database instance (for testing)
 * @returns Complete database statistics
 */
export function getStats(db?: Database): GetStatsResponse {
  const actualDb = db ?? getDatabase();

  try {
    // Helper to get count from a table
    const getCount = (table: string, where?: string): number => {
      const query = where
        ? `SELECT COUNT(*) as count FROM ${table} WHERE ${where}`
        : `SELECT COUNT(*) as count FROM ${table}`;
      const result = actualDb.prepare(query).get() as { count: number };
      return result.count;
    };

    // Get all statistics
    const agents = getCount('m_agents');
    const files = getCount('m_files');
    const context_keys = getCount('m_context_keys');

    // Decisions (active vs total)
    const active_decisions = getCount('t_decisions', 'status = 1');
    const total_decisions = getCount('t_decisions');

    // Messages
    const messages = getCount('t_agent_messages');

    // File changes
    const file_changes = getCount('t_file_changes');

    // Constraints (active vs total)
    const active_constraints = getCount('t_constraints', 'active = 1');
    const total_constraints = getCount('t_constraints');

    // Metadata
    const tags = getCount('m_tags');
    const scopes = getCount('m_scopes');
    const layers = getCount('m_layers');

    // Task statistics (v3.x)
    const total_tasks = getCount('t_tasks');
    const active_tasks = getCount('t_tasks', 'status_id NOT IN (5, 6)'); // Exclude done and archived

    // Tasks by status (1=todo, 2=in_progress, 3=waiting_review, 4=blocked, 5=done, 6=archived)
    const tasks_by_status = {
      todo: getCount('t_tasks', 'status_id = 1'),
      in_progress: getCount('t_tasks', 'status_id = 2'),
      waiting_review: getCount('t_tasks', 'status_id = 3'),
      blocked: getCount('t_tasks', 'status_id = 4'),
      done: getCount('t_tasks', 'status_id = 5'),
      archived: getCount('t_tasks', 'status_id = 6'),
    };

    // Tasks by priority (1=low, 2=medium, 3=high, 4=critical)
    const tasks_by_priority = {
      low: getCount('t_tasks', 'priority = 1'),
      medium: getCount('t_tasks', 'priority = 2'),
      high: getCount('t_tasks', 'priority = 3'),
      critical: getCount('t_tasks', 'priority = 4'),
    };

    // Review status (v3.4.0) - tasks in waiting_review awaiting git commits
    const review_status = {
      awaiting_commit: tasks_by_status.waiting_review,
      // Tasks in waiting_review for >24h (may need attention)
      overdue_review: getCount('t_tasks', `status_id = 3 AND updated_ts < unixepoch() - 86400`),
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
 * @param db - Optional database instance (for testing)
 * @returns Activity log entries with parsed details
 */
export function getActivityLog(params?: GetActivityLogParams, db?: Database): GetActivityLogResponse {
  const actualDb = db ?? getDatabase();

  try {
    // Parse 'since' parameter to get timestamp
    let sinceTimestamp: number | null = null;

    if (params?.since) {
      const since = params.since;
      const now = Math.floor(Date.now() / 1000);

      // Check for relative time format (e.g., "5m", "1h", "2d")
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
        // Try to parse as ISO 8601 timestamp
        try {
          const date = new Date(since);
          sinceTimestamp = Math.floor(date.getTime() / 1000);
        } catch {
          throw new Error(`Invalid 'since' parameter: ${since}. Use relative format (5m, 1h, 2d) or ISO 8601 timestamp`);
        }
      }
    }

    // Build query
    let query = `
      SELECT
        al.id,
        al.ts,
        a.name as agent,
        al.action_type,
        al.target,
        l.name as layer,
        al.details
      FROM t_activity_log al
      JOIN m_agents a ON al.agent_id = a.id
      LEFT JOIN m_layers l ON al.layer_id = l.id
      WHERE 1=1
    `;

    const queryParams: any[] = [];

    // Filter by timestamp
    if (sinceTimestamp !== null) {
      query += ' AND al.ts >= ?';
      queryParams.push(sinceTimestamp);
    }

    // Filter by agent names
    if (params?.agent_names && params.agent_names.length > 0 && !params.agent_names.includes('*')) {
      const placeholders = params.agent_names.map(() => '?').join(',');
      query += ` AND a.name IN (${placeholders})`;
      queryParams.push(...params.agent_names);
    }

    // Filter by action types
    if (params?.actions && params.actions.length > 0) {
      const placeholders = params.actions.map(() => '?').join(',');
      query += ` AND al.action_type IN (${placeholders})`;
      queryParams.push(...params.actions);
    }

    // Order by timestamp descending (most recent first)
    query += ' ORDER BY al.ts DESC';

    // Apply limit
    const limit = params?.limit ?? 100;
    query += ' LIMIT ?';
    queryParams.push(limit);

    // Execute query
    const stmt = actualDb.prepare(query);
    const rows = stmt.all(...queryParams) as Array<{
      id: number;
      ts: number;
      agent: string;
      action_type: string;
      target: string;
      layer: string | null;
      details: string | null;
    }>;

    // Transform results
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
 * @param db - Optional database instance (for testing)
 * @returns Checkpoint result with pages flushed
 */
export function flushWAL(db?: Database): FlushWALResponse {
  const actualDb = db ?? getDatabase();

  try {
    // Execute TRUNCATE checkpoint - most aggressive mode
    // Blocks until complete, ensures all WAL data written to main DB file
    // Returns array: [busy, log, checkpointed]
    // - busy: number of frames not checkpointed due to locks
    // - log: total number of frames in WAL file
    // - checkpointed: number of frames checkpointed
    const result = actualDb.pragma('wal_checkpoint(TRUNCATE)', { simple: true }) as number[] | undefined;

    const pagesFlushed = result?.[2] || 0;

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
