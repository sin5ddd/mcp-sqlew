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
  Database,
} from '../types.js';
import { calculateMessageCutoff, calculateFileChangeCutoff } from '../utils/retention.js';
import { cleanupWithCustomRetention } from '../utils/cleanup.js';

/**
 * Get summary statistics for all architecture layers
 * Uses the v_layer_summary view for token efficiency
 * 
 * @returns Layer summaries for all 5 standard layers
 */
export function getLayerSummary(): GetLayerSummaryResponse {
  const db = getDatabase();

  try {
    // Query the v_layer_summary view for all layers
    const stmt = db.prepare(`
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
 * @returns Counts of deleted records
 */
export function clearOldData(params?: ClearOldDataParams): ClearOldDataResponse {
  const db = getDatabase();

  try {
    return transaction(db, () => {
      let messagesThreshold: number;
      let fileChangesThreshold: number;
      let messagesDeleted = 0;
      let fileChangesDeleted = 0;
      let activityLogsDeleted = 0;

      if (params?.messages_older_than_hours !== undefined || params?.file_changes_older_than_days !== undefined) {
        // Parameters provided: use custom retention (no weekend-awareness)
        const result = cleanupWithCustomRetention(
          db,
          params.messages_older_than_hours,
          params.file_changes_older_than_days
        );
        messagesDeleted = result.messagesDeleted;
        fileChangesDeleted = result.fileChangesDeleted;
        activityLogsDeleted = result.activityLogsDeleted;
      } else {
        // No parameters: use config-based weekend-aware retention
        messagesThreshold = calculateMessageCutoff(db);
        fileChangesThreshold = calculateFileChangeCutoff(db);

        // Count and delete messages
        const messagesCount = db.prepare(
          'SELECT COUNT(*) as count FROM t_agent_messages WHERE ts < ?'
        ).get(messagesThreshold) as { count: number };

        const deleteMessages = db.prepare(
          'DELETE FROM t_agent_messages WHERE ts < ?'
        );
        deleteMessages.run(messagesThreshold);
        messagesDeleted = messagesCount.count;

        // Count and delete file changes
        const fileChangesCount = db.prepare(
          'SELECT COUNT(*) as count FROM t_file_changes WHERE ts < ?'
        ).get(fileChangesThreshold) as { count: number };

        const deleteFileChanges = db.prepare(
          'DELETE FROM t_file_changes WHERE ts < ?'
        );
        deleteFileChanges.run(fileChangesThreshold);
        fileChangesDeleted = fileChangesCount.count;

        // Count and delete activity logs (uses same threshold as messages per constraint #4)
        const activityLogsCount = db.prepare(
          'SELECT COUNT(*) as count FROM t_activity_log WHERE ts < ?'
        ).get(messagesThreshold) as { count: number };

        const deleteActivityLogs = db.prepare(
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
 * @returns Complete database statistics
 */
export function getStats(): GetStatsResponse {
  const db = getDatabase();

  try {
    // Helper to get count from a table
    const getCount = (table: string, where?: string): number => {
      const query = where 
        ? `SELECT COUNT(*) as count FROM ${table} WHERE ${where}`
        : `SELECT COUNT(*) as count FROM ${table}`;
      const result = db.prepare(query).get() as { count: number };
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
 * @returns Activity log entries with parsed details
 */
export function getActivityLog(params?: GetActivityLogParams): GetActivityLogResponse {
  const db = getDatabase();

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
    const stmt = db.prepare(query);
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
