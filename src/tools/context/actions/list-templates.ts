/**
 * List all available decision templates (FR-006)
 * Returns all templates with their defaults and metadata
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter } from '../../../database.js';
import { getProjectContext } from '../../../utils/project-context.js';
import { validateActionParams } from '../internal/validation.js';
import type { ListTemplatesParams, ListTemplatesResponse } from '../types.js';

/**
 * List all available decision templates
 *
 * @param params - No parameters required
 * @param adapter - Optional database adapter (for testing)
 * @returns Array of all templates with parsed JSON fields
 */
export async function listTemplates(
  params: ListTemplatesParams = {},
  adapter?: DatabaseAdapter
): Promise<ListTemplatesResponse> {
  // Validate parameters
  validateActionParams('decision', 'list_templates', params);

  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  // Validate project context
  const projectId = getProjectContext().getProjectId();

  try {
    const rows = await knex('t_decision_templates as t')
      .leftJoin('m_agents as a', 't.created_by', 'a.id')
      .where('t.project_id', projectId)
      .select(
        't.id',
        't.name',
        't.defaults',
        't.required_fields',
        'a.name as created_by',
        knex.raw(`datetime(t.ts, 'unixepoch') as created_at`)
      )
      .orderBy('t.name', 'asc') as Array<{
        id: number;
        name: string;
        defaults: string;
        required_fields: string | null;
        created_by: string | null;
        created_at: string;
      }>;

    // Parse JSON fields
    const templates = rows.map(row => ({
      id: row.id,
      name: row.name,
      defaults: JSON.parse(row.defaults),
      required_fields: row.required_fields ? JSON.parse(row.required_fields) : null,
      created_by: row.created_by,
      created_at: row.created_at
    }));

    return {
      templates: templates,
      count: templates.length
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to list templates: ${message}`);
  }
}
