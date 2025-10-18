/**
 * File Watcher - Auto-tracking file changes linked to tasks
 * Monitors files and auto-transitions task status on file modification
 *
 * Features:
 * - chokidar-based file watching with debouncing
 * - Dynamic file registration (add/remove files at runtime)
 * - Auto-transition: todo → in_progress on file change
 * - Maps file paths → task IDs for efficient lookup
 */

import chokidar, { FSWatcher } from 'chokidar';
import { getDatabase } from '../database.js';
import { basename, dirname } from 'path';
import { existsSync } from 'fs';
import { executeAcceptanceCriteria } from './test-executor.js';
import { AcceptanceCheck } from '../types.js';

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

  private constructor() {
    // Private constructor for singleton
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
   * Initialize and start the file watcher
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      console.error('⚠ File watcher already running');
      return;
    }

    try {
      // Initialize chokidar with debouncing
      this.watcher = chokidar.watch([], {
        persistent: true,
        ignoreInitial: true, // Don't trigger on startup
        awaitWriteFinish: {
          stabilityThreshold: this.DEBOUNCE_MS,
          pollInterval: 100
        },
        ignored: /(^|[\/\\])\../, // Ignore dotfiles
      });

      // Set up event handlers
      this.watcher.on('change', (path: string) => {
        this.handleFileChange(path);
      });

      this.watcher.on('add', (path: string) => {
        this.handleFileChange(path);
      });

      this.watcher.on('error', (error: Error) => {
        console.error('File watcher error:', error);
      });

      // Load existing task-file links from database
      await this.loadTaskFileLinks();

      this.isRunning = true;
      console.error('✓ File watcher started successfully');
      console.error(`  Watching ${this.watchedFiles.size} files for ${this.getTotalTaskCount()} tasks`);
    } catch (error) {
      console.error('Failed to start file watcher:', error);
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

      // Close watcher
      if (this.watcher) {
        await this.watcher.close();
        this.watcher = null;
      }

      this.isRunning = false;
      console.error('✓ File watcher stopped');
    } catch (error) {
      console.error('Error stopping file watcher:', error);
      throw error;
    }
  }

  /**
   * Register a file to watch for a specific task
   */
  public registerFile(filePath: string, taskId: number, taskTitle: string, currentStatus: string): void {
    if (!this.watcher) {
      console.error('Cannot register file: watcher not initialized');
      return;
    }

    // Normalize path
    const normalizedPath = this.normalizePath(filePath);

    // Add to watched files map
    if (!this.watchedFiles.has(normalizedPath)) {
      this.watchedFiles.set(normalizedPath, []);

      // Check if file exists
      if (existsSync(normalizedPath)) {
        // File exists - watch it directly
        this.watcher.add(normalizedPath);
        console.error(`  Watching file: ${basename(normalizedPath)} for task #${taskId}`);
      } else {
        // File doesn't exist - watch parent directory
        const parentDir = dirname(normalizedPath);
        this.watcher.add(parentDir);
        console.error(`  Watching directory: ${parentDir} for task #${taskId} (file doesn't exist yet)`);
      }
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
      if (this.watcher) {
        this.watcher.unwatch(normalizedPath);
      }
      console.error(`  Stopped watching: ${basename(normalizedPath)}`);
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
   * Handle file change event
   */
  private async handleFileChange(filePath: string): Promise<void> {
    const normalizedPath = this.normalizePath(filePath);
    const mappings = this.watchedFiles.get(normalizedPath);

    if (!mappings || mappings.length === 0) {
      return;
    }

    console.error(`\n📝 File changed: ${basename(normalizedPath)}`);

    const db = getDatabase();

    // Process each task linked to this file
    for (const mapping of mappings) {
      const { taskId, taskTitle, currentStatus } = mapping;

      // Auto-transition: todo → in_progress
      if (currentStatus === 'todo') {
        try {
          // Get status IDs
          const todoStatusId = db.prepare('SELECT id FROM m_task_statuses WHERE name = ?').get('todo') as { id: number } | undefined;
          const inProgressStatusId = db.prepare('SELECT id FROM m_task_statuses WHERE name = ?').get('in_progress') as { id: number } | undefined;

          if (!todoStatusId || !inProgressStatusId) {
            console.error('Cannot find task status IDs');
            return;
          }

          // Update task status: todo → in_progress
          db.prepare(`
            UPDATE t_tasks
            SET status_id = ?, updated_ts = unixepoch()
            WHERE id = ? AND status_id = ?
          `).run(inProgressStatusId.id, taskId, todoStatusId.id);

          // Update in-memory status
          mapping.currentStatus = 'in_progress';

          console.error(`  ✓ Task #${taskId} "${taskTitle}": todo → in_progress`);

          // Log to activity log
          const agentId = db.prepare('SELECT assigned_agent_id FROM t_tasks WHERE id = ?').get(taskId) as { assigned_agent_id: number | null } | undefined;
          if (agentId?.assigned_agent_id) {
            db.prepare(`
              INSERT INTO t_activity_log (agent_id, action_type, target, details)
              VALUES (?, ?, ?, ?)
            `).run(
              agentId.assigned_agent_id,
              'task_auto_transition',
              `task_id:${taskId}`,
              JSON.stringify({
                from_status: 'todo',
                to_status: 'in_progress',
                trigger: 'file_change',
                file_path: normalizedPath
              })
            );
          }
        } catch (error) {
          console.error(`Error auto-transitioning task #${taskId}:`, error);
        }
      }

      // Check acceptance criteria for in_progress tasks
      if (currentStatus === 'in_progress' || mapping.currentStatus === 'in_progress') {
        await this.checkAcceptanceCriteria(taskId, taskTitle, mapping);
      } else {
        console.error(`  • Task #${taskId} "${taskTitle}": status ${currentStatus}`);
      }
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
    const db = getDatabase();

    try {
      // Get acceptance criteria JSON
      const taskDetails = db.prepare(`
        SELECT acceptance_criteria_json
        FROM t_task_details
        WHERE task_id = ?
      `).get(taskId) as { acceptance_criteria_json: string | null } | undefined;

      if (!taskDetails || !taskDetails.acceptance_criteria_json) {
        // No acceptance criteria defined, skip auto-completion
        return;
      }

      const checks: AcceptanceCheck[] = JSON.parse(taskDetails.acceptance_criteria_json);

      if (!Array.isArray(checks) || checks.length === 0) {
        return;
      }

      console.error(`  🔍 Checking acceptance criteria for task #${taskId}...`);

      // Execute all checks
      const { allPassed, results } = await executeAcceptanceCriteria(checks);

      // Log individual check results
      results.forEach((result, index) => {
        const icon = result.success ? '✓' : '✗';
        console.error(`    ${icon} Check ${index + 1}: ${result.message}`);
        if (result.details) {
          console.error(`      Details: ${result.details}`);
        }
      });

      if (allPassed) {
        // All checks passed - auto-complete task: in_progress → done
        const inProgressStatusId = db.prepare('SELECT id FROM m_task_statuses WHERE name = ?').get('in_progress') as { id: number } | undefined;
        const doneStatusId = db.prepare('SELECT id FROM m_task_statuses WHERE name = ?').get('done') as { id: number } | undefined;

        if (!inProgressStatusId || !doneStatusId) {
          console.error('Cannot find task status IDs');
          return;
        }

        db.prepare(`
          UPDATE t_tasks
          SET status_id = ?, completed_ts = unixepoch(), updated_ts = unixepoch()
          WHERE id = ? AND status_id = ?
        `).run(doneStatusId.id, taskId, inProgressStatusId.id);

        // Update in-memory status
        mapping.currentStatus = 'done';

        console.error(`  🎉 Task #${taskId} "${taskTitle}": in_progress → done (all checks passed!)`);

        // Unregister from watcher (done tasks don't need watching)
        this.unregisterTask(taskId);

        // Log to activity log
        const agentId = db.prepare('SELECT assigned_agent_id FROM t_tasks WHERE id = ?').get(taskId) as { assigned_agent_id: number | null } | undefined;
        if (agentId?.assigned_agent_id) {
          db.prepare(`
            INSERT INTO t_activity_log (agent_id, action_type, target, details)
            VALUES (?, ?, ?, ?)
          `).run(
            agentId.assigned_agent_id,
            'task_auto_complete',
            `task_id:${taskId}`,
            JSON.stringify({
              from_status: 'in_progress',
              to_status: 'done',
              trigger: 'acceptance_criteria_passed',
              checks_passed: results.length
            })
          );
        }
      } else {
        const failedCount = results.filter(r => !r.success).length;
        console.error(`  ⏳ Task #${taskId}: ${failedCount}/${results.length} checks failed, staying in_progress`);
      }
    } catch (error) {
      console.error(`Error checking acceptance criteria for task #${taskId}:`, error);
    }
  }

  /**
   * Load existing task-file links from database
   */
  private async loadTaskFileLinks(): Promise<void> {
    const db = getDatabase();

    try {
      // Query all active tasks with file links
      const query = `
        SELECT
          t.id as task_id,
          t.title as task_title,
          s.name as status,
          f.path as file_path
        FROM t_tasks t
        JOIN m_task_statuses s ON t.status_id = s.id
        JOIN t_task_file_links tfl ON t.id = tfl.task_id
        JOIN m_files f ON tfl.file_id = f.id
        WHERE s.name IN ('todo', 'in_progress', 'waiting_review', 'blocked')
      `;

      const links = db.prepare(query).all() as Array<{
        task_id: number;
        task_title: string;
        status: string;
        file_path: string;
      }>;

      // Register each file
      links.forEach(link => {
        this.registerFile(link.file_path, link.task_id, link.task_title, link.status);
      });

      console.error(`  Loaded ${links.length} task-file links from database`);
    } catch (error) {
      console.error('Error loading task-file links:', error);
      throw error;
    }
  }

  /**
   * Normalize file path (resolve relative paths, remove trailing slashes)
   */
  private normalizePath(filePath: string): string {
    // Remove trailing slashes
    let normalized = filePath.replace(/[\/\\]+$/, '');

    // Convert backslashes to forward slashes (Windows compatibility)
    normalized = normalized.replace(/\\/g, '/');

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
