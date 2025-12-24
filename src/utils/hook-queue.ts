/**
 * Hook Queue System
 *
 * File-based queue for async decision operations.
 * Hooks write to queue (fast), MCP server processes on startup.
 *
 * @since v4.1.0
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';

// ============================================================================
// Types
// ============================================================================

/** Queue item action type */
export type QueueAction = 'create' | 'update';

/** Queue item for decision operations */
export interface DecisionQueueItem {
  type: 'decision';
  action: QueueAction;
  timestamp: string;
  data: {
    key: string;
    value?: string;
    status?: string;
    layer?: string;
    tags?: string[];
  };
}

/** Queue file structure */
export interface QueueFile {
  items: DecisionQueueItem[];
}

// ============================================================================
// Constants
// ============================================================================

/** Queue directory relative to project root */
const QUEUE_DIR = '.sqlew/queue';

/** Queue file name */
const QUEUE_FILE = 'pending.json';

// ============================================================================
// Queue File Operations
// ============================================================================

/**
 * Get queue file path for a project
 */
export function getQueuePath(projectPath: string): string {
  return join(projectPath, QUEUE_DIR, QUEUE_FILE);
}

/**
 * Ensure queue directory exists
 */
function ensureQueueDir(projectPath: string): void {
  const queueDir = join(projectPath, QUEUE_DIR);
  if (!existsSync(queueDir)) {
    mkdirSync(queueDir, { recursive: true });
  }
}

/**
 * Read queue file (returns empty queue if not exists)
 */
export function readQueue(projectPath: string): QueueFile {
  const queuePath = getQueuePath(projectPath);
  if (!existsSync(queuePath)) {
    return { items: [] };
  }
  try {
    const content = readFileSync(queuePath, 'utf-8');
    return JSON.parse(content) as QueueFile;
  } catch {
    // If file is corrupted, return empty queue
    return { items: [] };
  }
}

/**
 * Write queue file
 */
function writeQueue(projectPath: string, queue: QueueFile): void {
  ensureQueueDir(projectPath);
  const queuePath = getQueuePath(projectPath);
  writeFileSync(queuePath, JSON.stringify(queue, null, 2), 'utf-8');
}

// ============================================================================
// Enqueue Operations (Used by Hooks - Fast, No DB)
// ============================================================================

/**
 * Enqueue a decision creation
 *
 * @param projectPath - Project root path
 * @param data - Decision data
 */
export function enqueueDecisionCreate(
  projectPath: string,
  data: {
    key: string;
    value: string;
    status: string;
    layer: string;
    tags: string[];
  }
): void {
  const queue = readQueue(projectPath);
  const item: DecisionQueueItem = {
    type: 'decision',
    action: 'create',
    timestamp: new Date().toISOString(),
    data,
  };
  queue.items.push(item);
  writeQueue(projectPath, queue);
}

/**
 * Enqueue a decision status update
 *
 * @param projectPath - Project root path
 * @param data - Update data (key + new status)
 */
export function enqueueDecisionUpdate(
  projectPath: string,
  data: {
    key: string;
    value?: string;
    status: string;
    layer?: string;
    tags?: string[];
  }
): void {
  const queue = readQueue(projectPath);
  const item: DecisionQueueItem = {
    type: 'decision',
    action: 'update',
    timestamp: new Date().toISOString(),
    data,
  };
  queue.items.push(item);
  writeQueue(projectPath, queue);
}

// ============================================================================
// Process Queue (Used by MCP Server on Startup)
// ============================================================================

/**
 * Process all pending queue items
 *
 * Called by MCP server after DB initialization.
 * Processes items in order, then clears the queue.
 *
 * @param projectPath - Project root path
 * @param processor - Function to process each item
 * @returns Number of items processed
 */
export async function processQueue(
  projectPath: string,
  processor: (item: DecisionQueueItem) => Promise<void>
): Promise<number> {
  const queue = readQueue(projectPath);
  if (queue.items.length === 0) {
    return 0;
  }

  let processed = 0;
  const errors: Array<{ item: DecisionQueueItem; error: string }> = [];

  for (const item of queue.items) {
    try {
      await processor(item);
      processed++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ item, error: message });
      console.error(`[hook-queue] Error processing item: ${message}`);
    }
  }

  // Clear processed items (keep failed items for retry)
  if (errors.length === 0) {
    clearQueue(projectPath);
  } else {
    // Keep only failed items
    const failedItems = errors.map((e) => e.item);
    writeQueue(projectPath, { items: failedItems });
  }

  return processed;
}

/**
 * Clear the queue file
 */
export function clearQueue(projectPath: string): void {
  const queuePath = getQueuePath(projectPath);
  if (existsSync(queuePath)) {
    writeQueue(projectPath, { items: [] });
  }
}

/**
 * Check if queue has pending items
 */
export function hasQueueItems(projectPath: string): boolean {
  const queue = readQueue(projectPath);
  return queue.items.length > 0;
}
