/**
 * Quick set decision with smart defaults and inference
 * Reduces required parameters from 7 to 2 (key + value only)
 *
 * Inference Rules:
 * - Layer: Inferred from key prefix
 * - Tags: Extracted from key hierarchy
 * - Scope: Inferred from key hierarchy
 * - Auto-defaults: status=active, version=1.0.0
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { DEFAULT_VERSION } from '../../../constants.js';
import { validateActionParams } from '../internal/validation.js';
import { setDecision } from './set.js';
import type { QuickSetDecisionParams, QuickSetDecisionResponse, SetDecisionParams } from '../types.js';

/**
 * Quick set decision with smart defaults
 *
 * @param params - Quick set parameters (key and value required)
 * @param adapter - Optional database adapter (for testing)
 * @returns Response with success status and inferred metadata
 */
export async function quickSetDecision(
  params: QuickSetDecisionParams,
  adapter?: DatabaseAdapter
): Promise<QuickSetDecisionResponse> {
  // Validate parameters
  try {
    validateActionParams('decision', 'quick_set', params);
  } catch (error) {
    throw error;
  }

  // Validate required parameters
  if (!params.key || params.key.trim() === '') {
    throw new Error('Parameter "key" is required and cannot be empty');
  }

  if (params.value === undefined || params.value === null) {
    throw new Error('Parameter "value" is required');
  }

  // Track what was inferred
  const inferred: {
    layer?: string;
    tags?: string[];
    scope?: string;
  } = {};

  // Infer layer from key prefix (if not provided)
  let inferredLayer = params.layer;
  if (!inferredLayer) {
    const keyLower = params.key.toLowerCase();

    if (keyLower.startsWith('api/') || keyLower.startsWith('endpoint/') || keyLower.startsWith('ui/')) {
      inferredLayer = 'presentation';
    } else if (keyLower.startsWith('service/') || keyLower.startsWith('logic/') || keyLower.startsWith('workflow/')) {
      inferredLayer = 'business';
    } else if (keyLower.startsWith('db/') || keyLower.startsWith('model/') || keyLower.startsWith('schema/')) {
      inferredLayer = 'data';
    } else if (keyLower.startsWith('config/') || keyLower.startsWith('deploy/')) {
      inferredLayer = 'infrastructure';
    } else {
      // Default layer
      inferredLayer = 'business';
    }
    inferred.layer = inferredLayer;
  }

  // Extract tags from key hierarchy (if not provided)
  let inferredTags = params.tags;
  if (!inferredTags || inferredTags.length === 0) {
    // Split key by '/', '-', or '_' to get hierarchy parts
    const parts = params.key.split(/[\/\-_]/).filter((p: string) => p.trim() !== '');
    inferredTags = parts;
    inferred.tags = inferredTags;
  }

  // Infer scope from key hierarchy (if not provided)
  let inferredScopes = params.scopes;
  if (!inferredScopes || inferredScopes.length === 0) {
    // Get parent scope from key (everything except last part)
    const parts = params.key.split('/');
    if (parts.length > 1) {
      // Take all but the last part
      const scopeParts = parts.slice(0, -1);
      const scope = scopeParts.join('/');
      inferredScopes = [scope];
      inferred.scope = scope;
    }
  }

  // Build full params for setDecision
  const fullParams: SetDecisionParams = {
    key: params.key,
    value: params.value,
    agent: params.agent,
    layer: inferredLayer,
    version: params.version || DEFAULT_VERSION,
    status: params.status || 'active',
    tags: inferredTags,
    scopes: inferredScopes
  };

  // Call setDecision with full params (pass adapter if provided)
  const result = await setDecision(fullParams, adapter);

  // Return response with inferred metadata
  return {
    success: result.success,
    key: result.key,
    key_id: result.key_id,
    version: result.version,
    inferred: inferred,
    message: `Decision "${params.key}" set successfully with smart defaults`
  };
}
