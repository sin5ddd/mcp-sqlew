/**
 * Task parameter validation utilities
 */

import { validatePriorityRange, validateLength } from '../../../utils/validators.js';
import { STATUS_TO_ID, TaskFileAction } from '../types.js';
import { FILE_REQUIRED_LAYERS, FILE_OPTIONAL_LAYERS, STANDARD_LAYERS } from '../../../constants.js';
import type { DatabaseAdapter } from '../../../adapters/types.js';
import {
  BatchValidationError,
  validateRequiredField,
  validateEnum,
  validateType,
  validateRange,
  validateLayerFileRequirement,
} from '../../../utils/batch-validation.js';

/**
 * Validate task creation parameters
 */
export function validateTaskCreateParams(params: {
  title: string;
  priority?: number;
  status?: string;
}): void {
  // Validate required parameters
  if (!params.title || params.title.trim() === '') {
    throw new Error('Parameter "title" is required and cannot be empty');
  }

  validateLength(params.title, 'Parameter "title"', 200);

  // Validate priority if provided
  if (params.priority !== undefined) {
    validatePriorityRange(params.priority);
  }

  // Validate status if provided
  if (params.status) {
    const statusId = STATUS_TO_ID[params.status];
    if (!statusId) {
      throw new Error(`Invalid status: ${params.status}. Must be one of: todo, in_progress, waiting_review, blocked, done, archived`);
    }
  }
}

/**
 * Validate task update parameters
 */
export function validateTaskUpdateParams(params: {
  task_id: number;
  title?: string;
  priority?: number;
}): void {
  if (!params.task_id) {
    throw new Error('Parameter "task_id" is required');
  }

  if (params.title !== undefined) {
    if (params.title.trim() === '') {
      throw new Error('Parameter "title" cannot be empty');
    }
    validateLength(params.title, 'Parameter "title"', 200);
  }

  if (params.priority !== undefined) {
    validatePriorityRange(params.priority);
  }
}

/**
 * Parse array parameters (handles MCP SDK char array bug)
 */
export function parseArrayParam(value: any, paramName: string): string[] {
  if (typeof value === 'string') {
    // String - try to parse as JSON
    try {
      return JSON.parse(value);
    } catch {
      // If not valid JSON, treat as single item
      return [value];
    }
  } else if (Array.isArray(value)) {
    // Check if it's an array of single characters (MCP SDK bug)
    if (value.every((item: any) => typeof item === 'string' && item.length === 1)) {
      // Join characters back into string and parse JSON
      const jsonString = value.join('');
      try {
        return JSON.parse(jsonString);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        throw new Error(`Invalid ${paramName} format: ${jsonString}. ${errMsg}`);
      }
    } else {
      // Normal array
      return value;
    }
  } else {
    throw new Error(`Parameter "${paramName}" must be a string or array`);
  }
}

/**
 * Process acceptance criteria (string or array to database format)
 */
export function processAcceptanceCriteria(acceptanceCriteria: string | any[] | undefined): {
  acceptanceCriteriaString: string | null;
  acceptanceCriteriaJson: string | null;
} {
  let acceptanceCriteriaString: string | null = null;
  let acceptanceCriteriaJson: string | null = null;

  if (acceptanceCriteria) {
    if (Array.isArray(acceptanceCriteria)) {
      // Array format - store as JSON in acceptance_criteria_json
      acceptanceCriteriaJson = JSON.stringify(acceptanceCriteria);
      // Also create human-readable summary in acceptance_criteria
      acceptanceCriteriaString = acceptanceCriteria
        .map((check: any, i: number) => `${i + 1}. ${check.type}: ${check.command || check.file || check.pattern || ''}`)
        .join('\n');
    } else if (typeof acceptanceCriteria === 'string') {
      // Try to parse as JSON first
      try {
        const parsed = JSON.parse(acceptanceCriteria);
        if (Array.isArray(parsed)) {
          // It's a JSON array string - store in JSON field
          acceptanceCriteriaJson = acceptanceCriteria;
          // Also create human-readable summary
          acceptanceCriteriaString = parsed
            .map((check: any, i: number) => `${i + 1}. ${check.type}: ${check.command || check.file || check.pattern || ''}`)
            .join('\n');
        } else {
          // Valid JSON but not an array - store as plain text
          acceptanceCriteriaString = acceptanceCriteria;
        }
      } catch {
        // Not valid JSON - store as plain text
        acceptanceCriteriaString = acceptanceCriteria;
      }
    }
  }

  return { acceptanceCriteriaString, acceptanceCriteriaJson };
}

/**
 * Validate file_actions parameter based on layer (v3.8.0)
 */
