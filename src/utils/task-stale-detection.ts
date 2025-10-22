/**
 * Auto-stale detection for Kanban Task Watcher
 * Automatically transitions abandoned tasks based on time thresholds
 */

import { Database } from '../types.js';
import { getConfigBool, getConfigInt } from '../database.js';
import { calculateTaskArchiveCutoff } from './retention.js';
import { checkReadyForReview } from './quality-checks.js';
import { statSync } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Task status IDs (matching schema)
 */
const TASK_STATUS = {
  TODO: 1,
  IN_PROGRESS: 2,
  WAITING_REVIEW: 3,
  BLOCKED: 4,
  DONE: 5,
  ARCHIVED: 6,
} as const;

/**
 * Configuration keys for task stale detection and review
 */
const CONFIG_KEYS = {
  TASK_STALE_HOURS_IN_PROGRESS: 'task_stale_hours_in_progress',
  TASK_STALE_HOURS_WAITING_REVIEW: 'task_stale_hours_waiting_review',
  TASK_AUTO_STALE_ENABLED: 'task_auto_stale_enabled',
  REVIEW_IDLE_MINUTES: 'review_idle_minutes',
  REVIEW_REQUIRE_ALL_FILES_MODIFIED: 'review_require_all_files_modified',
  REVIEW_REQUIRE_TESTS_PASS: 'review_require_tests_pass',
  REVIEW_REQUIRE_COMPILE: 'review_require_compile',
  GIT_AUTO_COMPLETE_ENABLED: 'git_auto_complete_enabled',
  REQUIRE_ALL_FILES_COMMITTED: 'require_all_files_committed',
  STALE_REVIEW_NOTIFICATION_HOURS: 'stale_review_notification_hours',
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

/**
 * Auto-archive old done tasks
 * Archives tasks in 'done' status older than configured threshold
 * Uses weekend-aware retention logic (consistent with messages/files)
 *
 * Default: 48 hours (2 days)
 * Weekend-aware: Task done Friday → archives Tuesday (skip Sat/Sun)
 *
 * @param db - Database instance
 * @returns Count of archived tasks
 */
export function autoArchiveOldDoneTasks(db: Database): number {
  // Calculate cutoff timestamp using weekend-aware retention logic
  const cutoffTimestamp = calculateTaskArchiveCutoff(db);

  // Archive done tasks older than cutoff
  const result = db.prepare(`
    UPDATE t_tasks
    SET status_id = ?,
        updated_ts = unixepoch()
    WHERE status_id = ?
      AND updated_ts < ?
  `).run(
    TASK_STATUS.ARCHIVED,
    TASK_STATUS.DONE,
    cutoffTimestamp
  );

  return result.changes;
}

/**
 * Detect and complete tasks in waiting_review when all watched files are committed to Git
 *
 * Git-aware auto-complete strategy (v3.4.0):
 * - Find all tasks in `waiting_review` status with watched files
 * - For each task, check if ALL watched files have been committed since task creation
 * - Use `git log --since="@<task.created_ts>" --name-only` to query Git history
 * - If all files committed → transition to `done` (Git commit = implicit approval)
 * - Gracefully handle non-Git repos (skip auto-complete)
 *
 * @param db - Database instance
 * @returns Count of auto-completed tasks
 */
export async function detectAndCompleteReviewedTasks(db: Database): Promise<number> {
  // 1. Check if git auto-complete is enabled
  const isEnabled = getConfigBool(db, CONFIG_KEYS.GIT_AUTO_COMPLETE_ENABLED, true);
  if (!isEnabled) {
    return 0;
  }

  const requireAllFilesCommitted = getConfigBool(db, CONFIG_KEYS.REQUIRE_ALL_FILES_COMMITTED, true);

  // 2. Find all waiting_review tasks
  const candidateTasks = db.prepare(`
    SELECT t.id, t.created_ts
    FROM t_tasks t
    JOIN m_task_statuses s ON t.status_id = s.id
    WHERE s.name = 'waiting_review'
  `).all() as Array<{ id: number; created_ts: number }>;

  if (candidateTasks.length === 0) {
    return 0;
  }

  let completed = 0;
  const projectRoot = process.cwd();

  // 3. Check if we're in a Git repository
  try {
    await execAsync('git rev-parse --git-dir', { cwd: projectRoot });
  } catch (error) {
    // Not a Git repository - skip git-aware completion
    console.error('  ℹ Not a Git repository - skipping git-aware auto-complete');
    return 0;
  }

  // 4. For each candidate task, check if all watched files are committed
  for (const task of candidateTasks) {
    try {
      // Get watched files for this task
      const watchedFiles = db.prepare(`
        SELECT f.path
        FROM t_task_file_links tfl
        JOIN m_files f ON tfl.file_id = f.id
        WHERE tfl.task_id = ?
      `).all(task.id) as Array<{ path: string }>;

      if (watchedFiles.length === 0) {
        // No watched files - skip this task
        continue;
      }

      const filePaths = watchedFiles.map(f => f.path);

      // Query Git log for commits since task creation
      // Format: --since="@<unix_timestamp>" --name-only
      // This returns all files committed since the task was created
      const sinceTimestamp = `@${task.created_ts}`;
      const gitCommand = `git log --since="${sinceTimestamp}" --name-only --pretty=format:""`;

      let committedFiles: Set<string>;
      try {
        const { stdout } = await execAsync(gitCommand, {
          cwd: projectRoot,
          maxBuffer: 1024 * 1024 * 5, // 5MB buffer
          timeout: 10000, // 10 second timeout
        });

        // Parse output - filter empty lines and create a Set of committed file paths
        committedFiles = new Set(
          stdout
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
        );
      } catch (error) {
        // Git command failed - skip this task
        console.error(`  ⏸ Task #${task.id}: Git log failed - ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }

      // Check if all watched files are committed
      const uncommittedFiles: string[] = [];
      for (const filePath of filePaths) {
        if (!committedFiles.has(filePath)) {
          uncommittedFiles.push(filePath);
        }
      }

      // Determine if task should auto-complete
      const shouldComplete = requireAllFilesCommitted
        ? uncommittedFiles.length === 0  // ALL files must be committed
        : committedFiles.size > 0 && uncommittedFiles.length < filePaths.length;  // At least SOME files committed

      if (shouldComplete) {
        // All watched files committed - transition to done
        db.prepare(`
          UPDATE t_tasks
          SET status_id = ?,
              updated_ts = unixepoch()
          WHERE id = ?
        `).run(TASK_STATUS.DONE, task.id);

        completed++;

        console.error(`  ✓ Task #${task.id}: waiting_review → done (all ${filePaths.length} watched files committed)`);
      } else if (uncommittedFiles.length > 0) {
        console.error(`  ⏸ Task #${task.id}: ${uncommittedFiles.length} of ${filePaths.length} files not yet committed`);
      }
    } catch (error) {
      console.error(`  ✗ Error checking task #${task.id} for git commits:`, error);
      continue;
    }
  }

  return completed;
}

/**
 * Detect and transition in_progress tasks to waiting_review based on quality gates
 * Database-backed approach that survives restarts
 *
 * Quality gates:
 * - Task has been idle (no updates) for configured time (default 3 minutes)
 * - All watched files have been modified at least once
 * - TypeScript compiles without errors (if .ts files)
 * - Tests pass (if test files exist)
 *
 * @param db - Database instance
 * @returns Count of transitioned tasks
 */
export async function detectAndTransitionToReview(db: Database): Promise<number> {
  // 1. Get configuration
  const idleMinutes = getConfigInt(db, CONFIG_KEYS.REVIEW_IDLE_MINUTES, 3);
  const requireAllFilesModified = getConfigBool(db, CONFIG_KEYS.REVIEW_REQUIRE_ALL_FILES_MODIFIED, true);
  const requireTestsPass = getConfigBool(db, CONFIG_KEYS.REVIEW_REQUIRE_TESTS_PASS, true);
  const requireCompile = getConfigBool(db, CONFIG_KEYS.REVIEW_REQUIRE_COMPILE, true);

  // 2. Calculate cutoff timestamp (tasks older than this are candidates)
  const cutoffTimestamp = Math.floor(Date.now() / 1000) - (idleMinutes * 60);

  // 3. Find all in_progress tasks older than cutoff
  const candidateTasks = db.prepare(`
    SELECT t.id, t.created_ts
    FROM t_tasks t
    JOIN m_task_statuses s ON t.status_id = s.id
    WHERE s.name = 'in_progress'
      AND t.updated_ts < ?
  `).all(cutoffTimestamp) as Array<{ id: number; created_ts: number }>;

  if (candidateTasks.length === 0) {
    console.error(`  ℹ No candidate tasks found (no tasks idle > ${idleMinutes} minutes)`);
    return 0;
  }

  console.error(`  ℹ Found ${candidateTasks.length} candidate tasks idle > ${idleMinutes} minutes`);

  let transitioned = 0;
  const projectRoot = process.cwd();

  // 4. For each candidate task, check quality gates
  for (const task of candidateTasks) {
    try {
      // Get watched files for this task
      const watchedFiles = db.prepare(`
        SELECT f.path
        FROM t_task_file_links tfl
        JOIN m_files f ON tfl.file_id = f.id
        WHERE tfl.task_id = ?
      `).all(task.id) as Array<{ path: string }>;

      console.error(`  → Task #${task.id}: ${watchedFiles.length} watched files`);

      if (watchedFiles.length === 0) {
        console.error(`    ⏸ Skipping (no watched files)`);
        continue; // Skip tasks with no watched files
      }

      const filePaths = watchedFiles.map(f => f.path);

      // Determine which files have been modified since task creation
      // by checking file system timestamps
      const modifiedFiles = new Set<string>();
      for (const path of filePaths) {
        try {
          const fullPath = join(projectRoot, path);
          const stats = statSync(fullPath);
          const fileMtimeSeconds = Math.floor(stats.mtimeMs / 1000);

          // If file was modified after task creation, consider it modified
          if (fileMtimeSeconds >= task.created_ts) {
            modifiedFiles.add(path);
          }
        } catch (error) {
          // File doesn't exist or can't be accessed - skip this file
          continue;
        }
      }

      // Run quality checks
      const { ready, results } = await checkReadyForReview(
        db,
        task.id,
        filePaths,
        modifiedFiles,
        {
          requireAllFilesModified,
          requireTestsPass,
          requireCompile,
        }
      );

      if (ready) {
        // All quality gates passed - transition to waiting_review
        db.prepare(`
          UPDATE t_tasks
          SET status_id = ?,
              updated_ts = unixepoch()
          WHERE id = ?
        `).run(TASK_STATUS.WAITING_REVIEW, task.id);

        transitioned++;

        // Log the transition
        console.error(`  ✓ Task #${task.id}: in_progress → waiting_review (quality gates passed)`);
        results.forEach(({ check, result }) => {
          if (result.passed) {
            console.error(`    ✓ ${check}: ${result.message}`);
          }
        });
      } else {
        // Quality gates not passed - log details for debugging
        console.error(`  ⏸ Task #${task.id}: Quality gates not passed (staying in_progress)`);
        results.forEach(({ check, result }) => {
          const icon = result.passed ? '✓' : '✗';
          console.error(`    ${icon} ${check}: ${result.message}`);
          if (result.details) {
            console.error(`      ${result.details}`);
          }
        });
      }
    } catch (error) {
      console.error(`  ✗ Error checking task #${task.id} for review:`, error);
      continue;
    }
  }

  return transitioned;
}
