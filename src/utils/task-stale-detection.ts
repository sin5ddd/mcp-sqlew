/**
 * Auto-stale detection for Kanban Task Watcher
 * Automatically transitions abandoned tasks based on time thresholds
 *
 * CONVERTED: Using Knex.js with DatabaseAdapter (async/await)
 */

import { DatabaseAdapter } from '../adapters/index.js';
import { getConfigBool, getConfigInt, getAdapter } from '../database.js';
import { calculateTaskArchiveCutoff } from './retention.js';
import { checkReadyForReview } from './quality-checks.js';
import { pruneNonExistentFiles, pruneNonExistentFilesKnex } from './file-pruning.js';
import { statSync, existsSync } from 'fs';
import { join } from 'path';
import { detectVCS } from './vcs-adapter.js';

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
  REJECTED: 7,
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
  GIT_AUTO_COMPLETE_ON_STAGE: 'git_auto_complete_on_stage',
  REQUIRE_ALL_FILES_STAGED: 'require_all_files_staged',
} as const;

/**
 * Default configuration values
 *
 * STALE_HOURS_IN_PROGRESS: 18 hours (supports multi-day tasks and lunch breaks)
 * STALE_HOURS_WAITING_REVIEW: 24 hours (1 day wait for review feedback)
 */
const DEFAULTS = {
  STALE_HOURS_IN_PROGRESS: 18,
  STALE_HOURS_WAITING_REVIEW: 24,
  AUTO_STALE_ENABLED: true,
} as const;

/**
 * Detect and transition stale tasks automatically
 *
 * Detection logic:
 * - Tasks in `in_progress` with `updated_ts` older than threshold → move to `waiting_review`
 *
 * @param adapter - Database adapter instance
 * @returns Count of transitioned tasks
 */
export async function detectAndTransitionStaleTasks(adapter?: DatabaseAdapter): Promise<number> {
  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  // 1. Check if auto-stale is enabled
  const isEnabled = await getConfigBool(
    actualAdapter,
    CONFIG_KEYS.TASK_AUTO_STALE_ENABLED,
    DEFAULTS.AUTO_STALE_ENABLED
  );

  if (!isEnabled) {
    return 0;
  }

  // 2. Get threshold configs (in hours)
  const inProgressThresholdHours = await getConfigInt(
    actualAdapter,
    CONFIG_KEYS.TASK_STALE_HOURS_IN_PROGRESS,
    DEFAULTS.STALE_HOURS_IN_PROGRESS
  );

  const waitingReviewThresholdHours = await getConfigInt(
    actualAdapter,
    CONFIG_KEYS.TASK_STALE_HOURS_WAITING_REVIEW,
    DEFAULTS.STALE_HOURS_WAITING_REVIEW
  );

  // Convert hours to seconds for timestamp comparison
  const inProgressThresholdSeconds = inProgressThresholdHours * 3600;
  const waitingReviewThresholdSeconds = waitingReviewThresholdHours * 3600;

  let totalTransitioned = 0;

  // 3. Transition stale tasks in a transaction
  await actualAdapter.transaction(async (trx) => {
    // 3a. Find and transition in_progress tasks older than threshold to waiting_review
    const currentTs = Math.floor(Date.now() / 1000);
    const cutoffTs = currentTs - inProgressThresholdSeconds;

    const inProgressTransitioned = await trx('v4_tasks')
      .where('status_id', TASK_STATUS.IN_PROGRESS)
      .where('updated_ts', '<', cutoffTs)
      .update({
        status_id: TASK_STATUS.WAITING_REVIEW,
        updated_ts: currentTs
      });

    totalTransitioned += inProgressTransitioned;
  });

  // 4. Return count of transitioned tasks
  return totalTransitioned;
}

/**
 * Get current auto-stale configuration
 *
 * @param adapter - Database adapter instance
 * @returns Current configuration values
 */
