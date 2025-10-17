/**
 * Auto-stale detection for Kanban Task Watcher
 * Automatically transitions abandoned tasks based on time thresholds
 */

import { Database } from '../types.js';
import { getConfigBool, getConfigInt } from '../database.js';

/**
 * Task status IDs (matching schema)
 */
const TASK_STATUS = {
  TODO: 1,
  IN_PROGRESS: 2,
  WAITING_REVIEW: 3,
} as const;

/**
 * Configuration keys for task stale detection
 */
const CONFIG_KEYS = {
  TASK_STALE_HOURS_IN_PROGRESS: 'task_stale_hours_in_progress',
  TASK_STALE_HOURS_WAITING_REVIEW: 'task_stale_hours_waiting_review',
  TASK_AUTO_STALE_ENABLED: 'task_auto_stale_enabled',
} as const;

/**
 * Default configuration values
 */
const DEFAULTS = {
  STALE_HOURS_IN_PROGRESS: 2,
  STALE_HOURS_WAITING_REVIEW: 24,
  AUTO_STALE_ENABLED: true,
} as const;

/**
 * Detect and transition stale tasks automatically
 *
 * Detection logic:
 * - Tasks in `in_progress` with `updated_ts` older than threshold → move to `waiting_review`
 * - Tasks in `waiting_review` with `updated_ts` older than threshold → move to `todo`
 *
 * @param db - Database instance
 * @returns Count of transitioned tasks
 */
export function detectAndTransitionStaleTasks(db: Database): number {
  // 1. Check if auto-stale is enabled
  const isEnabled = getConfigBool(
    db,
    CONFIG_KEYS.TASK_AUTO_STALE_ENABLED,
    DEFAULTS.AUTO_STALE_ENABLED
  );

  if (!isEnabled) {
    return 0;
  }

  // 2. Get threshold configs (in hours)
  const inProgressThresholdHours = getConfigInt(
    db,
    CONFIG_KEYS.TASK_STALE_HOURS_IN_PROGRESS,
    DEFAULTS.STALE_HOURS_IN_PROGRESS
  );

  const waitingReviewThresholdHours = getConfigInt(
    db,
    CONFIG_KEYS.TASK_STALE_HOURS_WAITING_REVIEW,
    DEFAULTS.STALE_HOURS_WAITING_REVIEW
  );

  // Convert hours to seconds for timestamp comparison
  const inProgressThresholdSeconds = inProgressThresholdHours * 3600;
  const waitingReviewThresholdSeconds = waitingReviewThresholdHours * 3600;

  let totalTransitioned = 0;

  // 3. Transition stale tasks in a transaction
  const updateStmt = db.transaction(() => {
    // 3a. Find and transition in_progress tasks older than threshold to waiting_review
    const inProgressTransitioned = db.prepare(`
      UPDATE t_tasks
      SET status_id = ?,
          updated_ts = unixepoch()
      WHERE status_id = ?
        AND updated_ts < unixepoch() - ?
    `).run(
      TASK_STATUS.WAITING_REVIEW,
      TASK_STATUS.IN_PROGRESS,
      inProgressThresholdSeconds
    );

    totalTransitioned += inProgressTransitioned.changes;

    // 3b. Find and transition waiting_review tasks older than threshold to todo
    const waitingReviewTransitioned = db.prepare(`
      UPDATE t_tasks
      SET status_id = ?,
          updated_ts = unixepoch()
      WHERE status_id = ?
        AND updated_ts < unixepoch() - ?
    `).run(
      TASK_STATUS.TODO,
      TASK_STATUS.WAITING_REVIEW,
      waitingReviewThresholdSeconds
    );

    totalTransitioned += waitingReviewTransitioned.changes;
  });

  // Execute the transaction
  updateStmt();

  // 4. Return count of transitioned tasks
  return totalTransitioned;
}

/**
 * Get current auto-stale configuration
 *
 * @param db - Database instance
 * @returns Current configuration values
 */
export function getStaleDetectionConfig(db: Database): {
  enabled: boolean;
  inProgressThresholdHours: number;
  waitingReviewThresholdHours: number;
} {
  return {
    enabled: getConfigBool(
      db,
      CONFIG_KEYS.TASK_AUTO_STALE_ENABLED,
      DEFAULTS.AUTO_STALE_ENABLED
    ),
    inProgressThresholdHours: getConfigInt(
      db,
      CONFIG_KEYS.TASK_STALE_HOURS_IN_PROGRESS,
      DEFAULTS.STALE_HOURS_IN_PROGRESS
    ),
    waitingReviewThresholdHours: getConfigInt(
      db,
      CONFIG_KEYS.TASK_STALE_HOURS_WAITING_REVIEW,
      DEFAULTS.STALE_HOURS_WAITING_REVIEW
    ),
  };
}
