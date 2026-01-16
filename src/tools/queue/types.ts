/**
 * Queue tool types
 *
 * Types for managing the hook queue file (.sqlew/queue/pending.json)
 *
 * @since v5.0.0
 */

// Re-export queue types from hook-queue
export type {
  QueueItem,
  QueueFile,
  DecisionQueueItem,
  ConstraintQueueItem,
  QueueAction,
} from '../../utils/hook-queue.js';

/**
 * Queue tool action types
 */
export type QueueToolAction = 'list' | 'clear' | 'remove' | 'help' | 'example';

/**
 * List action params (no params needed)
 */
export interface ListQueueParams {
  projectPath?: string;
}

/**
 * List action response
 */
export interface ListQueueResponse {
  items: Array<{
    index: number;
    type: 'decision' | 'constraint';
    action: string;
    timestamp: string;
    key?: string;
    text?: string;
    layer?: string;
    tags?: string[];
  }>;
  count: number;
  queuePath: string;
}

/**
 * Clear action params
 */
export interface ClearQueueParams {
  projectPath?: string;
  confirm?: boolean;
}

/**
 * Clear action response
 */
export interface ClearQueueResponse {
  success: boolean;
  cleared: number;
  message: string;
}

/**
 * Remove action params
 */
export interface RemoveQueueParams {
  index: number;
  projectPath?: string;
}

/**
 * Remove action response
 */
export interface RemoveQueueResponse {
  success: boolean;
  removed: {
    type: 'decision' | 'constraint';
    action: string;
    key?: string;
    text?: string;
  } | null;
  remainingCount: number;
  message: string;
}
