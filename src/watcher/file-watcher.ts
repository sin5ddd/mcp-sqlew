/**
 * File Watcher - Auto-tracking file changes linked to tasks
 * Monitors files and auto-transitions task status on file modification
 *
 * Features (v3.5.1):
 * - chokidar v4 file watching with automatic WSL support
 * - Project root watching with .gitignore support
 * - Dynamic file registration (add/remove files at runtime)
 * - Auto-transition: todo → in_progress on file change
 * - Maps file paths → task IDs for efficient lookup
 * - Respects .gitignore patterns and built-in ignore rules
 */

import chokidar, { FSWatcher } from 'chokidar';
import { getAdapter, getConfigInt, getConfigBool } from '../database.js';
import { basename, dirname, join } from 'path';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import { executeAcceptanceCriteria } from './test-executor.js';
import { AcceptanceCheck } from '../types.js';
import { GitIgnoreParser, createGitIgnoreParser } from './gitignore-parser.js';
import { checkReadyForReview } from '../utils/quality-checks.js';
import { CONFIG_KEYS } from '../constants.js';
import { detectAndCompleteReviewedTasks, detectAndCompleteOnStaging, detectAndArchiveOnCommit } from '../utils/task-stale-detection.js';
import { detectVCS } from '../utils/vcs-adapter.js';
import { debugLog } from '../utils/debug-logger.js';


/**
 * File-to-task mapping for efficient lookup
 */
interface FileTaskMapping {
  taskId: number;
  taskTitle: string;
  currentStatus: string;
}

/**
 * FileWatcher class - Singleton pattern
 */
export class FileWatcher {
  private static instance: FileWatcher | null = null;
  private watcher: FSWatcher | null = null;
  private watchedFiles: Map<string, FileTaskMapping[]> = new Map();
  private isRunning: boolean = false;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly DEBOUNCE_MS = 2000; // Wait 2s after last write
  private gitignoreParser: GitIgnoreParser | null = null;
  private projectRoot: string;
  private lastModifiedTimes: Map<number, number> = new Map(); // taskId -> timestamp
  private filesModifiedSet: Map<number, Set<string>> = new Map(); // taskId -> modified files
  private vcsDetectionInterval: NodeJS.Timeout | null = null; // Periodic VCS re-detection
  private stagingPollInterval: NodeJS.Timeout | null = null; // WSL staging detection polling

  private constructor() {
    // Private constructor for singleton
    // Determine project root (current working directory)
    this.projectRoot = process.cwd();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): FileWatcher {
    if (!FileWatcher.instance) {
      FileWatcher.instance = new FileWatcher();
    }
    return FileWatcher.instance;
  }

