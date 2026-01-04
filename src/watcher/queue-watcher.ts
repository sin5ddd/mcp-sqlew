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
import { getQueuePath, hasQueueItems, processQueue, type QueueItem, type DecisionQueueItem, type ConstraintQueueItem } from '../utils/hook-queue.js';
import { quickSetDecision } from '../tools/context/actions/quick-set.js';
import { setDecision } from '../tools/context/actions/set.js';
import { addConstraint } from '../tools/constraints/actions/add.js';
import { activateConstraintsByTag } from '../tools/constraints/actions/activate.js';
import { debugLog } from '../utils/debug-logger.js';
import type { StatusString } from '../types.js';

/**
 * QueueWatcher - Singleton for monitoring hook queue
 */
export class QueueWatcher extends BaseWatcher {
  private static instance: QueueWatcher | null = null;
  private projectRoot: string;
  private processing: boolean = false;
  private currentCallId: string = '';

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

    const eventId = Math.random().toString(36).slice(2, 6);
    debugLog('INFO', `${this.watcherName}: Queue file changed`, {
      eventId,
      path,
      hasDebounceTimer: this.debounceTimers.has('queue-process'),
    });

    // Debounce to avoid processing during rapid writes
    this.debounce('queue-process', async () => {
      debugLog('INFO', `${this.watcherName}: Debounce callback fired`, { eventId });
      await this.processQueueIfNeeded();
    });
  }

  /**
   * Process queue if items exist
   */
  private async processQueueIfNeeded(): Promise<void> {
    const callId = Math.random().toString(36).slice(2, 8);
    this.currentCallId = callId;  // Store for use in item processors

    // CRITICAL: Set processing flag IMMEDIATELY to prevent race conditions
    // Multiple calls can arrive before the first one finishes checking hasQueueItems
    if (this.processing) {
      debugLog('WARN', `${this.watcherName}: Skipping - already processing`, { callId });
      return;
    }
    this.processing = true;  // SET IMMEDIATELY after check!

    debugLog('INFO', `${this.watcherName}: processQueueIfNeeded called`, {
      callId,
      processing: true,
    });

    try {
      if (!hasQueueItems(this.projectRoot)) {
        debugLog('INFO', `${this.watcherName}: Queue is empty, nothing to process`, { callId });
        return;
      }

      debugLog('INFO', `${this.watcherName}: Starting queue processing`, { callId });
      const count = await processQueue(this.projectRoot, this.processItem.bind(this), callId);
      debugLog('INFO', `${this.watcherName}: Processed ${count} queue items`, { callId });
    } catch (error) {
      debugLog('ERROR', `${this.watcherName}: Error processing queue`, { callId, error });
    } finally {
      this.processing = false;
      debugLog('INFO', `${this.watcherName}: Processing flag reset`, { callId });
    }
  }

  /**
   * Process a single queue item (decision or constraint)
   * @since v4.2.1 - Added constraint support
   */
  private async processItem(item: QueueItem): Promise<void> {
    if (item.type === 'decision') {
      await this.processDecisionItem(item as DecisionQueueItem);
    } else if (item.type === 'constraint') {
      await this.processConstraintItem(item as ConstraintQueueItem);
    }
  }

  /**
   * Process a decision queue item
   */
  private async processDecisionItem(item: DecisionQueueItem): Promise<void> {
    const { action, data } = item;

    debugLog('INFO', `${this.watcherName}: Processing decision ${action}`, {
      callId: this.currentCallId,
      key: data.key,
    });

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
   * Process a constraint queue item
   * @since v4.2.1
   */
  private async processConstraintItem(item: ConstraintQueueItem): Promise<void> {
    const { action, data } = item;

    debugLog('INFO', `${this.watcherName}: Processing constraint ${action}`, {
      callId: this.currentCallId,
      text: data.text?.slice(0, 50),
      category: data.category,
      timestamp: item.timestamp,
    });

    if (action === 'create') {
      const priority = data.priority as 'low' | 'medium' | 'high' | 'critical' | undefined;
      debugLog('INFO', `${this.watcherName}: Calling addConstraint`, {
        callId: this.currentCallId,
        text: data.text?.slice(0, 30),
        category: data.category || 'architecture',
        priority: priority || 'medium',
      });
      const result = await addConstraint({
        constraint_text: data.text,
        category: data.category || 'architecture',
        priority: priority || 'medium',
        layer: data.layer,
        tags: data.tags,
        active: data.active ?? true,
      });
      debugLog('INFO', `${this.watcherName}: addConstraint returned`, {
        callId: this.currentCallId,
        success: result.success,
        constraint_id: result.constraint_id,
      });
    } else if (action === 'activate') {
      // Activate constraints by plan_id tag
      if (data.plan_id) {
        const tag = data.plan_id.slice(0, 8); // Short form of plan_id
        const result = await activateConstraintsByTag(tag);
        debugLog('INFO', `${this.watcherName}: Activated constraints`, {
          callId: this.currentCallId,
          activated_count: result.activated_count,
          plan_tag: tag,
        });
      }
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
