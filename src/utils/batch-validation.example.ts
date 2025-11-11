/**
 * Batch Validation Usage Examples
 * Demonstrates how to use batch validation utilities in batch operations
 *
 * This file is NOT imported by production code - it's documentation only
 */

import type { DatabaseAdapter } from '../adapters/types.js';
import {
  validateBatch,
  formatBatchValidationError,
  validateRequiredField,
  validateEnum,
  validateType,
  validateRange,
  validateLength,
  validateLayerFileRequirement,
  type BatchValidationError
} from './batch-validation.js';

// ============================================================================
// Example 1: Task Batch Validation
// ============================================================================

/**
 * Validate single task item for batch creation
 * This validator would be called by validateBatch() for each task
 */
async function validateTaskItem(
  task: any,
  index: number,
  adapter: DatabaseAdapter,
  errors: BatchValidationError[]
): Promise<void> {
  const identifier = task.title || `Item ${index}`;

  // Required fields
  validateRequiredField(task.title, 'title', index, identifier, errors);

  // String length
  if (task.title) {
    validateLength(task.title, 'title', 200, index, identifier, errors);
  }

  // Enums
  if (task.status) {
    validateEnum(
      task.status,
      'status',
      ['todo', 'in_progress', 'waiting_review', 'blocked', 'done', 'archived'],
      index,
      identifier,
      errors
    );
  }

  if (task.layer) {
    validateEnum(
      task.layer,
      'layer',
      ['presentation', 'business', 'data', 'infrastructure', 'cross-cutting',
       'documentation', 'planning', 'coordination', 'review'],
      index,
      identifier,
      errors
    );
  }

  // Range validation
  if (task.priority !== undefined) {
    validateRange(task.priority, 'priority', 1, 4, index, identifier, errors);
  }

  // Type validation
  if (task.tags !== undefined) {
    validateType(task.tags, 'tags', 'array', index, identifier, errors);
  }

  // Complex field validation: file_actions
  if (task.file_actions !== undefined) {
    validateType(task.file_actions, 'file_actions', 'array', index, identifier, errors);

    if (Array.isArray(task.file_actions)) {
      task.file_actions.forEach((fa: any, faIndex: number) => {
        if (!fa.action) {
          errors.push({
            itemIndex: index,
            itemIdentifier: identifier,
            field: `file_actions[${faIndex}].action`,
            issue: 'Missing action field in file_actions',
            fix: 'Add action field: { action: "create"|"edit"|"delete", path: "..." }',
            current: fa
          });
        } else {
          validateEnum(
            fa.action,
            `file_actions[${faIndex}].action`,
            ['create', 'edit', 'delete'],
            index,
            identifier,
            errors
          );
        }

        if (!fa.path || typeof fa.path !== 'string') {
          errors.push({
            itemIndex: index,
            itemIdentifier: identifier,
            field: `file_actions[${faIndex}].path`,
            issue: 'Missing or invalid path field in file_actions',
            fix: 'Add path field as string: { action: "...", path: "src/file.ts" }',
            current: fa
          });
        }
      });
    }
  }

  // Layer-specific validation (FILE_REQUIRED vs FILE_OPTIONAL)
  validateLayerFileRequirement(task.layer, task.file_actions, index, identifier, errors);
}

/**
 * Example batch operation with pre-validation
 */
async function batchCreateTasksExample(params: { tasks: any[] }, adapter: DatabaseAdapter) {
  // Basic validation
  if (!params.tasks || !Array.isArray(params.tasks)) {
    throw new Error('Parameter "tasks" is required and must be an array');
  }

  if (params.tasks.length > 50) {
    throw new Error('Parameter "tasks" must contain at most 50 items');
  }

  // ✅ PRE-VALIDATION: Check ALL items BEFORE transaction
  const validationResult = await validateBatch(
    params.tasks,
    validateTaskItem,
    adapter
  );

  // ✅ FAIL FAST: If any validation errors, throw formatted error
  if (!validationResult.valid) {
    throw new Error(formatBatchValidationError(validationResult));
  }

  // Validation passed - proceed with transaction
  console.log('All items valid, proceeding with batch creation...');
  // ... existing batch creation logic
}

