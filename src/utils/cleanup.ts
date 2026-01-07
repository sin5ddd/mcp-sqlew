/**
 * Programmatic cleanup utilities for old messages and file changes
 * Replaces the automatic triggers with weekend-aware logic
 *
 * CONVERTED: Using Knex.js with DatabaseAdapter (async/await)
 * MULTI-PROJECT: All cleanup operations scoped by project_id (Constraint #40)
 */

import { DatabaseAdapter } from '../adapters/index.js';
import { Knex } from 'knex';
import { calculateMessageCutoff, releaseInactiveAgents } from './retention.js';
import { getProjectContext } from './project-context.js';

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
  activityLogsDeleted: number;
  agentsReleased: number;
}> {
  const messageCutoff = await calculateMessageCutoff(adapter);

  const messagesDeleted = await cleanupMessages(adapter, messageCutoff, trx);
  // Activity log uses same retention as messages (constraint #4)
  const activityLogsDeleted = await cleanupActivityLogs(adapter, messageCutoff, trx);

  // Release inactive generic agent slots (24 hours of inactivity)
  const agentsReleased = await releaseInactiveAgents(adapter, 24);

  return { messagesDeleted, activityLogsDeleted, agentsReleased };
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
  return await knex('v4_agent_messages').where('ts', '<', cutoffTimestamp).delete();
}

/**
 * Delete old activity logs before the cutoff timestamp
 * Activity logs use the same retention as messages (constraint #4)
 * PROJECT-SCOPED: Only deletes activity logs for current project (Constraint #40)
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
  const projectId = getProjectContext().getProjectId();

  return await knex('v4_activity_log')
    .where('project_id', projectId)
    .where('ts', '<', cutoffTimestamp)
    .delete();
}

/**
 * Cleanup with custom retention periods (overrides config)
 *
 * @param adapter - Database adapter instance
 * @param messageHours - Message retention in hours (optional)
 * @param trx - Optional transaction
 * @returns Object with counts of deleted records
 */
export async function cleanupWithCustomRetention(
  adapter: DatabaseAdapter,
  messageHours?: number,
  trx?: Knex.Transaction
): Promise<{ messagesDeleted: number; activityLogsDeleted: number }> {
  let messagesDeleted = 0;
  let activityLogsDeleted = 0;

  if (messageHours !== undefined) {
    const messageCutoff = Math.floor(Date.now() / 1000) - (messageHours * 3600);
    messagesDeleted = await cleanupMessages(adapter, messageCutoff, trx);
    // Activity log uses same retention as messages (constraint #4)
    activityLogsDeleted = await cleanupActivityLogs(adapter, messageCutoff, trx);
  }

  return { messagesDeleted, activityLogsDeleted };
}
