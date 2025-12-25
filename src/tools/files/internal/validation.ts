/**
 * Parameter validation utilities for file operations
 */

import { validateChangeType } from '../../../utils/validators.js';
import { validateActionParams, validateBatchParams } from '../../../utils/parameter-validator.js';
import { STANDARD_LAYERS } from '../../../constants.js';
import type { DatabaseAdapter } from '../../../adapters/types.js';
import {
  BatchValidationError,
  validateRequiredField,
  validateEnum,
} from '../../../utils/batch-validation.js';

/**
 * Validate layer parameter
 */
export function validateLayerParam(layer?: string): void {
  if (layer && !STANDARD_LAYERS.includes(layer as any)) {
    throw new Error(
      `Invalid layer: ${layer}. Must be one of: ${STANDARD_LAYERS.join(', ')}`
    );
  }
}

// Re-export common validators
export { validateChangeType, validateActionParams, validateBatchParams };

/**
 * Valid change types for file operations
 */
const VALID_CHANGE_TYPES = ['created', 'modified', 'deleted'] as const;

/**
 * Validate single file change item in batch operation
 * Accumulates all validation errors for the item
 */
export async function validateFileChangeItem(
  item: any,
  index: number,
  adapter: DatabaseAdapter,
  errors: BatchValidationError[]
): Promise<void> {
  const identifier = item.file_path || `Item ${index + 1}`;

  // Required: file_path
  validateRequiredField(item.file_path, 'file_path', index, identifier, errors);

  // Optional: agent_name (legacy sub-agent system removed in v4.1.2)

  // Required: change_type
  validateRequiredField(item.change_type, 'change_type', index, identifier, errors);
  validateEnum(item.change_type, 'change_type', VALID_CHANGE_TYPES, index, identifier, errors);

  // Optional but must be valid: layer
  if (item.layer !== undefined) {
    validateEnum(item.layer, 'layer', STANDARD_LAYERS, index, identifier, errors);
  }
}
