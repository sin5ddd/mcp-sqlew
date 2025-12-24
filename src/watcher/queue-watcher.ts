/**
 * Queue Watcher - Monitors hook queue file for changes
 *
 * Watches `.sqlew/queue/pending.json` and processes queued decisions
 * when hooks write to the queue file.
 *
 * Flow:
 * 1. Hook writes to queue file (fast, <100ms)
 * 2. QueueWatcher detects change
 * 3. processHookQueue() registers decisions in DB
 *
 * @since v4.1.0
 */

import { join, dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { BaseWatcher } from './base-watcher.js';
import { getQueuePath, hasQueueItems, processQueue, DecisionQueueItem } from '../utils/hook-queue.js';
import { quickSetDecision } from '../tools/context/actions/quick-set.js';
import { setDecision } from '../tools/context/actions/set.js';
import { debugLog } from '../utils/debug-logger.js';
import type { StatusString } from '../types.js';

/**
 * QueueWatcher - Singleton for monitoring hook queue
 */
export class QueueWatcher extends BaseWatcher {
  private static instance: QueueWatcher | null = null;
  private projectRoot: string;
  private processing: boolean = false;

  private constructor(projectRoot: string) {
    super('QueueWatcher', 500); // 500ms debounce for queue changes
    this.projectRoot = projectRoot;
  }

  /**
   * Get singleton instance
   */
  public static getInstance(projectRoot?: string): QueueWatcher {
    if (!QueueWatcher.instance) {
      if (!projectRoot) {
        throw new Error('QueueWatcher: projectRoot required for first initialization');
      }
      QueueWatcher.instance = new QueueWatcher(projectRoot);
    }
    return QueueWatcher.instance;
  }

  /**
   * Reset singleton (for testing)
   */
  public static reset(): void {
    if (QueueWatcher.instance) {
      QueueWatcher.instance.stop().catch(() => {});
    }
    QueueWatcher.instance = null;
  }

  /**
   * Start watching the queue file
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      debugLog('WARN', `${this.watcherName}: Already running`);
      return;
    }

    try {
      const queuePath = getQueuePath(this.projectRoot);
      const queueDir = dirname(queuePath);

      // Ensure queue directory exists
      if (!existsSync(queueDir)) {
        mkdirSync(queueDir, { recursive: true });
      }

      // Watch the queue directory (not just file, to catch file creation)
      this.watcher = this.initializeWatcher({
        paths: queueDir,
        debounceMs: this.debounceMs,
        ignoreInitial: false, // Process existing queue on startup
      });

      // Handle file changes
      this.watcher.on('add', (path: string) => this.handleQueueChange(path));
      this.watcher.on('change', (path: string) => this.handleQueueChange(path));

      this.watcher.on('error', (error: unknown) => {
        debugLog('ERROR', `${this.watcherName}: Watch error`, { error });
      });

      this.isRunning = true;
      debugLog('INFO', `${this.watcherName}: Started`, {
        projectRoot: this.projectRoot,
        queueDir,
      });

      // Process any existing queue items on startup
      await this.processQueueIfNeeded();
    } catch (error) {
      debugLog('ERROR', `${this.watcherName}: Failed to start`, { error });
      throw error;
    }
  }

  /**
   * Handle queue file change
   */
  private handleQueueChange(path: string): void {
    // Only process pending.json
    if (!path.endsWith('pending.json')) {
      return;
    }

    debugLog('INFO', `${this.watcherName}: Queue file changed`);

    // Debounce to avoid processing during rapid writes
    this.debounce('queue-process', async () => {
      await this.processQueueIfNeeded();
    });
  }

  /**
   * Process queue if items exist
   */
  private async processQueueIfNeeded(): Promise<void> {
    // Prevent concurrent processing
    if (this.processing) {
      return;
    }

    if (!hasQueueItems(this.projectRoot)) {
      return;
    }

    this.processing = true;
    try {
      const count = await processQueue(this.projectRoot, this.processItem.bind(this));
      if (count > 0) {
        debugLog('INFO', `${this.watcherName}: Processed ${count} queue items`);
      }
    } catch (error) {
      debugLog('ERROR', `${this.watcherName}: Error processing queue`, { error });
    } finally {
      this.processing = false;
    }
  }

  /**
   * Process a single queue item
   */
  private async processItem(item: DecisionQueueItem): Promise<void> {
    const { action, data } = item;

    debugLog('INFO', `${this.watcherName}: Processing ${action}`, { key: data.key });

    if (action === 'create') {
      await quickSetDecision({
        key: data.key,
        value: data.value!,
        status: data.status as StatusString,
        layer: data.layer,
        tags: data.tags,
      });
    } else if (action === 'update') {
      await setDecision({
        key: data.key,
        value: data.value || `Updated: ${data.key}`,
        status: data.status as StatusString,
        layer: data.layer,
        tags: data.tags,
      });
    }
  }

  /**
   * Get watcher status
   */
  public getStatus(): { running: boolean; projectRoot: string } {
    return {
      running: this.isRunning,
      projectRoot: this.projectRoot,
    };
  }
}

/**
 * Start the queue watcher
 * Called from MCP server setup after DB initialization
 */
export async function startQueueWatcher(projectRoot: string): Promise<void> {
  const watcher = QueueWatcher.getInstance(projectRoot);
  await watcher.start();
}

/**
 * Stop the queue watcher
 */
export async function stopQueueWatcher(): Promise<void> {
  try {
    const watcher = QueueWatcher.getInstance();
    await watcher.stop();
  } catch {
    // Instance not initialized, nothing to stop
  }
}
