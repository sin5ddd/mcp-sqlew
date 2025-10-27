/**
 * Programmatic cleanup utilities for old messages and file changes
 * Replaces the automatic triggers with weekend-aware logic
 *
 * CONVERTED: Using Knex.js with DatabaseAdapter (async/await)
 */

import { DatabaseAdapter } from '../adapters/index.js';
import { Knex } from 'knex';
import { calculateMessageCutoff, calculateFileChangeCutoff, releaseInactiveAgents } from './retention.js';

/**
 * Perform automatic cleanup of old data
 * Deletes old messages, file changes, and activity logs based on m_config settings
 * Also releases inactive generic agent slots for reuse
 *
 * @param adapter - Database adapter instance
 * @param trx - Optional transaction
 * @returns Object with counts of deleted records and released agents
 */
export async function performAutoCleanup(
  adapter: DatabaseAdapter,
  trx?: Knex.Transaction
): Promise<{
  messagesDeleted: number;
  fileChangesDeleted: number;
  activityLogsDeleted: number;
  agentsReleased: number;
}> {
  const messageCutoff = await calculateMessageCutoff(adapter);
  const fileChangeCutoff = await calculateFileChangeCutoff(adapter);

  const messagesDeleted = await cleanupMessages(adapter, messageCutoff, trx);
  const fileChangesDeleted = await cleanupFileChanges(adapter, fileChangeCutoff, trx);
  // Activity log uses same retention as messages (constraint #4)
  const activityLogsDeleted = await cleanupActivityLogs(adapter, messageCutoff, trx);

  // Release inactive generic agent slots (24 hours of inactivity)
  const agentsReleased = await releaseInactiveAgents(adapter, 24);

  return { messagesDeleted, fileChangesDeleted, activityLogsDeleted, agentsReleased };
}

/**
 * Delete old messages before the cutoff timestamp
 *
 * @param adapter - Database adapter instance
 * @param cutoffTimestamp - Unix timestamp (seconds) for cutoff
 * @param trx - Optional transaction
 * @returns Number of messages deleted
 */
export async function cleanupMessages(
  adapter: DatabaseAdapter,
  cutoffTimestamp: number,
  trx?: Knex.Transaction
): Promise<number> {
  const knex = trx || adapter.getKnex();
  return await knex('t_agent_messages').where('ts', '<', cutoffTimestamp).delete();
}

/**
 * Delete old file changes before the cutoff timestamp
 *
 * @param adapter - Database adapter instance
 * @param cutoffTimestamp - Unix timestamp (seconds) for cutoff
 * @param trx - Optional transaction
 * @returns Number of file changes deleted
 */
export async function cleanupFileChanges(
  adapter: DatabaseAdapter,
  cutoffTimestamp: number,
  trx?: Knex.Transaction
): Promise<number> {
  const knex = trx || adapter.getKnex();
  return await knex('t_file_changes').where('ts', '<', cutoffTimestamp).delete();
}

/**
 * Delete old activity logs before the cutoff timestamp
 * Activity logs use the same retention as messages (constraint #4)
 *
 * @param adapter - Database adapter instance
 * @param cutoffTimestamp - Unix timestamp (seconds) for cutoff
 * @param trx - Optional transaction
 * @returns Number of activity logs deleted
 */
export async function cleanupActivityLogs(
  adapter: DatabaseAdapter,
  cutoffTimestamp: number,
  trx?: Knex.Transaction
): Promise<number> {
  const knex = trx || adapter.getKnex();
  return await knex('t_activity_log').where('ts', '<', cutoffTimestamp).delete();
}

/**
 * Cleanup with custom retention periods (overrides config)
 *
 * @param adapter - Database adapter instance
 * @param messageHours - Message retention in hours (optional)
 * @param fileChangeDays - File change retention in days (optional)
 * @param trx - Optional transaction
 * @returns Object with counts of deleted records
 */
export async function cleanupWithCustomRetention(
  adapter: DatabaseAdapter,
  messageHours?: number,
  fileChangeDays?: number,
  trx?: Knex.Transaction
): Promise<{ messagesDeleted: number; fileChangesDeleted: number; activityLogsDeleted: number }> {
  let messagesDeleted = 0;
  let fileChangesDeleted = 0;
  let activityLogsDeleted = 0;

  if (messageHours !== undefined) {
    const messageCutoff = Math.floor(Date.now() / 1000) - (messageHours * 3600);
    messagesDeleted = await cleanupMessages(adapter, messageCutoff, trx);
    // Activity log uses same retention as messages (constraint #4)
    activityLogsDeleted = await cleanupActivityLogs(adapter, messageCutoff, trx);
  }

  if (fileChangeDays !== undefined) {
    const fileChangeCutoff = Math.floor(Date.now() / 1000) - (fileChangeDays * 86400);
    fileChangesDeleted = await cleanupFileChanges(adapter, fileChangeCutoff, trx);
  }

  return { messagesDeleted, fileChangesDeleted, activityLogsDeleted };
}