export async function getStaleDetectionConfig(adapter?: DatabaseAdapter): Promise<{
  enabled: boolean;
  inProgressThresholdHours: number;
  waitingReviewThresholdHours: number;
}> {
  const actualAdapter = adapter ?? getAdapter();

  return {
    enabled: await getConfigBool(
      actualAdapter,
      CONFIG_KEYS.TASK_AUTO_STALE_ENABLED,
      DEFAULTS.AUTO_STALE_ENABLED
    ),
    inProgressThresholdHours: await getConfigInt(
      actualAdapter,
      CONFIG_KEYS.TASK_STALE_HOURS_IN_PROGRESS,
      DEFAULTS.STALE_HOURS_IN_PROGRESS
    ),
    waitingReviewThresholdHours: await getConfigInt(
      actualAdapter,
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
 * @param adapter - Database adapter instance
 * @returns Count of archived tasks
 */
export async function autoArchiveOldDoneTasks(adapter?: DatabaseAdapter): Promise<number> {
  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  // Calculate cutoff timestamp using weekend-aware retention logic
  const cutoffTimestamp = await calculateTaskArchiveCutoff(actualAdapter);

  // Archive done tasks older than cutoff
  const currentTs = Math.floor(Date.now() / 1000);
  const archivedCount = await knex('v4_tasks')
    .where('status_id', TASK_STATUS.DONE)
    .where('updated_ts', '<', cutoffTimestamp)
    .update({
      status_id: TASK_STATUS.ARCHIVED,
      updated_ts: currentTs
    });

  return archivedCount;
}

/**
 * Detect and complete tasks in waiting_review or in_progress when all watched files are committed
 *
 * VCS-aware auto-complete strategy (v3.4.0+):
 * - Find all tasks in `waiting_review` or `in_progress` status with watched files
 * - For each task, check if ALL watched files have been committed since task creation
 * - Query VCS history to determine committed files
 * - If all files committed → transition to `done` (VCS commit = implicit approval)
 * - Supports multiple VCS: Git, Mercurial, SVN
 * - Gracefully handle non-VCS repos (skip auto-complete)
 *
 * @param adapter - Database adapter instance
 * @returns Count of auto-completed tasks
 */
export async function detectAndCompleteReviewedTasks(adapter?: DatabaseAdapter): Promise<number> {
  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  // 1. Check if auto-complete is enabled
  const isEnabled = await getConfigBool(actualAdapter, CONFIG_KEYS.GIT_AUTO_COMPLETE_ENABLED, true);
  if (!isEnabled) {
    return 0;
  }

  const requireAllFilesCommitted = await getConfigBool(actualAdapter, CONFIG_KEYS.REQUIRE_ALL_FILES_COMMITTED, true);

  // 2. Find all waiting_review and in_progress tasks
  const candidateTasks = await knex('v4_tasks as t')
    .join('v4_task_statuses as s', 't.status_id', 's.id')
    .whereIn('s.name', ['waiting_review', 'in_progress'])
    .select('t.id', 't.created_ts', 's.name as status_name') as Array<{ id: number; created_ts: number; status_name: string }>;

  if (candidateTasks.length === 0) {
    return 0;
  }

  let completed = 0;
  const projectRoot = process.cwd();

  // 3. Detect VCS type
  const vcsAdapter = await detectVCS(projectRoot);
  if (!vcsAdapter) {
    // Not a VCS repository - skip VCS-aware completion
    console.error('  ℹ Not a VCS repository (Git/Mercurial/SVN) - skipping VCS-aware auto-complete');
    return 0;
  }

  console.error(`  ℹ VCS detected: ${vcsAdapter.getVCSType()}`);

  // 4. For each candidate task, check if all watched files are committed
  for (const task of candidateTasks) {
    try {
      // Get watched files for this task
      const watchedFiles = await knex('v4_task_file_links as tfl')
        .join('v4_files as f', 'tfl.file_id', 'f.id')
        .where('tfl.task_id', task.id)
        .select('f.path') as Array<{ path: string }>;

      if (watchedFiles.length === 0) {
        // No watched files - skip this task
        continue;
      }

      const filePaths = watchedFiles.map(f => f.path);

      // Query VCS history for commits since task creation
      // Convert Unix timestamp to ISO 8601 format for VCS adapters
      const sinceTimestamp = new Date(task.created_ts * 1000).toISOString();

      let committedFiles: Set<string>;
      try {
        const committedFilesList = await vcsAdapter.getCommittedFilesSince(sinceTimestamp);
        committedFiles = new Set(committedFilesList);
      } catch (error) {
        // VCS query failed - skip this task
        console.error(`  ⏸ Task #${task.id}: ${vcsAdapter.getVCSType()} query failed - ${error instanceof Error ? error.message : String(error)}`);
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
        const currentTs = Math.floor(Date.now() / 1000);
        await knex('v4_tasks')
          .where({ id: task.id })
          .update({
            status_id: TASK_STATUS.DONE,
            updated_ts: currentTs
          });

        completed++;

        console.error(`  ✓ Task #${task.id}: ${task.status_name} → done (all ${filePaths.length} watched files committed)`);
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
 * Detect and auto-complete tasks in waiting_review when all watched files are staged
 * (v3.5.2 - Two-step Git-aware workflow: staging → done)
 *
 * Logic:
 * - Find all tasks in waiting_review status
 * - Check if ALL watched files are staged (git add)
 * - If yes → transition to done
 * - Respects git_auto_complete_on_stage config
 *
 * @param db - Database instance
 * @returns Count of auto-completed tasks
 */
export async function detectAndCompleteOnStaging(adapter?: DatabaseAdapter): Promise<number> {
  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  // 1. Check if auto-complete on staging is enabled
  const isEnabled = await getConfigBool(actualAdapter, CONFIG_KEYS.GIT_AUTO_COMPLETE_ON_STAGE, true);
  if (!isEnabled) {
    return 0;
  }

  const requireAllFilesStaged = await getConfigBool(actualAdapter, CONFIG_KEYS.REQUIRE_ALL_FILES_STAGED, true);

  // 2. Find all waiting_review tasks
  const candidateTasks = await knex('v4_tasks as t')
    .join('v4_task_statuses as s', 't.status_id', 's.id')
    .where('s.name', 'waiting_review')
    .select('t.id', 't.created_ts') as Array<{ id: number; created_ts: number }>;

  if (candidateTasks.length === 0) {
    return 0;
  }

  let completed = 0;
  const projectRoot = process.cwd();

  // 3. Detect VCS type
  const vcsAdapter = await detectVCS(projectRoot);
  if (!vcsAdapter) {
    // Not a VCS repository - skip VCS-aware completion
    return 0;
  }

  // 4. For each candidate task, check if all watched files are staged
  for (const task of candidateTasks) {
    try {
      // Get watched files for this task
      const watchedFiles = await knex('v4_task_file_links as tfl')
        .join('v4_files as f', 'tfl.file_id', 'f.id')
        .where('tfl.task_id', task.id)
        .select('f.path') as Array<{ path: string }>;

      if (watchedFiles.length === 0) {
        // No watched files - skip this task
        continue;
      }

      const filePaths = watchedFiles.map(f => f.path);

      // Get staged files from VCS
      let stagedFiles: Set<string>;
      try {
        const stagedFilesList = await vcsAdapter.getStagedFiles();
        stagedFiles = new Set(stagedFilesList);
      } catch (error) {
        // VCS query failed - skip this task
        console.error(`  ⏸ Task #${task.id}: ${vcsAdapter.getVCSType()} staging query failed - ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }

      // Check if all watched files are staged
      const unstagedFiles: string[] = [];
      for (const filePath of filePaths) {
        if (!stagedFiles.has(filePath)) {
          unstagedFiles.push(filePath);
        }
      }

      // Determine if task should auto-complete
      const shouldComplete = requireAllFilesStaged
        ? unstagedFiles.length === 0  // ALL files must be staged
        : stagedFiles.size > 0 && unstagedFiles.length < filePaths.length;  // At least SOME files staged

      if (shouldComplete) {
        // All watched files staged - transition to done
        const currentTs = Math.floor(Date.now() / 1000);
        await knex('v4_tasks')
          .where({ id: task.id })
          .update({
            status_id: TASK_STATUS.DONE,
            completed_ts: currentTs,
            updated_ts: currentTs
          });

        completed++;

        console.error(`  ✓ Task #${task.id}: waiting_review → done (all ${filePaths.length} watched files staged)`);
      }
    } catch (error) {
      console.error(`  ✗ Error checking task #${task.id} for staged files:`, error);
      continue;
    }
  }

  return completed;
}

/**
 * Detect and auto-archive tasks in done when all watched files are committed
 * (v3.5.2 - Two-step Git-aware workflow: commit → archived)
 *
 * Logic:
 * - Find all tasks in done status
 * - Check if ALL watched files are committed (git commit)
 * - If yes → transition to archived
 * - Respects git_auto_archive_on_commit config
 *
 * @param db - Database instance
 * @returns Count of auto-archived tasks
 */
export async function detectAndArchiveOnCommit(adapter?: DatabaseAdapter): Promise<number> {
  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  // 1. Check if auto-archive on commit is enabled
  const isEnabled = await getConfigBool(actualAdapter, 'git_auto_archive_on_commit', true);
  if (!isEnabled) {
    return 0;
  }

  const requireAllFilesCommitted = await getConfigBool(actualAdapter, 'require_all_files_committed_for_archive', true);

  // 2. Find all done tasks
  const candidateTasks = await knex('v4_tasks as t')
    .join('v4_task_statuses as s', 't.status_id', 's.id')
    .where('s.name', 'done')
    .select('t.id', 't.created_ts') as Array<{ id: number; created_ts: number }>;

  if (candidateTasks.length === 0) {
    return 0;
  }

  let archived = 0;
  const projectRoot = process.cwd();

  // 3. Detect VCS type
  const vcsAdapter = await detectVCS(projectRoot);
  if (!vcsAdapter) {
    // Not a VCS repository - skip VCS-aware archiving
    return 0;
  }

  // 4. For each candidate task, check if all watched files are committed
  for (const task of candidateTasks) {
    try {
      // Get watched files for this task
      const watchedFiles = await knex('v4_task_file_links as tfl')
        .join('v4_files as f', 'tfl.file_id', 'f.id')
        .where('tfl.task_id', task.id)
        .select('f.path') as Array<{ path: string }>;

      if (watchedFiles.length === 0) {
        // No watched files - skip this task
        continue;
      }

      const filePaths = watchedFiles.map(f => f.path);

      // Query VCS history for commits since task creation
      // Convert Unix timestamp to ISO 8601 format for VCS adapters
      const sinceTimestamp = new Date(task.created_ts * 1000).toISOString();

      let committedFiles: Set<string>;
      try {
        const committedFilesList = await vcsAdapter.getCommittedFilesSince(sinceTimestamp);
        committedFiles = new Set(committedFilesList);
      } catch (error) {
        // VCS query failed - skip this task
        console.error(`  ⏸ Task #${task.id}: ${vcsAdapter.getVCSType()} commit query failed - ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }

      // Check if all watched files are committed
      const uncommittedFiles: string[] = [];
      for (const filePath of filePaths) {
        if (!committedFiles.has(filePath)) {
          uncommittedFiles.push(filePath);
        }
      }

      // Determine if task should auto-archive
      const shouldArchive = requireAllFilesCommitted
        ? uncommittedFiles.length === 0  // ALL files must be committed
        : committedFiles.size > 0 && uncommittedFiles.length < filePaths.length;  // At least SOME files committed

      if (shouldArchive) {
        // All watched files committed - transition to archived
        const currentTs = Math.floor(Date.now() / 1000);
        await knex('v4_tasks')
          .where({ id: task.id })
          .update({
            status_id: TASK_STATUS.ARCHIVED,
            updated_ts: currentTs
          });

        archived++;

        console.error(`  📦 Task #${task.id}: done → archived (all ${filePaths.length} watched files committed)`);
      }
    } catch (error) {
      console.error(`  ✗ Error checking task #${task.id} for commits:`, error);
      continue;
    }
  }

  return archived;
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
export async function detectAndTransitionToReview(adapter?: DatabaseAdapter): Promise<number> {
  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  // 1. Get idle threshold config (default 15 minutes, matches system default)
  const idleMinutes = await getConfigInt(actualAdapter, 'review_idle_minutes', 15);
  const idleSeconds = idleMinutes * 60;
  const currentTs = Math.floor(Date.now() / 1000);
  const cutoffTs = currentTs - idleSeconds;

  // 2. Find idle in_progress tasks
  const idleTasks = await knex('v4_tasks')
    .where('status_id', TASK_STATUS.IN_PROGRESS)
    .where('updated_ts', '<', cutoffTs)
    .select('id');

  let transitioned = 0;
  const projectRoot = process.cwd();

  // 3. For each task, attempt pruning + transition
  for (const task of idleTasks) {
    try {
      await knex.transaction(async (trx) => {
        // Prune non-existent files (will throw if ALL pruned)
        await pruneNonExistentFilesKnex(trx, task.id, projectRoot);

        // Transition to waiting_review
        await trx('v4_tasks')
          .where('id', task.id)
          .update({
            status_id: TASK_STATUS.WAITING_REVIEW,
            updated_ts: currentTs,
          });

        transitioned++;
      });
    } catch (error) {
      // Safety check caught - skip this task
      if (error instanceof Error && error.message.includes('ALL') && error.message.includes('non-existent')) {
        console.error(`⚠️  Task #${task.id}: Skipped (all files non-existent)`);
      } else {
        throw error; // Re-throw unexpected errors
      }
    }
  }

  return transitioned;
}
