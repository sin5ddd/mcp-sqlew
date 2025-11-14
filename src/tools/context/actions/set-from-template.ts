/**
 * Set decision from template with defaults and required field validation (FR-006)
 * Applies template defaults while allowing overrides
 * Validates required fields if template specifies any
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter } from '../../../database.js';
import { getProjectContext } from '../../../utils/project-context.js';
import { validateActionParams } from '../internal/validation.js';
import { setDecision } from './set.js';
import type { SetFromTemplateParams, SetFromTemplateResponse, SetDecisionParams } from '../types.js';

/**
 * Set decision from template
 *
 * @param params - Template name, key, value, and optional overrides
 * @param adapter - Optional database adapter (for testing)
 * @returns Response with success status and applied defaults metadata
 */
export async function setFromTemplate(
  params: SetFromTemplateParams,
  adapter?: DatabaseAdapter
): Promise<SetFromTemplateResponse> {
  // Validate parameters
  validateActionParams('decision', 'set_from_template', params);

  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  // Validate project context
  const projectId = getProjectContext().getProjectId();

  try {
    // Get template (templates are project-scoped)
    // v3.9.0: t_decision_templates → t_decision_policies
    const templateRow = await knex('t_decision_policies')
      .where({ name: params.template, project_id: projectId })
      .first() as {
        id: number;
        name: string;
        defaults: string;
        required_fields: string | null;
      } | undefined;

    if (!templateRow) {
      throw new Error(`Template not found: ${params.template}`);
    }

    // Parse template defaults
    const defaults = JSON.parse(templateRow.defaults) as {
      layer?: string;
      status?: 'active' | 'deprecated' | 'draft';
      tags?: string[];
      priority?: 'low' | 'medium' | 'high' | 'critical';
    };

    // Parse required fields
    const requiredFields = templateRow.required_fields ? JSON.parse(templateRow.required_fields) as string[] : null;

    // Validate required fields if specified
    if (requiredFields && requiredFields.length > 0) {
      for (const field of requiredFields) {
        if (!(field in params) || (params as any)[field] === undefined || (params as any)[field] === null) {
          throw new Error(`Template "${params.template}" requires field: ${field}`);
        }
      }
    }

    // Build decision params with template defaults (overridable)
    const appliedDefaults: {
      layer?: string;
      tags?: string[];
      status?: string;
    } = {};

    const decisionParams: SetDecisionParams = {
      key: params.key,
      value: params.value,
      agent: params.agent,
      layer: params.layer || defaults.layer,
      version: params.version,
      status: params.status || defaults.status,
      tags: params.tags || defaults.tags,
      scopes: params.scopes
    };

    // Track what defaults were applied
    if (!params.layer && defaults.layer) {
      appliedDefaults.layer = defaults.layer;
    }
    if (!params.tags && defaults.tags) {
      appliedDefaults.tags = defaults.tags;
    }
    if (!params.status && defaults.status) {
      appliedDefaults.status = defaults.status;
    }

    // Call setDecision with merged params (pass adapter if provided)
    const result = await setDecision(decisionParams, actualAdapter);

    return {
      success: result.success,
      key: result.key,
      key_id: result.key_id,
      version: result.version,
      template_used: params.template,
      applied_defaults: appliedDefaults,
      message: `Decision "${params.key}" set successfully using template "${params.template}"`
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to set decision from template: ${message}`);
  }
}
