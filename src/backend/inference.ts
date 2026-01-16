/**
 * Inference logic for quick_set → set transformation
 *
 * Extracted from tools/context/actions/quick-set.ts for use in
 * TransformingBackend when SaaS mode is active.
 *
 * @since v5.0.1
 */

/**
 * Inferred parameters from key analysis
 */
export interface InferredParams {
  layer?: string;
  tags?: string[];
  scope?: string;
}

/**
 * Result of parameter inference
 */
export interface InferenceResult {
  /** Transformed parameters ready for decision.set */
  transformedParams: Record<string, unknown>;
  /** What was inferred (for response metadata) */
  inferred: InferredParams;
}

/**
 * Infer decision parameters from key structure
 *
 * Inference Rules:
 * - Layer: Inferred from key prefix (api/ → presentation, db/ → data, etc.)
 * - Tags: Extracted from key hierarchy (split by /, -, _)
 * - Scope: Parent path of key (everything except last part)
 *
 * @param params - Quick set parameters (key and value required)
 * @returns Transformed params and inference metadata
 */
export function inferDecisionParams(params: Record<string, unknown>): InferenceResult {
  const key = params.key as string;
  const inferred: InferredParams = {};

  // Layer inference from key prefix
  let layer = params.layer as string | undefined;
  if (!layer) {
    const keyLower = key.toLowerCase();
    if (keyLower.startsWith('api/') || keyLower.startsWith('endpoint/') || keyLower.startsWith('ui/')) {
      layer = 'presentation';
    } else if (keyLower.startsWith('service/') || keyLower.startsWith('logic/') || keyLower.startsWith('workflow/')) {
      layer = 'business';
    } else if (keyLower.startsWith('db/') || keyLower.startsWith('model/') || keyLower.startsWith('schema/')) {
      layer = 'data';
    } else if (keyLower.startsWith('config/') || keyLower.startsWith('deploy/')) {
      layer = 'infrastructure';
    } else {
      layer = 'business'; // Default layer
    }
    inferred.layer = layer;
  }

  // Tags extraction from key hierarchy
  let tags = params.tags as string[] | undefined;
  if (!tags || tags.length === 0) {
    // Split key by '/', '-', or '_' to get hierarchy parts
    tags = key.split(/[\/\-_]/).filter((p: string) => p.trim() !== '');
    inferred.tags = tags;
  }

  // Scope inference from key hierarchy
  let scopes = params.scopes as string[] | undefined;
  if (!scopes || scopes.length === 0) {
    // Get parent scope from key (everything except last part)
    const parts = key.split('/');
    if (parts.length > 1) {
      const scope = parts.slice(0, -1).join('/');
      scopes = [scope];
      inferred.scope = scope;
    }
  }

  return {
    transformedParams: {
      key: params.key,
      value: params.value,
      agent: params.agent,
      layer,
      version: params.version || 'v1.0.0',
      status: params.status || 'active',
      tags,
      scopes,
    },
    inferred,
  };
}
