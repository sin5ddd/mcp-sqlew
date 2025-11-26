/**
 * Set From Policy Action - Decision Intelligence System v3.9.0
 *
 * Creates a decision from a policy template with defaults
 */

import type { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter } from '../../../database.js';
import { getProjectContext } from '../../../utils/project-context.js';
import { setDecision } from '../index.js';
import type { SetDecisionResponse } from '../types.js';

export interface SetFromPolicyParams {
  policy_name: string;
  key: string;
  value: string | number;
  // Optional overrides
  agent?: string;
  layer?: string;
  version?: string;
  status?: 'active' | 'deprecated' | 'draft';
  tags?: string[];
  scopes?: string[];
  // Policy context
  rationale?: string;
  alternatives?: any[];
  tradeoffs?: any;
}

/**
 * Create decision from policy template
 *
 * Applies policy defaults and validates against policy rules
 */
export async function setFromPolicy(
  params: SetFromPolicyParams,
  adapter?: DatabaseAdapter
): Promise<SetDecisionResponse> {
  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();
  const projectId = getProjectContext().getProjectId();

  try {
    // Fetch policy
    const policy = await knex('v4_decision_policies')
      .where({ name: params.policy_name, project_id: projectId })
      .select('id', 'name', 'defaults', 'required_fields')
      .first();

    if (!policy) {
      // Return error by throwing - will be caught and formatted properly
      throw new Error(`Policy "${params.policy_name}" not found`);
    }

    // Parse policy defaults
    const defaults = policy.defaults ? JSON.parse(policy.defaults) : {};

    // Merge with user params (user params override defaults)
    const mergedParams = {
      key: params.key,
      value: params.value,
      agent: params.agent,
      layer: params.layer || defaults.layer,
      version: params.version,
      status: params.status || defaults.status || 'active',
      tags: params.tags || defaults.tags || [],
      scopes: params.scopes,
      // Policy context
      rationale: params.rationale,
      alternatives: params.alternatives,
      tradeoffs: params.tradeoffs,
      policy_name: params.policy_name  // Explicit policy reference
    };

    // Call setDecision with merged params (will validate against policy)
    return await setDecision(mergedParams, actualAdapter);
  } catch (error) {
    // Re-throw error to be handled by caller
    throw error;
  }
}
