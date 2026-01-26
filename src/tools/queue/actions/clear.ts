/**
 * Queue clear action
 *
 * Clears items from the hook queue (pending, failed, or both)
 *
 * @since v5.0.0
 */

import {
  readQueue,
  writeQueue,
  readFailedQueue,
  clearFailedQueue,
  tryAcquireLock,
  releaseLock,
} from '../../../utils/hook-queue.js';
import type { ClearQueueParams, ClearQueueResponse } from '../types.js';

/**
 * Clear items from the queue
 *
 * Uses lock mechanism to prevent race conditions with QueueWatcher
 *
 * @param projectPath - Project root path
 * @param params - Optional params including target ('pending', 'failed', or 'all')
 * @returns Clear result with count of cleared items
 */
export function clearQueue(projectPath: string, params?: ClearQueueParams): ClearQueueResponse {
  const target = params?.target ?? 'pending';

  // Acquire lock to prevent race conditions (only needed for pending queue)
  if (target !== 'failed' && !tryAcquireLock(projectPath)) {
    return {
      success: false,
      cleared: 0,
      message: 'Cannot clear queue: another process is currently processing the queue. Please try again.',
    };
  }

  try {
    let clearedPending = 0;
    let clearedFailed = 0;

    // Clear pending queue
    if (target === 'pending' || target === 'all') {
      const queue = readQueue(projectPath);
      clearedPending = queue.items.length;
      if (clearedPending > 0) {
        writeQueue(projectPath, { items: [] }, 'queueTool_clear');
      }
    }

    // Clear failed queue
    if (target === 'failed' || target === 'all') {
      const failedQueue = readFailedQueue(projectPath);
      clearedFailed = failedQueue.items.length;
      if (clearedFailed > 0) {
        clearFailedQueue(projectPath);
      }
    }

    const totalCleared = clearedPending + clearedFailed;

    if (totalCleared === 0) {
      return {
        success: true,
        cleared: 0,
        message: target === 'all'
          ? 'Both queues are already empty.'
          : `${target === 'pending' ? 'Pending' : 'Failed'} queue is already empty.`,
      };
    }

    let message: string;
    if (target === 'all') {
      message = `Successfully cleared ${clearedPending} pending and ${clearedFailed} failed item(s).`;
    } else if (target === 'failed') {
      message = `Successfully cleared ${clearedFailed} item(s) from the failed queue.`;
    } else {
      message = `Successfully cleared ${clearedPending} item(s) from the pending queue.`;
    }

    return {
      success: true,
      cleared: totalCleared,
      message,
    };
  } finally {
    if (target !== 'failed') {
      releaseLock(projectPath);
    }
  }
}
