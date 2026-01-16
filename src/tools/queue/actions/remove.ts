/**
 * Queue remove action
 *
 * Removes a specific item from the hook queue by index
 *
 * @since v5.0.0
 */

import {
  readQueue,
  writeQueue,
  tryAcquireLock,
  releaseLock,
  DecisionQueueItem,
  ConstraintQueueItem,
} from '../../../utils/hook-queue.js';
import type { RemoveQueueParams, RemoveQueueResponse } from '../types.js';

/**
 * Remove a specific item from the queue
 *
 * Uses lock mechanism to prevent race conditions with QueueWatcher
 *
 * @param projectPath - Project root path
 * @param params - Remove parameters (index required)
 * @returns Remove result with removed item info
 */
export function removeFromQueue(projectPath: string, params: RemoveQueueParams): RemoveQueueResponse {
  const { index } = params;

  // Validate index
  if (typeof index !== 'number' || index < 0) {
    return {
      success: false,
      removed: null,
      remainingCount: -1,
      message: `Invalid index: ${index}. Index must be a non-negative number.`,
    };
  }

  // Acquire lock to prevent race conditions
  if (!tryAcquireLock(projectPath)) {
    return {
      success: false,
      removed: null,
      remainingCount: -1,
      message: 'Cannot remove item: another process is currently processing the queue. Please try again.',
    };
  }

  try {
    const queue = readQueue(projectPath);

    // Check if index is valid
    if (index >= queue.items.length) {
      return {
        success: false,
        removed: null,
        remainingCount: queue.items.length,
        message: `Index ${index} is out of range. Queue has ${queue.items.length} item(s) (valid indices: 0-${queue.items.length - 1}).`,
      };
    }

    // Remove the item
    const removedItem = queue.items.splice(index, 1)[0];
    writeQueue(projectPath, queue, 'queueTool_remove');

    // Format removed item for response
    let removed: RemoveQueueResponse['removed'];
    if (removedItem.type === 'decision') {
      const decisionItem = removedItem as DecisionQueueItem;
      removed = {
        type: 'decision',
        action: decisionItem.action,
        key: decisionItem.data.key,
      };
    } else {
      const constraintItem = removedItem as ConstraintQueueItem;
      removed = {
        type: 'constraint',
        action: constraintItem.action,
        text: constraintItem.data.text,
      };
    }

    return {
      success: true,
      removed,
      remainingCount: queue.items.length,
      message: `Successfully removed item at index ${index}. ${queue.items.length} item(s) remaining.`,
    };
  } finally {
    releaseLock(projectPath);
  }
}
