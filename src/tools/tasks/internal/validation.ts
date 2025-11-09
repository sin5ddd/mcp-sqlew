/**
 * Task parameter validation utilities
 */

import { validatePriorityRange, validateLength } from '../../../utils/validators.js';
import { STATUS_TO_ID, TaskFileAction } from '../types.js';
import { FILE_REQUIRED_LAYERS, FILE_OPTIONAL_LAYERS } from '../../../constants.js';

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
        `file_actions is required for layer '${layer}'.\n` +
        `\n` +
        `FILE_REQUIRED layers (6): presentation, business, data, infrastructure, cross-cutting, documentation\n` +
        `FILE_OPTIONAL layers (3): planning, coordination, review\n` +
        `\n` +
        `Example: file_actions: [{ action: 'edit', path: 'src/model/user.ts' }]\n` +
        `Use [] for non-file tasks, or switch to a planning layer (planning, coordination, review) if no files are involved.`
      );
    }
  }

  // Validate structure if provided
  if (file_actions) {
    const VALID_ACTIONS = ['create', 'edit', 'delete'];
    file_actions.forEach((fa, i) => {
      if (!VALID_ACTIONS.includes(fa.action)) {
        throw new Error(
          `Invalid action at index ${i}: '${fa.action}'. Must be one of: create, edit, delete\n` +
          `Example: { action: 'edit', path: 'src/model/user.ts' }`
        );
      }
      if (!fa.path || typeof fa.path !== 'string') {
        throw new Error(
          `Invalid path at index ${i}: path must be a non-empty string.\n` +
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
