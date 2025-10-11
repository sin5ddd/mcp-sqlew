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

      if (params?.messages_older_than_hours !== undefined || params?.file_changes_older_than_days !== undefined) {
        // Parameters provided: use custom retention (no weekend-awareness)
        const result = cleanupWithCustomRetention(
          db,
          params.messages_older_than_hours,
          params.file_changes_older_than_days
        );
        messagesDeleted = result.messagesDeleted;
        fileChangesDeleted = result.fileChangesDeleted;
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
      }

      return {
        success: true,
        messages_deleted: messagesDeleted,
        file_changes_deleted: fileChangesDeleted,
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
