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

/**
 * Get summary statistics for all architecture layers
 * Uses the layer_summary view for token efficiency
 * 
 * @returns Layer summaries for all 5 standard layers
 */
export function getLayerSummary(): GetLayerSummaryResponse {
  const db = getDatabase();

  try {
    // Query the layer_summary view for all layers
    const stmt = db.prepare(`
      SELECT 
        layer,
        decisions_count,
        file_changes_count,
        constraints_count
      FROM layer_summary
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
 * @param params - Optional parameters for cleanup thresholds
 * @returns Counts of deleted records
 */
export function clearOldData(params?: ClearOldDataParams): ClearOldDataResponse {
  const db = getDatabase();

  // Default thresholds
  const messagesHours = params?.messages_older_than_hours ?? 24;
  const fileChangesDays = params?.file_changes_older_than_days ?? 7;

  // Calculate Unix epoch thresholds
  const now = Math.floor(Date.now() / 1000);
  const messagesThreshold = now - (messagesHours * 3600);
  const fileChangesThreshold = now - (fileChangesDays * 86400);

  try {
    return transaction(db, () => {
      // Count messages to be deleted
      const messagesCount = db.prepare(
        'SELECT COUNT(*) as count FROM agent_messages WHERE ts < ?'
      ).get(messagesThreshold) as { count: number };

      // Count file changes to be deleted
      const fileChangesCount = db.prepare(
        'SELECT COUNT(*) as count FROM file_changes WHERE ts < ?'
      ).get(fileChangesThreshold) as { count: number };

      // Delete old messages
      const deleteMessages = db.prepare(
        'DELETE FROM agent_messages WHERE ts < ?'
      );
      deleteMessages.run(messagesThreshold);

      // Delete old file changes
      const deleteFileChanges = db.prepare(
        'DELETE FROM file_changes WHERE ts < ?'
      );
      deleteFileChanges.run(fileChangesThreshold);

      return {
        success: true,
        messages_deleted: messagesCount.count,
        file_changes_deleted: fileChangesCount.count,
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
    const agents = getCount('agents');
    const files = getCount('files');
    const context_keys = getCount('context_keys');
    
    // Decisions (active vs total)
    const active_decisions = getCount('decisions', 'status = 1');
    const total_decisions = getCount('decisions');
    
    // Messages
    const messages = getCount('agent_messages');
    
    // File changes
    const file_changes = getCount('file_changes');
    
    // Constraints (active vs total)
    const active_constraints = getCount('constraints', 'active = 1');
    const total_constraints = getCount('constraints');
    
    // Metadata
    const tags = getCount('tags');
    const scopes = getCount('scopes');
    const layers = getCount('layers');

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
