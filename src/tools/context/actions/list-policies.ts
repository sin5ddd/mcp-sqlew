/**
 * List Policies Action - Decision Intelligence System v3.9.0
 *
 * Lists all decision policies with optional filtering
 */

import type { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter } from '../../../database.js';
import { getProjectContext } from '../../../utils/project-context.js';

export interface ListPoliciesParams {
  category?: string;
  suggest_similar?: boolean;
}

export interface PolicySummary {
  id: number;
  name: string;
  category: string | null;
  suggest_similar: boolean;
  defaults: any;
  validation_rules: any;
  quality_gates: any;
  required_fields: any;
  created_by: string;
  created_ts: string;  // ISO 8601
}

export interface ListPoliciesResponse {
  policies: PolicySummary[];
  count: number;
}

/**
 * List all decision policies with optional filtering
 */
export async function listPolicies(
  params: ListPoliciesParams = {},
  adapter?: DatabaseAdapter
): Promise<ListPoliciesResponse> {
  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();
  const projectId = getProjectContext().getProjectId();

  try {
    // Build query
    let query = knex('t_decision_policies as p')
      .leftJoin('m_agents as a', 'p.created_by', 'a.id')
      .where('p.project_id', projectId);

    // Apply filters
    if (params.category) {
      query = query.where('p.category', params.category);
    }

    if (params.suggest_similar !== undefined) {
      query = query.where('p.suggest_similar', params.suggest_similar ? 1 : 0);
    }

    // Execute query
    const rows = await query.select(
      'p.id',
      'p.name',
      'p.category',
      'p.suggest_similar',
      'p.defaults',
      'p.validation_rules',
      'p.quality_gates',
      'p.required_fields',
      'a.name as created_by',
      'p.ts'
    ).orderBy('p.name');

    // Format results
    const policies: PolicySummary[] = rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      suggest_similar: row.suggest_similar === 1,
      defaults: row.defaults ? JSON.parse(row.defaults) : {},
      validation_rules: row.validation_rules ? JSON.parse(row.validation_rules) : null,
      quality_gates: row.quality_gates ? JSON.parse(row.quality_gates) : null,
      required_fields: row.required_fields ? JSON.parse(row.required_fields) : null,
      created_by: row.created_by || 'unknown',
      created_ts: new Date(row.ts * 1000).toISOString()
    }));

    return {
      policies,
      count: policies.length
    };
  } catch (error) {
    console.error('[List Policies] Error:', error);
    return {
      policies: [],
      count: 0
    };
  }
}
