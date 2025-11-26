/**
 * Centralized validation utilities
 * Phase 1 modularization - eliminates 27+ duplicate validation patterns
 * Token savings: ~2,600 tokens across 5 tool files
 */

import type { DatabaseAdapter } from '../adapters/index.js';

/**
 * Validates required string parameter (trim and check non-empty)
 * @throws Error if value is undefined, null, empty, or whitespace-only
 */
export function validateRequired(value: any, paramName: string): string {
  // Check for undefined or null first (before calling .trim())
  if (value === undefined || value === null) {
    throw new Error(`${paramName} is required`);
  }

  // Check type
  if (typeof value !== 'string') {
    throw new Error(`${paramName} must be a string`);
  }

  // Now safe to call .trim()
  const trimmed = value.trim();
  if (trimmed === '') {
    throw new Error(`${paramName} is required`);
  }

  return trimmed;
}

/**
 * Validates status enum value
 * @throws Error if status is not valid
 */
export function validateStatus(status: string): 'active' | 'deprecated' | 'draft' {
  const validStatuses = ['active', 'deprecated', 'draft'];
  if (!validStatuses.includes(status)) {
    throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
  }
  return status as 'active' | 'deprecated' | 'draft';
}

/**
 * Validates priority string (low/medium/high/critical)
 * @throws Error if priority is not valid
 */
export function validatePriority(priority: string): 'low' | 'medium' | 'high' | 'critical' {
  const validPriorities = ['low', 'medium', 'high', 'critical'];
  if (!validPriorities.includes(priority)) {
    throw new Error(`Invalid priority. Must be one of: ${validPriorities.join(', ')}`);
  }
  return priority as 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Validates priority number (1-4 range)
 * @throws Error if priority is out of range
 */
export function validatePriorityRange(priority: number): number {
  if (priority < 1 || priority > 4) {
    throw new Error('Priority must be between 1 and 4');
  }
  return priority;
}

/**
 * Validates layer and returns layer_id
 * @throws Error if layer is invalid
 */
export async function validateLayer(adapter: DatabaseAdapter, layer: string): Promise<number> {
  const validLayers = ['presentation', 'business', 'data', 'infrastructure', 'cross-cutting'];
  if (!validLayers.includes(layer)) {
    throw new Error(`Invalid layer. Must be one of: ${validLayers.join(', ')}`);
  }

  const knex = adapter.getKnex();
  const result = await knex('v4_layers').where({ name: layer }).select('id').first() as { id: number } | undefined;
  if (!result) {
    throw new Error(`Layer not found in database: ${layer}`);
  }
  return result.id;
}

/**
 * Validates message type enum
 * @throws Error if message type is invalid
 */
export function validateMessageType(msgType: string): 'decision' | 'warning' | 'request' | 'info' {
  const validTypes = ['decision', 'warning', 'request', 'info'];
  if (!validTypes.includes(msgType)) {
    throw new Error(`Invalid message type. Must be one of: ${validTypes.join(', ')}`);
  }
  return msgType as 'decision' | 'warning' | 'request' | 'info';
}

/**
 * Validates change type enum
 * @throws Error if change type is invalid
 */
export function validateChangeType(changeType: string): 'created' | 'modified' | 'deleted' {
  const validTypes = ['created', 'modified', 'deleted'];
  if (!validTypes.includes(changeType)) {
    throw new Error(`Invalid change type. Must be one of: ${validTypes.join(', ')}`);
  }
  return changeType as 'created' | 'modified' | 'deleted';
}

/**
 * Validates category enum
 * @throws Error if category is invalid
 */
export function validateCategory(category: string): 'performance' | 'architecture' | 'security' {
  const validCategories = ['performance', 'architecture', 'security'];
  if (!validCategories.includes(category)) {
    throw new Error(`Invalid category. Must be one of: ${validCategories.join(', ')}`);
  }
  return category as 'performance' | 'architecture' | 'security';
}

/**
 * Validates string length
 * @throws Error if string exceeds max length
 */
export function validateLength(value: string, paramName: string, maxLength: number): string {
  if (value.length > maxLength) {
    throw new Error(`${paramName} exceeds maximum length of ${maxLength} characters`);
  }
  return value;
}

/**
 * Validates number is within range
 * @throws Error if number is out of range
 */
export function validateRange(value: number, paramName: string, min: number, max: number): number {
  if (value < min || value > max) {
    throw new Error(`${paramName} must be between ${min} and ${max}`);
  }
  return value;
}