export function validateFileActions(layer: string | undefined, file_actions: TaskFileAction[] | undefined): void {
  // Only validate if layer is specified
  if (!layer) return;

  // Check if layer requires file_actions
  if (FILE_REQUIRED_LAYERS.includes(layer as any)) {
    if (file_actions === undefined) {
      throw new Error(
        `file_actions is required for layer '${layer}' (v3.8.0: 9 layers total).\n` +
        `\n` +
        `FILE_REQUIRED layers (6): presentation, business, data, infrastructure, cross-cutting, documentation\n` +
        `  → Must provide file_actions parameter (or [] for non-file tasks)\n` +
        `\n` +
        `FILE_OPTIONAL layers (3): planning, coordination, review\n` +
        `  → file_actions parameter is optional\n` +
        `\n` +
        `Example: file_actions: [{ action: 'edit', path: 'src/model/user.ts' }]\n` +
        `Use [] for non-file tasks, or switch to a FILE_OPTIONAL layer if no files are involved.`
      );
    }
  }

  // Validate structure if provided
  if (file_actions) {
    const VALID_ACTIONS = ['create', 'edit', 'delete'];
    file_actions.forEach((fa, i) => {
      if (!VALID_ACTIONS.includes(fa.action)) {
        throw new Error(
          `Invalid action at index ${i}: '${fa.action}'. Must be one of: create, edit, delete (v3.8.0)\n` +
          `\n` +
          `Example: { action: 'edit', path: 'src/model/user.ts' }`
        );
      }
      if (!fa.path || typeof fa.path !== 'string') {
        throw new Error(
          `Invalid path at index ${i}: path must be a non-empty string (v3.8.0)\n` +
          `\n` +
          `Example: { action: 'edit', path: 'src/model/user.ts' }`
        );
      }
    });
  }
}

/**
 * Convert watch_files to file_actions for backward compatibility (v3.8.0)
 */
export function convertWatchFilesToFileActions(watch_files: string[] | undefined): TaskFileAction[] | undefined {
  if (!watch_files || watch_files.length === 0) return undefined;

  return watch_files.map(path => ({
    action: 'edit' as const,
    path
  }));
}

/**
 * Batch validation for task items
 * Pre-validates all items before database transaction
 */

const VALID_TASK_STATUSES = ['todo', 'in_progress', 'waiting_review', 'blocked', 'done', 'archived'] as const;
const VALID_FILE_ACTIONS = ['create', 'edit', 'delete'] as const;

/**
 * Validate single task item in batch operation
 * Accumulates all validation errors for the item
 */
export async function validateTaskItem(
  item: any,
  index: number,
  adapter: DatabaseAdapter,
  errors: BatchValidationError[]
): Promise<void> {
  const identifier = item.title || `Item ${index + 1}`;

  // Required: title
  validateRequiredField(item.title, 'title', index, identifier, errors);

  // Optional but must be valid: layer
  if (item.layer !== undefined) {
    validateEnum(item.layer, 'layer', STANDARD_LAYERS, index, identifier, errors);
  }

  // Optional but must be valid: status
  if (item.status !== undefined) {
    validateEnum(item.status, 'status', VALID_TASK_STATUSES, index, identifier, errors);
  }

  // Optional but must be valid: priority (1-5)
  if (item.priority !== undefined) {
    validateRange(item.priority, 'priority', 1, 5, index, identifier, errors);
  }

  // Validate file_actions requirement based on layer
  validateLayerFileRequirement(item.layer, item.file_actions, index, identifier, errors);

  // Validate file_actions structure if provided
  if (item.file_actions !== undefined) {
    // Must be array
    validateType(item.file_actions, 'file_actions', 'array', index, identifier, errors);

    // Validate each file action
    if (Array.isArray(item.file_actions)) {
      item.file_actions.forEach((fa: any, faIndex: number) => {
        if (!fa || typeof fa !== 'object') {
          errors.push({
            itemIndex: index,
            itemIdentifier: identifier,
            field: `file_actions[${faIndex}]`,
            issue: 'Must be an object with action and path fields',
            fix: 'Use format: { action: "create"|"edit"|"delete", path: "src/..." }',
            current: fa
          });
          return;
        }

        // Validate action field
        if (!fa.action) {
          errors.push({
            itemIndex: index,
            itemIdentifier: identifier,
            field: `file_actions[${faIndex}].action`,
            issue: 'Missing required field "action"',
            fix: 'Add action: "create"|"edit"|"delete"',
            current: undefined
          });
        } else {
          validateEnum(fa.action, `file_actions[${faIndex}].action`, VALID_FILE_ACTIONS, index, identifier, errors);
        }

        // Validate path field
        if (!fa.path) {
          errors.push({
            itemIndex: index,
            itemIdentifier: identifier,
            field: `file_actions[${faIndex}].path`,
            issue: 'Missing required field "path"',
            fix: 'Add path: "src/..."',
            current: undefined
          });
        } else if (typeof fa.path !== 'string') {
          errors.push({
            itemIndex: index,
            itemIdentifier: identifier,
            field: `file_actions[${faIndex}].path`,
            issue: 'Path must be a string',
            fix: 'Provide string path like "src/model/user.ts"',
            current: fa.path
          });
        }
      });
    }
  }

  // Validate tags if provided
  if (item.tags !== undefined) {
    validateType(item.tags, 'tags', 'array', index, identifier, errors);
  }
}