// ============================================================================
// Example 2: Decision Batch Validation
// ============================================================================

/**
 * Validate single decision item for batch set
 */
async function validateDecisionItem(
  decision: any,
  index: number,
  adapter: DatabaseAdapter,
  errors: BatchValidationError[]
): Promise<void> {
  const identifier = decision.key || `Item ${index}`;

  // Required fields
  validateRequiredField(decision.key, 'key', index, identifier, errors);
  validateRequiredField(decision.value, 'value', index, identifier, errors);

  // Enums
  if (decision.status) {
    validateEnum(
      decision.status,
      'status',
      ['active', 'deprecated', 'draft'],
      index,
      identifier,
      errors
    );
  }

  if (decision.layer) {
    validateEnum(
      decision.layer,
      'layer',
      ['presentation', 'business', 'data', 'infrastructure', 'cross-cutting',
       'documentation', 'planning', 'coordination', 'review'],
      index,
      identifier,
      errors
    );
  }

  // Type validation
  if (decision.tags !== undefined) {
    validateType(decision.tags, 'tags', 'array', index, identifier, errors);
  }
}

// ============================================================================
// Example 3: File Change Batch Validation
// ============================================================================

/**
 * Validate single file change item for batch record
 */
async function validateFileChangeItem(
  fileChange: any,
  index: number,
  adapter: DatabaseAdapter,
  errors: BatchValidationError[]
): Promise<void> {
  const identifier = fileChange.file_path || `Item ${index}`;

  // Required fields
  validateRequiredField(fileChange.file_path, 'file_path', index, identifier, errors);

  // Enums
  if (fileChange.change_type) {
    validateEnum(
      fileChange.change_type,
      'change_type',
      ['created', 'modified', 'deleted'],
      index,
      identifier,
      errors
    );
  }

  if (fileChange.layer) {
    validateEnum(
      fileChange.layer,
      'layer',
      ['presentation', 'business', 'data', 'infrastructure', 'cross-cutting',
       'documentation', 'planning', 'coordination', 'review'],
      index,
      identifier,
      errors
    );
  }
}

// ============================================================================
// Example 4: Error Output Examples
// ============================================================================

/**
 * Example error message for batch with multiple issues
 *
 * Input:
 * {
 *   tasks: [
 *     { title: "Task 1", layer: "busines", priority: 5 },
 *     { layer: "presentation" },  // Missing title and file_actions
 *     { title: "Task 3", layer: "planning" }  // Valid
 *   ]
 * }
 *
 * Output:
 * ```
 * Batch validation failed. Found 4 validation error(s) in 2 item(s). 1 items are valid.
 *
 * Item 0 (Task 1):
 *   ❌ layer: Invalid layer: "busines"
 *      💡 Fix: Change to "business" (closest match)
 *      Current: "busines"
 *      Valid: presentation, business, data, infrastructure, cross-cutting, documentation, planning, coordination, review
 *
 *   ❌ priority: Field "priority" must be between 1 and 4
 *      💡 Fix: Provide a number between 1 and 4
 *      Current: 5
 *
 * Item 1 (Item 1):
 *   ❌ title: Field "title" is required but missing or empty
 *      💡 Fix: Provide a non-empty value for "title"
 *      Current: undefined
 *
 *   ❌ file_actions: Layer "presentation" requires file_actions parameter
 *      💡 Fix: Add file_actions: [{ action: "edit", path: "src/..." }] or use [] for planning tasks
 *      Current: undefined
 *      Valid: Add file_actions array, Change to FILE_OPTIONAL layer (planning/coordination/review)
 *
 * 💡 Result: 1 valid, 2 invalid
 * 💡 Action: Fix the 2 invalid item(s) and retry batch operation
 * ```
 */
