/**
 * Batch processing utilities
 * Provides reusable patterns for batch operations with atomic mode
 */

import { transaction } from '../database.js';
import type { Database } from '../types.js';

/**
 * Result of a single batch item processing
 */
export interface BatchItemResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Batch operation response
 */
export interface BatchResponse<T = any> {
  success: boolean;
  processed: number;
  failed: number;
  results: BatchItemResult<T>[];
}

/**
 * Process items in batch with atomic mode support
 *
 * @param db - Database instance
 * @param items - Array of items to process
 * @param processor - Function to process each item (should NOT wrap in transaction)
 * @param atomic - Whether to use atomic mode (default: true)
 * @param maxItems - Maximum items allowed in batch (default: 50)
 * @returns Batch response with detailed results
 *
 * @example
 * ```typescript
 * const result = processBatch(
 *   db,
 *   tasks,
 *   (task) => createTaskInternal(task, db),
 *   true,
 *   50
 * );
 * ```
 */
export function processBatch<TItem, TResult>(
  db: Database,
  items: TItem[],
  processor: (item: TItem, db: Database) => TResult,
  atomic: boolean = true,
  maxItems: number = 50
): BatchResponse<TResult> {
  // Validate inputs
  if (!items || !Array.isArray(items)) {
    throw new Error('Items must be an array');
  }

  if (items.length === 0) {
    throw new Error('Items array must contain at least one item');
  }

  if (items.length > maxItems) {
    throw new Error(`Batch operations are limited to ${maxItems} items maximum`);
  }

  const results: BatchItemResult<TResult>[] = [];
  let processed = 0;
  let failed = 0;

  // Helper to process a single item
  const processSingleItem = (item: TItem): void => {
    try {
      const data = processor(item, db);
      results.push({
        success: true,
        data
      });
      processed++;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      results.push({
        success: false,
        error: errorMessage
      });
      failed++;

      // In atomic mode, throw immediately to trigger rollback
      if (atomic) {
        throw error;
      }
    }
  };

  try {
    if (atomic) {
      // Atomic mode: wrap in transaction, all succeed or all fail
      return transaction(db, () => {
        for (const item of items) {
          processSingleItem(item);
        }

        return {
          success: failed === 0,
          processed,
          failed,
          results
        };
      });
    } else {
      // Non-atomic mode: process all, return individual results
      for (const item of items) {
        processSingleItem(item);
      }

      return {
        success: failed === 0,
        processed,
        failed,
        results
      };
    }
  } catch (error) {
    if (atomic) {
      // In atomic mode, if any error occurred, all failed
      throw new Error(
        `Batch operation failed (atomic mode): ${error instanceof Error ? error.message : String(error)}`
      );
    } else {
      // In non-atomic mode, return partial results
      return {
        success: false,
        processed,
        failed,
        results
      };
    }
  }
}

/**
 * Wrap a function with transaction handling
 * Converts an internal function (no transaction) to a public API (with transaction)
 *
 * @param internalFn - Internal function without transaction wrapper
 * @param errorPrefix - Error message prefix for better error reporting
 * @returns Wrapped function with transaction handling
 *
 * @example
 * ```typescript
 * // Internal function (no transaction)
 * function createTaskInternal(params, db) {
 *   // ... core logic ...
 *   return result;
 * }
 *
 * // Public function (with transaction)
 * export const createTask = withTransaction(
 *   createTaskInternal,
 *   'Failed to create task'
 * );
 * ```
 */
export function withTransaction<TParams, TResult>(
  internalFn: (params: TParams, db: Database) => TResult,
  errorPrefix: string = 'Operation failed'
): (params: TParams) => TResult {
  return (params: TParams): TResult => {
    // Note: getDatabase() must be imported where this is used
    // We can't import it here to avoid circular dependencies
    const db = (global as any).__database;
    if (!db) {
      throw new Error('Database not initialized');
    }

    try {
      return transaction(db, () => internalFn(params, db));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${errorPrefix}: ${message}`);
    }
  };
}
