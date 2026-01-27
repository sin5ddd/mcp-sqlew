/**
 * Queue list action
 *
 * Lists all pending items in the hook queue (both pending and failed)
 *
 * @since v5.0.0
 */

import {
  readQueue,
  getQueuePath,
  readFailedQueue,
  getFailedQueuePath,
  DecisionQueueItem,
  ConstraintQueueItem,
} from '../../../utils/hook-queue.js';
import type { ListQueueParams, ListQueueResponse } from '../types.js';

/**
 * List all items in the queue (pending and failed)
 *
 * @param projectPath - Project root path
 * @returns Queue items with metadata
 */
export function listQueue(projectPath: string, _params?: ListQueueParams): ListQueueResponse {
  const queue = readQueue(projectPath);
  const queuePath = getQueuePath(projectPath);

  const items = queue.items
    // Filter out invalid items (defensive parsing)
    .filter((item): item is DecisionQueueItem | ConstraintQueueItem =>
      item != null && typeof item.type === 'string'
    )
    .map((item, index) => {
      if (item.type === 'decision') {
        const decisionItem = item as DecisionQueueItem;
        return {
          index,
          type: 'decision' as const,
          action: decisionItem.action,
          timestamp: decisionItem.timestamp,
          key: decisionItem.data?.key,
          layer: decisionItem.data?.layer,
          tags: decisionItem.data?.tags,
        };
      } else {
        const constraintItem = item as ConstraintQueueItem;
        return {
          index,
          type: 'constraint' as const,
          action: constraintItem.action,
          timestamp: constraintItem.timestamp,
          text: constraintItem.data?.text,
          layer: constraintItem.data?.layer,
          tags: constraintItem.data?.tags,
        };
      }
    });

  // Also read failed queue
  const failedQueue = readFailedQueue(projectPath);
  const failedQueuePath = getFailedQueuePath(projectPath);

  const failedItems = failedQueue.items
    // Filter out invalid items (defensive parsing)
    .filter((failedItem): failedItem is { item: DecisionQueueItem | ConstraintQueueItem; error: string; failedAt: string } =>
      failedItem != null &&
      failedItem.item != null &&
      typeof failedItem.item.type === 'string'
    )
    .map((failedItem, index) => {
      const item = failedItem.item;
      if (item.type === 'decision') {
        const decisionItem = item as DecisionQueueItem;
        return {
          index,
          type: 'decision' as const,
          action: decisionItem.action,
          timestamp: decisionItem.timestamp,
          key: decisionItem.data?.key,
          error: failedItem.error,
          failedAt: failedItem.failedAt,
        };
      } else {
        const constraintItem = item as ConstraintQueueItem;
        return {
          index,
          type: 'constraint' as const,
          action: constraintItem.action,
          timestamp: constraintItem.timestamp,
          text: constraintItem.data?.text,
          error: failedItem.error,
          failedAt: failedItem.failedAt,
        };
      }
    });

  const response: ListQueueResponse = {
    items,
    count: items.length,
    queuePath,
  };

  // Only include failed info if there are failed items
  if (failedItems.length > 0) {
    response.failedItems = failedItems;
    response.failedCount = failedItems.length;
    response.failedQueuePath = failedQueuePath;
  }

  return response;
}
