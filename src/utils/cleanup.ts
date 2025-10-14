/**
 * Programmatic cleanup utilities for old messages and file changes
 * Replaces the automatic triggers with weekend-aware logic
 */

import { Database } from '../types.js';
import { calculateMessageCutoff, calculateFileChangeCutoff } from './retention.js';

/**
 * Perform automatic cleanup of old data
 * Deletes old messages, file changes, and activity logs based on m_config settings
 *
 * @param db - Database instance
 * @returns Object with counts of deleted records
 */
export function performAutoCleanup(db: Database): { messagesDeleted: number; fileChangesDeleted: number; activityLogsDeleted: number } {
  const messageCutoff = calculateMessageCutoff(db);
  const fileChangeCutoff = calculateFileChangeCutoff(db);

  const messagesDeleted = cleanupMessages(db, messageCutoff);
  const fileChangesDeleted = cleanupFileChanges(db, fileChangeCutoff);
  // Activity log uses same retention as messages (constraint #4)
  const activityLogsDeleted = cleanupActivityLogs(db, messageCutoff);

  return { messagesDeleted, fileChangesDeleted, activityLogsDeleted };
}

/**
 * Delete old messages before the cutoff timestamp
 *
 * @param db - Database instance
 * @param cutoffTimestamp - Unix timestamp (seconds) for cutoff
 * @returns Number of messages deleted
 */
export function cleanupMessages(db: Database, cutoffTimestamp: number): number {
  const result = db.prepare('DELETE FROM t_agent_messages WHERE ts < ?').run(cutoffTimestamp);
  return result.changes;
}

/**
 * Delete old file changes before the cutoff timestamp
 *
 * @param db - Database instance
 * @param cutoffTimestamp - Unix timestamp (seconds) for cutoff
 * @returns Number of file changes deleted
 */
export function cleanupFileChanges(db: Database, cutoffTimestamp: number): number {
  const result = db.prepare('DELETE FROM t_file_changes WHERE ts < ?').run(cutoffTimestamp);
  return result.changes;
}

/**
 * Delete old activity logs before the cutoff timestamp
 * Activity logs use the same retention as messages (constraint #4)
 *
 * @param db - Database instance
 * @param cutoffTimestamp - Unix timestamp (seconds) for cutoff
 * @returns Number of activity logs deleted
 */
export function cleanupActivityLogs(db: Database, cutoffTimestamp: number): number {
  const result = db.prepare('DELETE FROM t_activity_log WHERE ts < ?').run(cutoffTimestamp);
  return result.changes;
}

/**
 * Cleanup with custom retention periods (overrides config)
 *
 * @param db - Database instance
 * @param messageHours - Message retention in hours (optional)
 * @param fileChangeDays - File change retention in days (optional)
 * @returns Object with counts of deleted records
 */
export function cleanupWithCustomRetention(
  db: Database,
  messageHours?: number,
  fileChangeDays?: number
): { messagesDeleted: number; fileChangesDeleted: number; activityLogsDeleted: number } {
  let messagesDeleted = 0;
  let fileChangesDeleted = 0;
  let activityLogsDeleted = 0;

  if (messageHours !== undefined) {
    const messageCutoff = Math.floor(Date.now() / 1000) - (messageHours * 3600);
    messagesDeleted = cleanupMessages(db, messageCutoff);
    // Activity log uses same retention as messages (constraint #4)
    activityLogsDeleted = cleanupActivityLogs(db, messageCutoff);
  }

  if (fileChangeDays !== undefined) {
    const fileChangeCutoff = Math.floor(Date.now() / 1000) - (fileChangeDays * 86400);
    fileChangesDeleted = cleanupFileChanges(db, fileChangeCutoff);
  }

  return { messagesDeleted, fileChangesDeleted, activityLogsDeleted };
}
