/**
 * Search for decisions within a specific architecture layer
 * Supports status filtering and optional tag inclusion
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter, getLayerId } from '../../../database.js';
import { getProjectContext } from '../../../utils/project-context.js';
import { debugLog } from '../../../utils/debug-logger.js';
import { STRING_TO_STATUS } from '../../../constants.js';
import { validateActionParams } from '../internal/validation.js';
import type { SearchByLayerParams, SearchByLayerResponse, TaggedDecision } from '../types.js';

/**
 * Search for decisions within a specific layer
 *
 * @param params - Layer name, optional status and include_tags
 * @param adapter - Optional database adapter (for testing)
 * @returns Array of decisions in the specified layer
 */
export async function searchByLayer(
  params: SearchByLayerParams,
  adapter?: DatabaseAdapter
): Promise<SearchByLayerResponse> {
  // Validate parameters
  try {
    validateActionParams('decision', 'search_layer', params);
  } catch (error) {
    throw error;
  }

  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  // Determine which project to query (current or referenced)
  let projectId: number;

  if (params._reference_project) {
    // Cross-project query: look up the referenced project
    const refProject = await knex('m_projects')
      .where({ name: params._reference_project })
      .first<{ id: number; name: string }>();

    if (!refProject) {
      throw new Error(`Referenced project "${params._reference_project}" not found`);
    }

    projectId = refProject.id;
    debugLog('INFO', 'Cross-project searchByLayer', {
      currentProject: getProjectContext().getProjectName(),
      referencedProject: params._reference_project,
      projectId
    });
  } else {
    // Normal query: use current project
    projectId = getProjectContext().getProjectId();
  }

  // Validate required parameter
  if (!params.layer || params.layer.trim() === '') {
    throw new Error('Parameter "layer" is required and cannot be empty');
  }

  try {
    // Validate layer exists
    const layerId = await getLayerId(actualAdapter, params.layer);
    if (layerId === null) {
      throw new Error(`Invalid layer: ${params.layer}. Must be one of: presentation, business, data, infrastructure, cross-cutting`);
    }

    // Determine which view/table to use
    const includeTagsValue = params.include_tags !== undefined ? params.include_tags : true;
    const statusValue = params.status || 'active';

    // Validate status
    if (!STRING_TO_STATUS[statusValue]) {
      throw new Error(`Invalid status: ${statusValue}. Must be 'active', 'deprecated', or 'draft'`);
    }

    let rows: TaggedDecision[];

    if (includeTagsValue) {
      // Use v_tagged_decisions view for full metadata
      rows = await knex('v_tagged_decisions')
        .where({ layer: params.layer, status: statusValue, project_id: projectId })
        .orderBy('updated', 'desc')
        .select('*') as TaggedDecision[];
    } else {
      // Use base t_decisions table with minimal joins
      const statusInt = STRING_TO_STATUS[statusValue];

      const stringDecisions = knex('t_decisions as d')
        .innerJoin('m_context_keys as ck', 'd.key_id', 'ck.id')
        .leftJoin('m_layers as l', 'd.layer_id', 'l.id')
        .leftJoin('m_agents as a', 'd.agent_id', 'a.id')
        .where('l.name', params.layer)
        .where('d.status', statusInt)
        .where('d.project_id', projectId)
        .select(
          'ck.key',
          'd.value',
          'd.version',
          knex.raw(`CASE d.status WHEN 1 THEN 'active' WHEN 2 THEN 'deprecated' WHEN 3 THEN 'draft' END as status`),
          'l.name as layer',
          knex.raw('NULL as tags'),
          knex.raw('NULL as scopes'),
          'a.name as decided_by',
          knex.raw(`datetime(d.ts, 'unixepoch') as updated`)
        );

      const numericDecisions = knex('t_decisions_numeric as dn')
        .innerJoin('m_context_keys as ck', 'dn.key_id', 'ck.id')
        .leftJoin('m_layers as l', 'dn.layer_id', 'l.id')
        .leftJoin('m_agents as a', 'dn.agent_id', 'a.id')
        .where('l.name', params.layer)
        .where('dn.status', statusInt)
        .where('dn.project_id', projectId)
        .select(
          'ck.key',
          knex.raw('CAST(dn.value AS TEXT) as value'),
          'dn.version',
          knex.raw(`CASE dn.status WHEN 1 THEN 'active' WHEN 2 THEN 'deprecated' WHEN 3 THEN 'draft' END as status`),
          'l.name as layer',
          knex.raw('NULL as tags'),
          knex.raw('NULL as scopes'),
          'a.name as decided_by',
          knex.raw(`datetime(dn.ts, 'unixepoch') as updated`)
        );

      // Union both queries
      rows = await stringDecisions.union([numericDecisions]).orderBy('updated', 'desc') as TaggedDecision[];
    }

    return {
      layer: params.layer,
      decisions: rows,
      count: rows.length
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to search by layer: ${message}`);
  }
}
