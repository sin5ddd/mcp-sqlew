/**
 * Create a new decision template (FR-006)
 * Defines reusable defaults and required fields for decisions
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter, getLayerId } from '../../../database.js';
import { getProjectContext } from '../../../utils/project-context.js';
import { STRING_TO_STATUS } from '../../../constants.js';
import connectionManager from '../../../utils/connection-manager.js';
import { validateActionParams } from '../internal/validation.js';
import type { CreateTemplateParams, CreateTemplateResponse } from '../types.js';

/**
 * Create a new decision template
 *
 * @param params - Template name, defaults, required fields, and creator
 * @param adapter - Optional database adapter (for testing)
 * @returns Response with success status and template ID
 */
export async function createTemplate(
  params: CreateTemplateParams,
  adapter?: DatabaseAdapter
): Promise<CreateTemplateResponse> {
  // Validate parameters
  validateActionParams('decision', 'create_template', params);

  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  // Validate project context (Constraint #29 - fail-fast before mutations)
  const projectId = getProjectContext().getProjectId();

  try {
    return await connectionManager.executeWithRetry(async () => {
      return await actualAdapter.transaction(async (trx) => {
        // Validate layer if provided in defaults
        if (params.defaults.layer) {
          const layerId = await getLayerId(actualAdapter, params.defaults.layer, trx);
          if (layerId === null) {
            throw new Error(`Invalid layer in defaults: ${params.defaults.layer}. Must be one of: presentation, business, data, infrastructure, cross-cutting`);
          }
        }

        // Validate status if provided in defaults
        if (params.defaults.status && !STRING_TO_STATUS[params.defaults.status]) {
          throw new Error(`Invalid status in defaults: ${params.defaults.status}. Must be 'active', 'deprecated', or 'draft'`);
        }

        // Note: Agent tracking removed in v4.0 (created_by param kept for API compatibility but not stored)

        // Serialize defaults and required fields
        const defaultsJson = JSON.stringify(params.defaults);
        const requiredFieldsJson = params.required_fields ? JSON.stringify(params.required_fields) : null;

        // Insert template (v3.9.0: t_decision_templates → v4_decision_policies)
        const [id] = await trx('v4_decision_policies').insert({
          name: params.name,
          project_id: projectId,
          defaults: defaultsJson,
          required_fields: requiredFieldsJson,
          ts: Math.floor(Date.now() / 1000)
        });

        return {
          success: true,
          template_id: id,
          template_name: params.name,
          message: `Template "${params.name}" created successfully`
        };
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to create template: ${message}`);
  }
}
