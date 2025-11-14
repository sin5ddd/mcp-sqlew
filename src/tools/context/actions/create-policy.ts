/**
 * Create Policy Action - Decision Intelligence System v3.9.0
 *
 * Creates a decision policy (evolved from templates) with validation rules
 * and auto-suggestion triggers.
 */

import type { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter } from '../../../database.js';
import { getProjectContext } from '../../../utils/project-context.js';

export interface CreatePolicyParams {
  name: string;
  defaults: {
    layer?: string;
    status?: string;
    tags?: string[];
    priority?: number;
  };
  validation_rules?: {
    patterns?: Record<string, string>;  // field_name → regex pattern
  };
  quality_gates?: {
    required_fields?: string[];  // Required metadata fields
  };
  required_fields?: string[];  // Legacy template compatibility
  suggest_similar?: boolean;  // Auto-trigger suggestions
  category?: string;  // Policy categorization
  created_by?: string;
}

export interface CreatePolicyResponse {
  success: boolean;
  id?: number;
  name?: string;
  message?: string;
  error?: string;
}

/**
 * Create a new decision policy
 */
export async function createPolicy(
  params: CreatePolicyParams,
  adapter?: DatabaseAdapter
): Promise<CreatePolicyResponse> {
  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();
  const projectId = getProjectContext().getProjectId();

  try {
    // Validate required fields
    if (!params.name || params.name.trim() === '') {
      return {
        success: false,
        error: 'Policy name is required'
      };
    }

    if (!params.defaults) {
      return {
        success: false,
        error: 'Policy defaults are required (layer, status, tags, or priority)'
      };
    }

    // Check if policy already exists for this project
    const existingPolicy = await knex('t_decision_policies')
      .where({ name: params.name, project_id: projectId })
      .first();

    if (existingPolicy) {
      return {
        success: false,
        error: `Policy "${params.name}" already exists for this project`
      };
    }

    // Get or create agent
    const agentName = params.created_by || 'system';
    const agentResult = await knex('m_agents')
      .where({ name: agentName })
      .select('id')
      .first();

    let agentId: number;
    if (agentResult) {
      agentId = agentResult.id;
    } else {
      const [insertedId] = await knex('m_agents').insert({
        name: agentName,
        last_active_ts: Math.floor(Date.now() / 1000)
      });
      agentId = insertedId;
    }

    // Prepare policy data
    const policyData = {
      name: params.name,
      defaults: JSON.stringify(params.defaults),
      validation_rules: params.validation_rules ? JSON.stringify(params.validation_rules) : null,
      quality_gates: params.quality_gates ? JSON.stringify(params.quality_gates) : null,
      required_fields: params.required_fields ? JSON.stringify(params.required_fields) : null,
      suggest_similar: params.suggest_similar ? 1 : 0,
      category: params.category || null,
      created_by: agentId,
      project_id: projectId,
      ts: Math.floor(Date.now() / 1000)
    };

    // Insert policy
    const [policyId] = await knex('t_decision_policies').insert(policyData);

    return {
      success: true,
      id: policyId,
      name: params.name,
      message: `Policy "${params.name}" created successfully`
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to create policy: ${message}`
    };
  }
}
