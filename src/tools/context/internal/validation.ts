/**
 * Parameter validation utilities for context/decision operations
 */

import { validateRequired, validateStatus, validateLayer } from '../../../utils/validators.js';
import { validateActionParams, validateBatchParams } from '../../../utils/parameter-validator.js';
import { STRING_TO_STATUS } from '../../../constants.js';
import { parseStringArray } from '../../../utils/param-parser.js';

/**
 * Validate required decision parameters
 */
export function validateDecisionParams(params: any): void {
  if (!params.key || params.key.trim() === '') {
    throw new Error('Parameter "key" is required and cannot be empty');
  }

  if (params.value === undefined || params.value === null) {
    throw new Error('Parameter "value" is required');
  }
}

/**
 * Validate status parameter
 */
export function validateStatusParam(status?: string): void {
  if (status && !STRING_TO_STATUS[status]) {
    throw new Error(`Invalid status: ${status}. Must be 'active', 'deprecated', or 'draft'`);
  }
}

/**
 * Validate layer parameter
 */
export function validateLayerParam(layer?: string): void {
  if (layer) {
    const validLayers = ['presentation', 'business', 'data', 'infrastructure', 'cross-cutting'];
    if (!validLayers.includes(layer)) {
      throw new Error(`Invalid layer. Must be one of: ${validLayers.join(', ')}`);
    }
  }
}

/**
 * Validate pagination parameters
 */
export function validatePaginationParams(limit?: number, offset?: number): void {
  if (limit !== undefined && (limit < 0 || limit > 1000)) {
    throw new Error('Parameter "limit" must be between 0 and 1000');
  }
  if (offset !== undefined && offset < 0) {
    throw new Error('Parameter "offset" must be non-negative');
  }
}

/**
 * Validate sort parameters
 */
export function validateSortParams(sortBy?: string, sortOrder?: string): void {
  if (sortBy && !['updated', 'key', 'version'].includes(sortBy)) {
    throw new Error(`Invalid sort_by: ${sortBy}. Must be 'updated', 'key', or 'version'`);
  }
  if (sortOrder && !['asc', 'desc'].includes(sortOrder)) {
    throw new Error(`Invalid sort_order: ${sortOrder}. Must be 'asc' or 'desc'`);
  }
}

/**
 * Parse relative time to Unix timestamp
 */
export function parseRelativeTime(relativeTime: string): number | null {
  const match = relativeTime.match(/^(\d+)(m|h|d)$/);
  if (!match) {
    // Try parsing as ISO timestamp
    const date = new Date(relativeTime);
    if (isNaN(date.getTime())) {
      return null;
    }
    return Math.floor(date.getTime() / 1000);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];
  const now = Math.floor(Date.now() / 1000);

  switch (unit) {
    case 'm': return now - (value * 60);
    case 'h': return now - (value * 3600);
    case 'd': return now - (value * 86400);
    default: return null;
  }
}

// Re-export common validators
export { validateRequired, validateStatus, validateLayer, validateActionParams, validateBatchParams, parseStringArray };
