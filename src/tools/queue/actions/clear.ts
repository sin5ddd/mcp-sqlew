/**
 * Queue clear action
 *
 * Clears all pending items from the hook queue
 *
 * @since v5.0.0
 */

import {
  readQueue,
  writeQueue,
  tryAcquireLock,
  releaseLock,
} from '../../../utils/hook-queue.js';
import type { ClearQueueParams, ClearQueueResponse } from '../types.js';

/**
 * Clear all items from the queue
 *
 * Uses lock mechanism to prevent race conditions with QueueWatcher
 *
 * @param projectPath - Project root path
 * @returns Clear result with count of cleared items
 */
export function clearQueue(projectPath: string, _params?: ClearQueueParams): ClearQueueResponse {
  // Acquire lock to prevent race conditions
  if (!tryAcquireLock(projectPath)) {
    return {
      success: false,
      cleared: 0,
      message: 'Cannot clear queue: another process is currently processing the queue. Please try again.',
    };
  }

  try {
    const queue = readQueue(projectPath);
    const count = queue.items.length;

    if (count === 0) {
      return {
        success: true,
        cleared: 0,
        message: 'Queue is already empty.',
      };
    }

    // Clear the queue
    writeQueue(projectPath, { items: [] }, 'queueTool_clear');

    return {
      success: true,
      cleared: count,
      message: `Successfully cleared ${count} item(s) from the queue.`,
    };
  } finally {
    releaseLock(projectPath);
  }
}
