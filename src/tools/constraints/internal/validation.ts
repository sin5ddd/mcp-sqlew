/**
 * Parameter validation utilities for constraint operations
 */

import { validateCategory, validatePriority } from '../../../utils/validators.js';
import { validateActionParams } from '../../../utils/parameter-validator.js';
import { STANDARD_LAYERS } from '../../../constants.js';

/**
 * Validate layer parameter for constraints
 */
export function validateLayerParam(layer?: string): void {
  if (layer && !STANDARD_LAYERS.includes(layer as any)) {
    throw new Error(
      `Invalid layer: ${layer}. Must be one of: ${STANDARD_LAYERS.join(', ')}`
    );
  }
}

// Re-export common validators
export { validateCategory, validatePriority, validateActionParams };
