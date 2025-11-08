/**
 * Task parameter validation utilities
 */

import { validatePriorityRange, validateLength } from '../../../utils/validators.js';
import { STATUS_TO_ID } from '../types.js';

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