  /**
   * Detect if running on WSL (Windows Subsystem for Linux)
   */
  private isWSL(): boolean {
    // WSL only exists on Linux platform, not on native Windows
    if (process.platform !== 'linux') {
      return false;
    }

    // On Linux, check if it's actually WSL by examining uname
    try {
      const result = execSync('uname -r', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore']  // stdin, stdout, stderr (ignore)
      });
      return result.toLowerCase().includes('microsoft') || result.toLowerCase().includes('wsl');
    } catch {
      // Command failed - not WSL
      return false;
    }
  }

  /**
   * Initialize and start the file watcher (Chokidar v4)
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      debugLog('WARN', 'File watcher already running');
      return;
    }

    try {
      // Initialize gitignore parser
      this.gitignoreParser = createGitIgnoreParser(this.projectRoot);

      // Detect WSL (informational only - chokidar v4 handles WSL automatically)
      const isWSL = this.isWSL();
      if (isWSL) {
        debugLog('INFO', 'WSL detected - chokidar v4 handles WSL automatically');
      }

      // Initialize chokidar v4 with debouncing and gitignore support
      // NOTE: Chokidar v4 automatically detects and handles WSL without manual polling configuration
      // Windows: awaitWriteFinish causes file handle locking - use app-level debounce instead
      const isWindows = process.platform === 'win32';

      this.watcher = chokidar.watch(this.projectRoot, {
        persistent: true,
        ignoreInitial: true, // Don't trigger on startup
        // Windows: disable awaitWriteFinish to prevent file handle locking
        // Other platforms: use chokidar's built-in write stabilization
        awaitWriteFinish: isWindows ? false : {
          stabilityThreshold: this.DEBOUNCE_MS,
          pollInterval: 100
        },
        ignored: (path: string) => {
          // Use gitignore parser to filter files
          if (this.gitignoreParser) {
            return this.gitignoreParser.shouldIgnore(path);
          }
          // Fallback: ignore dotfiles
          return /(^|[\/\\])\./.test(path);
        },
      });

      // Set up event handlers
      this.watcher.on('change', (path: string) => {
        // Check if this is a VCS index file
        if (this.isVCSIndexFile(path)) {
          this.handleVCSIndexChange(path);
        } else {
          this.handleFileChange(path);
        }
      });

      this.watcher.on('add', (path: string) => {
        // Check if this is a VCS index file
        if (this.isVCSIndexFile(path)) {
          this.handleVCSIndexChange(path);
        } else {
          this.handleFileChange(path);
        }
      });

      this.watcher.on('error', (error: unknown) => {
        debugLog('ERROR', 'File watcher error', { error });
      });

      // Load existing task-file links from database
      await this.loadTaskFileLinks();

      // Initialize tracking maps
      this.lastModifiedTimes.clear();
      this.filesModifiedSet.clear();

      // Watch VCS index files for commit detection (VCS-aware auto-complete)
      await this.watchVCSIndexFiles();

      // Periodic VCS re-detection
      // Handles case where git is initialized after watcher starts
      // Check every 5 minutes for new VCS initialization
      this.vcsDetectionInterval = setInterval(async () => {
        await this.refreshVCSWatching();
      }, 5 * 60 * 1000); // 5 minutes

      // WSL-specific: Periodic staging detection
      // Workaround for chokidar not reliably detecting .git/index changes on WSL
      if (isWSL) {
        this.stagingPollInterval = setInterval(async () => {
          await this.pollStagingArea();
        }, 1000); // Poll every 1 second
        debugLog('INFO', 'WSL periodic staging detection enabled (1s interval)');
      }

      this.isRunning = true;
      debugLog('INFO', 'File watcher started successfully', {
        projectRoot: this.projectRoot,
        filesWatched: this.watchedFiles.size,
        tasksWatched: this.getTotalTaskCount(),
        gitignoreLoaded: existsSync(this.projectRoot + '/.gitignore')
      });
    } catch (error) {
      debugLog('ERROR', 'Failed to start file watcher', { error });
      throw error;
    }
  }

  /**
   * Stop the file watcher
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      // Clear all debounce timers
      this.debounceTimers.forEach(timer => clearTimeout(timer));
      this.debounceTimers.clear();

      // Clear tracking maps
      this.lastModifiedTimes.clear();
      this.filesModifiedSet.clear();

      // Clear VCS detection interval
      if (this.vcsDetectionInterval) {
        clearInterval(this.vcsDetectionInterval);
        this.vcsDetectionInterval = null;
      }

      // Clear WSL staging poll interval
      if (this.stagingPollInterval) {
        clearInterval(this.stagingPollInterval);
        this.stagingPollInterval = null;
      }

      // Close watcher
      if (this.watcher) {
        await this.watcher.close();
        this.watcher = null;
      }

      this.isRunning = false;
      debugLog('INFO', 'File watcher stopped');
    } catch (error) {
      debugLog('ERROR', 'Error stopping file watcher', { error });
      throw error;
    }
  }

  /**
   * Register a file to watch for a specific task
   */
  public registerFile(filePath: string, taskId: number, taskTitle: string, currentStatus: string): void {
    if (!this.watcher) {
      debugLog('WARN', 'Cannot register file: watcher not initialized');
      return;
    }

    // Normalize path
    const normalizedPath = this.normalizePath(filePath);

    // Add to watched files map
    if (!this.watchedFiles.has(normalizedPath)) {
      this.watchedFiles.set(normalizedPath, []);
    }

    const mappings = this.watchedFiles.get(normalizedPath)!;

    // Check if task already registered for this file
    const existing = mappings.find(m => m.taskId === taskId);
    if (existing) {
      // Update status
      existing.currentStatus = currentStatus;
      existing.taskTitle = taskTitle;
    } else {
      // Add new mapping
      mappings.push({ taskId, taskTitle, currentStatus });
    }
  }

  /**
   * Unregister a file from watching (when task completes or is archived)
   */
  public unregisterFile(filePath: string, taskId: number): void {
    const normalizedPath = this.normalizePath(filePath);
    const mappings = this.watchedFiles.get(normalizedPath);

    if (!mappings) {
      return;
    }

    // Remove this task from the file's mappings
    const filtered = mappings.filter(m => m.taskId !== taskId);

    if (filtered.length === 0) {
      // No more tasks watching this file
      this.watchedFiles.delete(normalizedPath);
      debugLog('INFO', `Removed task mapping for: ${basename(normalizedPath)}`);
    } else {
      this.watchedFiles.set(normalizedPath, filtered);
    }
  }

  /**
   * Unregister all files for a specific task
   */
  public unregisterTask(taskId: number): void {
    const filesToUnregister: string[] = [];

    // Find all files linked to this task
    this.watchedFiles.forEach((mappings, filePath) => {
      if (mappings.some(m => m.taskId === taskId)) {
        filesToUnregister.push(filePath);
      }
    });

    // Unregister each file
    filesToUnregister.forEach(filePath => {
      this.unregisterFile(filePath, taskId);
    });
  }

  /**
   * Check if a path is a VCS index file
   */
  private isVCSIndexFile(path: string): boolean {
    // Git index file
    if (path.endsWith('.git/index') || path.endsWith('.git\\index')) {
      return true;
    }
    // Mercurial dirstate file
    if (path.endsWith('.hg/dirstate') || path.endsWith('.hg\\dirstate')) {
      return true;
    }
    // SVN doesn't have a local index file that changes on commit
    return false;
  }

  /**
   * Get VCS index file path for given VCS type
   * Centralized mapping for easier extension to Mercurial/SVN
   * @param vcsType - VCS type string (Git, Mercurial, SVN)
   * @returns Absolute path to VCS index file, or null if VCS has no local index
   */
  private getVCSIndexPath(vcsType: string): string | null {
    const vcsIndexPaths: Record<string, string | null> = {
      'Git': join(this.projectRoot, '.git', 'index'),
      'Mercurial': join(this.projectRoot, '.hg', 'dirstate'),
      'SVN': null, // SVN has no local index file (commits are remote)
    };

    return vcsIndexPaths[vcsType] || null;
  }

  /**
   * Re-detect VCS and start watching index files
   * Called when VCS might be initialized after watcher starts
   * Public method for external triggering (e.g., after git init)
   */
  public async refreshVCSWatching(): Promise<void> {
    if (!this.watcher || !this.isRunning) {
      debugLog('WARN', 'Cannot refresh VCS watching: watcher not running');
      return;
    }

    debugLog('INFO', 'Re-detecting VCS...');
    await this.watchVCSIndexFiles();
  }

  /**
   * Watch VCS index files for commit detection
   */
  private async watchVCSIndexFiles(): Promise<void> {
    // Detect VCS type
    const vcsAdapter = await detectVCS(this.projectRoot);

    if (!vcsAdapter) {
      debugLog('INFO', 'No VCS detected - skipping VCS index watching');
      return;
    }

    const vcsType = vcsAdapter.getVCSType();
    const indexPath = this.getVCSIndexPath(vcsType);

    if (indexPath === null) {
      debugLog('INFO', `${vcsType} detected - no local index file to watch (commits are remote)`);
      return;
    }

    if (existsSync(indexPath) && this.watcher) {
      this.watcher.add(indexPath);
      debugLog('INFO', `Watching ${indexPath} for ${vcsType} commits`);
    } else if (!existsSync(indexPath)) {
      debugLog('WARN', `${vcsType} index file not found: ${indexPath}`);
    }
  }

  /**
   * Handle file change event
   */
  private async handleFileChange(filePath: string): Promise<void> {
    const normalizedPath = this.normalizePath(filePath);
    const mappings = this.watchedFiles.get(normalizedPath);

    if (!mappings || mappings.length === 0) {
      return;
    }

    debugLog('INFO', `File changed: ${basename(normalizedPath)}`);

    const adapter = getAdapter();
    const knex = adapter.getKnex();

    // Process each task linked to this file
    for (const mapping of mappings) {
      const { taskId, taskTitle, currentStatus } = mapping;

      // Track file modification
      this.lastModifiedTimes.set(taskId, Date.now());
      if (!this.filesModifiedSet.has(taskId)) {
        this.filesModifiedSet.set(taskId, new Set<string>());
      }
      this.filesModifiedSet.get(taskId)!.add(normalizedPath);

      // Auto-transition: todo → in_progress
      if (currentStatus === 'todo') {
        try {
          // Get status IDs
          const todoStatusId = await knex('v4_task_statuses')
            .where({ name: 'todo' })
            .select('id')
            .first() as { id: number } | undefined;
          const inProgressStatusId = await knex('v4_task_statuses')
            .where({ name: 'in_progress' })
            .select('id')
            .first() as { id: number } | undefined;

          if (!todoStatusId || !inProgressStatusId) {
            debugLog('ERROR', 'Cannot find task status IDs');
            return;
          }

          // Update task status: todo → in_progress
          await knex('v4_tasks')
            .where({ id: taskId, status_id: todoStatusId.id })
            .update({
              status_id: inProgressStatusId.id,
              updated_ts: knex.raw('unixepoch()')
            });

          // Update in-memory status
          mapping.currentStatus = 'in_progress';

          debugLog('INFO', `Task #${taskId} "${taskTitle}": todo → in_progress`);

          // Log to activity log
          const agentIdRow = await knex('v4_tasks')
            .where({ id: taskId })
            .select('assigned_agent_id')
            .first() as { assigned_agent_id: number | null } | undefined;
          if (agentIdRow?.assigned_agent_id) {
            await knex('v4_activity_log').insert({
              agent_id: agentIdRow.assigned_agent_id,
              action_type: 'task_auto_transition',
              target: `task_id:${taskId}`,
              details: JSON.stringify({
                from_status: 'todo',
                to_status: 'in_progress',
                trigger: 'file_change',
                file_path: normalizedPath
              })
            });
          }
        } catch (error) {
          debugLog('ERROR', `Error auto-transitioning task #${taskId}`, { error });
        }
      }

      // Check acceptance criteria for in_progress tasks
      if (currentStatus === 'in_progress' || mapping.currentStatus === 'in_progress') {
        await this.checkAcceptanceCriteria(taskId, taskTitle, mapping);

        // After debounce period, check if task is ready for review
        // Use setTimeout to check after idle period
        const idleMinutes = await getConfigInt(adapter, CONFIG_KEYS.REVIEW_IDLE_MINUTES, 15);
        setTimeout(async () => {
          await this.checkAndTransitionToReview(taskId);
        }, idleMinutes * 60 * 1000);
      } else {
        debugLog('INFO', `Task #${taskId} "${taskTitle}": status ${currentStatus}`);
      }
    }
  }

  /**
   * Handle VCS index file change - triggers two-step Git-aware workflow
   * Step 1: Staging (git add) → waiting_review → done
   * Step 2: Commit (git commit) → done → archived
   * Fallback: If files already committed (not in staging), use legacy logic
   */
  private async handleVCSIndexChange(filePath: string): Promise<void> {
    debugLog('INFO', 'VCS index changed - checking for tasks ready to auto-transition');

    const db = getAdapter();

    try {
      // Step 1: Check for staged files → complete tasks (waiting_review → done)
      const stagingCompleted = await detectAndCompleteOnStaging(db);

      // Step 2: Check for committed files → archive tasks (done → archived)
      const commitArchived = await detectAndArchiveOnCommit(db);

      // Fallback: Check for committed files → complete tasks (waiting_review → done)
      // This handles cases where files go straight to commit without visible staging
      const commitCompleted = await detectAndCompleteReviewedTasks(db);

      // Log results
      const transitions: string[] = [];
      if (stagingCompleted > 0) {
        transitions.push(`${stagingCompleted} task(s) completed (git add detected)`);
      }
      if (commitCompleted > 0) {
        transitions.push(`${commitCompleted} task(s) completed (git commit fallback)`);
      }
      if (commitArchived > 0) {
        transitions.push(`${commitArchived} task(s) archived (git commit detected)`);
      }

      if (transitions.length > 0) {
        debugLog('INFO', `VCS auto-transition: ${transitions.join(', ')}`);
      } else {
        debugLog('INFO', 'No tasks ready for auto-transition');
      }
    } catch (error) {
      debugLog('ERROR', 'Error during VCS-aware auto-transition', { error });
    }
  }

  /**
   * Poll staging area for changes (WSL workaround)
   * Called periodically on WSL where chokidar doesn't reliably detect .git/index changes
   */
  private async pollStagingArea(): Promise<void> {
    try {
      const db = getAdapter();
      const { detectAndCompleteOnStaging } = await import('../utils/task-stale-detection.js');
      
      const completedCount = await detectAndCompleteOnStaging(db);

      // Only log if tasks were actually completed (reduce noise)
      if (completedCount > 0) {
        debugLog('INFO', `WSL polling detected staging → ${completedCount} task(s) auto-completed`);
      }
    } catch (error) {
      // Silently ignore errors to avoid spamming console
      // The next poll will retry
    }
  }

  /**
   * Check acceptance criteria and auto-complete task if all pass
   */
  private async checkAcceptanceCriteria(
    taskId: number,
    taskTitle: string,
    mapping: FileTaskMapping
  ): Promise<void> {
    const adapter = getAdapter();
    const knex = adapter.getKnex();

    try {
      // Get acceptance criteria JSON
      const taskDetails = await knex('v4_task_details')
        .where({ task_id: taskId })
        .select('acceptance_criteria_json')
        .first() as { acceptance_criteria_json: string | null } | undefined;

      if (!taskDetails || !taskDetails.acceptance_criteria_json) {
        // No acceptance criteria defined, skip auto-completion
        return;
      }

      const checks: AcceptanceCheck[] = JSON.parse(taskDetails.acceptance_criteria_json);

      if (!Array.isArray(checks) || checks.length === 0) {
        return;
      }

      debugLog('INFO', `Checking acceptance criteria for task #${taskId}...`);

      // Execute all checks
      const { allPassed, results } = await executeAcceptanceCriteria(checks);

      // Log individual check results
      results.forEach((result, index) => {
        const icon = result.success ? '✓' : '✗';
        const message = `${icon} Check ${index + 1}: ${result.message}`;
        debugLog(result.success ? 'INFO' : 'WARN', message, result.details ? { details: result.details } : undefined);
      });

      if (allPassed) {
        // All checks passed - auto-complete task: in_progress → done
        const inProgressStatusId = await knex('v4_task_statuses')
          .where({ name: 'in_progress' })
          .select('id')
          .first() as { id: number } | undefined;
        const doneStatusId = await knex('v4_task_statuses')
          .where({ name: 'done' })
          .select('id')
          .first() as { id: number } | undefined;

        if (!inProgressStatusId || !doneStatusId) {
          debugLog('ERROR', 'Cannot find task status IDs');
          return;
        }

        await knex('v4_tasks')
          .where({ id: taskId, status_id: inProgressStatusId.id })
          .update({
            status_id: doneStatusId.id,
            completed_ts: knex.raw('unixepoch()'),
            updated_ts: knex.raw('unixepoch()')
          });

        // Update in-memory status
        mapping.currentStatus = 'done';

        debugLog('INFO', `Task #${taskId} "${taskTitle}": in_progress → done (all checks passed!)`);

        // Unregister from watcher (done tasks don't need watching)
        this.unregisterTask(taskId);

        // Log to activity log
        const agentIdRow = await knex('v4_tasks')
          .where({ id: taskId })
          .select('assigned_agent_id')
          .first() as { assigned_agent_id: number | null } | undefined;
        if (agentIdRow?.assigned_agent_id) {
          await knex('v4_activity_log').insert({
            agent_id: agentIdRow.assigned_agent_id,
            action_type: 'task_auto_complete',
            target: `task_id:${taskId}`,
            details: JSON.stringify({
              from_status: 'in_progress',
              to_status: 'done',
              trigger: 'acceptance_criteria_passed',
              checks_passed: results.length
            })
          });
        }
      } else {
        const failedCount = results.filter(r => !r.success).length;
        debugLog('INFO', `Task #${taskId}: ${failedCount}/${results.length} checks failed, staying in_progress`);
      }
    } catch (error) {
      debugLog('ERROR', `Error checking acceptance criteria for task #${taskId}`, { error });
    }
  }

  /**
   * Load existing task-file links from database
   */
  private async loadTaskFileLinks(): Promise<void> {
    const adapter = getAdapter();
    const knex = adapter.getKnex();

    try {
      // Query all active tasks with file links
      const links = await knex('v4_tasks as t')
        .join('v4_task_statuses as s', 't.status_id', 's.id')
        .join('v4_task_file_links as tfl', 't.id', 'tfl.task_id')
        .join('v4_files as f', 'tfl.file_id', 'f.id')
        .whereIn('s.name', ['todo', 'in_progress', 'waiting_review', 'blocked'])
        .select(
          't.id as task_id',
          't.title as task_title',
          's.name as status',
          'f.path as file_path'
        ) as Array<{
        task_id: number;
        task_title: string;
        status: string;
        file_path: string;
      }>;

      // Register each file
      links.forEach(link => {
        this.registerFile(link.file_path, link.task_id, link.task_title, link.status);
      });

      debugLog('INFO', `Loaded ${links.length} task-file links from database`);
    } catch (error) {
      debugLog('ERROR', 'Error loading task-file links', { error });
      throw error;
    }
  }

  /**
   * Normalize file path (convert to relative path from project root, remove trailing slashes)
   */
  private normalizePath(filePath: string): string {
    // Convert backslashes to forward slashes (Windows compatibility)
    let normalized = filePath.replace(/\\/g, '/');

    // Remove trailing slashes
    normalized = normalized.replace(/[\/\\]+$/, '');

    // Convert absolute paths to relative paths from project root
    const projectRootNormalized = this.projectRoot.replace(/\\/g, '/');
    if (normalized.startsWith(projectRootNormalized + '/')) {
      normalized = normalized.substring(projectRootNormalized.length + 1);
    } else if (normalized.startsWith(projectRootNormalized)) {
      normalized = normalized.substring(projectRootNormalized.length);
    }

    return normalized;
  }

  /**
   * Get total count of tasks being watched
   */
  private getTotalTaskCount(): number {
    const taskIds = new Set<number>();
    this.watchedFiles.forEach(mappings => {
      mappings.forEach(m => taskIds.add(m.taskId));
    });
    return taskIds.size;
  }

  /**
   * Check if task is ready for review and transition if conditions met
   * Quality gates:
   * - All watched files modified at least once
   * - TypeScript compiles without errors (if .ts files)
   * - Tests pass (if test files exist)
   * - Idle for configured time (default 15 minutes)
   *
   * @param taskId - Task ID to check
   */
  private async checkAndTransitionToReview(taskId: number): Promise<void> {
    const adapter = getAdapter();
    const knex = adapter.getKnex();

    try {
      // Get current task status
      const task = await knex('v4_tasks as t')
        .join('v4_task_statuses as s', 's.id', 't.status_id')
        .leftJoin('v4_task_details as td', 'td.task_id', 't.id')
        .where({ 't.id': taskId })
        .select(
          't.status_id',
          's.name as status_name',
          'td.acceptance_criteria_json'
        )
        .first() as { status_id: number; status_name: string; acceptance_criteria_json: string | null } | undefined;

      if (!task) {
        return; // Task not found
      }

      // Only check for in_progress tasks
      if (task.status_name !== 'in_progress') {
        return;
      }

      // Read configuration
      const idleMinutes = await getConfigInt(adapter, CONFIG_KEYS.REVIEW_IDLE_MINUTES, 15);
      const requireAllFilesModified = await getConfigBool(adapter, CONFIG_KEYS.REVIEW_REQUIRE_ALL_FILES_MODIFIED, true);
      const requireTestsPass = await getConfigBool(adapter, CONFIG_KEYS.REVIEW_REQUIRE_TESTS_PASS, true);
      const requireCompile = await getConfigBool(adapter, CONFIG_KEYS.REVIEW_REQUIRE_COMPILE, true);

      // Check idle time
      const lastModified = this.lastModifiedTimes.get(taskId);
      if (!lastModified) {
        return; // No modifications tracked yet
      }

      const idleTimeMs = Date.now() - lastModified;
      const requiredIdleMs = idleMinutes * 60 * 1000;

      if (idleTimeMs < requiredIdleMs) {
        return; // Not idle long enough
      }

      // Get all watched files for this task
      const filePaths: string[] = [];
      this.watchedFiles.forEach((mappings, path) => {
        if (mappings.some(m => m.taskId === taskId)) {
          filePaths.push(path);
        }
      });

      if (filePaths.length === 0) {
        return; // No files being watched
      }

      // Get modified files set
      const modifiedFiles = this.filesModifiedSet.get(taskId) || new Set<string>();

      // Run quality checks
      const { ready, results } = await checkReadyForReview(
        adapter,
        taskId,
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
        debugLog('INFO', `Quality checks passed for task #${taskId}`);

        // Log individual results
        results.forEach(({ check, result }) => {
          debugLog('INFO', `${check}: ${result.message}`);
        });

        // Get waiting_review status ID
        const waitingReviewStatus = await knex('v4_task_statuses')
          .where({ name: 'waiting_review' })
          .select('id')
          .first() as { id: number } | undefined;

        if (!waitingReviewStatus) {
          debugLog('ERROR', 'Cannot find waiting_review status');
          return;
        }

        // Update task status
        await knex('v4_tasks')
          .where({ id: taskId })
          .update({
            status_id: waitingReviewStatus.id,
            updated_ts: knex.raw('unixepoch()')
          });

        debugLog('INFO', `Task #${taskId} auto-transitioned to waiting_review`);

        // Clear tracking for this task
        this.lastModifiedTimes.delete(taskId);
        this.filesModifiedSet.delete(taskId);
      } else {
        // Some checks failed - log details
        const failedChecks = results.filter(({ result }) => !result.passed);
        debugLog('INFO', `Task #${taskId} not ready for review (${failedChecks.length} checks failed)`);
        failedChecks.forEach(({ check, result }) => {
          const details = result.details ? { details: result.details } : undefined;
          debugLog('INFO', `${check}: ${result.message}`, details);
        });
      }
    } catch (error) {
      // Log error but don't crash the watcher
      debugLog('ERROR', `Error checking review readiness for task #${taskId}`, { error });
    }
  }

  /**
   * Get current watcher status
   */
  public getStatus(): {
    running: boolean;
    filesWatched: number;
    tasksWatched: number;
  } {
    return {
      running: this.isRunning,
      filesWatched: this.watchedFiles.size,
      tasksWatched: this.getTotalTaskCount()
    };
  }
}
