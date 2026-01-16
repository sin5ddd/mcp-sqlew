/**
 * Queue list action
 *
 * Lists all pending items in the hook queue
 *
 * @since v5.0.0
 */

import { readQueue, getQueuePath, DecisionQueueItem, ConstraintQueueItem } from '../../../utils/hook-queue.js';
import type { ListQueueParams, ListQueueResponse } from '../types.js';

/**
 * List all items in the queue
 *
 * @param projectPath - Project root path
 * @returns Queue items with metadata
 */
export function listQueue(projectPath: string, _params?: ListQueueParams): ListQueueResponse {
  const queue = readQueue(projectPath);
  const queuePath = getQueuePath(projectPath);

  const items = queue.items.map((item, index) => {
    if (item.type === 'decision') {
      const decisionItem = item as DecisionQueueItem;
      return {
        index,
        type: 'decision' as const,
        action: decisionItem.action,
        timestamp: decisionItem.timestamp,
        key: decisionItem.data.key,
        layer: decisionItem.data.layer,
        tags: decisionItem.data.tags,
      };
    } else {
      const constraintItem = item as ConstraintQueueItem;
      return {
        index,
        type: 'constraint' as const,
        action: constraintItem.action,
        timestamp: constraintItem.timestamp,
        text: constraintItem.data.text,
        layer: constraintItem.data.layer,
        tags: constraintItem.data.tags,
      };
    }
  });

  return {
    items,
    count: items.length,
    queuePath,
  };
}
