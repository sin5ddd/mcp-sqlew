/**
 * Context management tools for MCP Shared Context Server
 * Implements set_decision, get_context, and get_decision tools
 *
 * CONVERTED: Using Knex.js with DatabaseAdapter (async/await)
 */

import { DatabaseAdapter } from '../adapters/index.js';
import {
  getAdapter,
  getOrCreateAgent,
  getOrCreateContextKey,
  getOrCreateTag,
  getOrCreateScope,
  getLayerId,
  addDecisionContext as dbAddDecisionContext,
  getDecisionWithContext as dbGetDecisionWithContext,
  listDecisionContexts as dbListDecisionContexts
} from '../database.js';
import { getProjectContext } from '../utils/project-context.js';
import { STRING_TO_STATUS, STATUS_TO_STRING, DEFAULT_VERSION, DEFAULT_STATUS } from '../constants.js';
import { processBatch } from '../utils/batch.js';
import { validateRequired, validateStatus, validateLayer } from '../utils/validators.js';
import { buildWhereClause, type FilterCondition } from '../utils/query-builder.js';
import { logDecisionSet, logDecisionUpdate, recordDecisionHistory } from '../utils/activity-logging.js';
import { parseStringArray } from '../utils/param-parser.js';
import { validateActionParams, validateBatchParams } from '../utils/parameter-validator.js';
import { Knex } from 'knex';
import connectionManager from '../utils/connection-manager.js';
import {
  debugLog,
  debugLogFunctionEntry,
  debugLogFunctionExit,
  debugLogTransaction,
  debugLogQuery,
  debugLogValidation,
  debugLogJSON,
  debugLogCriticalError
} from '../utils/debug-logger.js';
import type {
  SetDecisionParams,
  GetContextParams,
  GetDecisionParams,
  SetDecisionResponse,
  GetContextResponse,
  GetDecisionResponse,
  TaggedDecision,
  Status,
  SearchByTagsParams,
  SearchByTagsResponse,
  GetVersionsParams,
  GetVersionsResponse,
  SearchByLayerParams,
  SearchByLayerResponse,
  QuickSetDecisionParams,
  QuickSetDecisionResponse,
  SearchAdvancedParams,
  SearchAdvancedResponse,
  SetDecisionBatchParams,
  SetDecisionBatchResponse,
  SetFromTemplateParams,
  SetFromTemplateResponse,
  CreateTemplateParams,
  CreateTemplateResponse,
  ListTemplatesParams,
  ListTemplatesResponse,
  HasUpdatesParams,
  HasUpdatesResponse,
  HardDeleteDecisionParams,
  HardDeleteDecisionResponse,
  DecisionAction
} from '../types.js';

/**
 * Internal helper: Set decision without wrapping in transaction
 * Used by setDecision (with transaction) and setDecisionBatch (manages its own transaction)
 *
 * @param params - Decision parameters
 * @param adapter - Database adapter instance
 * @param trx - Optional transaction
 * @returns Response with success status and metadata
 */
async function setDecisionInternal(
  params: SetDecisionParams,
  adapter: DatabaseAdapter,
  trx?: Knex.Transaction
): Promise<SetDecisionResponse> {
  const knex = trx || adapter.getKnex();

  // Validate project context (Constraint #29 - fail-fast before mutations)
  const projectId = getProjectContext().getProjectId();

  // Validate required parameters
  const trimmedKey = validateRequired(params.key, 'key');

  if (params.value === undefined || params.value === null) {
    throw new Error('Parameter "value" is required');
  }

  // Determine if value is numeric
  const isNumeric = typeof params.value === 'number';
  const value = params.value;

  // Set defaults
  const version = params.version || DEFAULT_VERSION;
  const status = params.status ? STRING_TO_STATUS[params.status] : DEFAULT_STATUS;
  const agentName = params.agent || 'system';

  // Validate status
  if (params.status) {
    validateStatus(params.status);
  }

  // Validate layer if provided
  let layerId: number | null = null;
  if (params.layer) {
    const validLayers = ['presentation', 'business', 'data', 'infrastructure', 'cross-cutting'];
    if (!validLayers.includes(params.layer)) {
      throw new Error(`Invalid layer. Must be one of: ${validLayers.join(', ')}`);
    }
    layerId = await getLayerId(adapter, params.layer, trx);
    if (layerId === null) {
      throw new Error(`Layer not found in database: ${params.layer}`);
    }
  }

  // Get or create master records
  const agentId = await getOrCreateAgent(adapter, agentName, trx);
  const keyId = await getOrCreateContextKey(adapter, params.key, trx);

  // Current timestamp
  const ts = Math.floor(Date.now() / 1000);

  // Check if decision already exists for activity logging
  const existingDecision = await knex(isNumeric ? 't_decisions_numeric' : 't_decisions')
    .where({ key_id: keyId, project_id: projectId })
    .first();

  // Insert or update decision based on value type
  const tableName = isNumeric ? 't_decisions_numeric' : 't_decisions';
  const decisionData = {
    key_id: keyId,
    project_id: projectId,
    value: isNumeric ? value : String(value),
    agent_id: agentId,
    layer_id: layerId,
    version: version,
    status: status,
    ts: ts
  };

  // Use transaction-aware upsert instead of adapter.upsert to avoid connection pool timeout
  const conflictColumns = ['key_id', 'project_id'];
  const updateColumns = Object.keys(decisionData).filter(
    key => !conflictColumns.includes(key)
  );
  const updateData = updateColumns.reduce((acc, col) => {
    acc[col] = decisionData[col as keyof typeof decisionData];
    return acc;
  }, {} as Record<string, any>);

  await knex(tableName)
    .insert(decisionData)
    .onConflict(conflictColumns)
    .merge(updateData);

  // Activity logging (replaces triggers)
  if (existingDecision) {
    // Update case - log update and record history
    await logDecisionUpdate(knex, {
      key: params.key,
      old_value: String(existingDecision.value),
      new_value: String(value),
      old_version: existingDecision.version,
      new_version: version,
      agent_id: agentId,
      layer_id: layerId || undefined
    });

    await recordDecisionHistory(knex, {
      key_id: keyId,
      version: existingDecision.version,
      value: String(existingDecision.value),
      agent_id: existingDecision.agent_id,
      ts: existingDecision.ts
    });
  } else {
    // New decision case - log set
    await logDecisionSet(knex, {
      key: params.key,
      value: String(value),
      version: version,
      status: status,
      agent_id: agentId,
      layer_id: layerId || undefined
    });
  }

  // Handle m_tags (many-to-many)
  if (params.tags && params.tags.length > 0) {
    // Parse tags (handles both arrays and JSON strings from MCP)
    const tags = parseStringArray(params.tags);

    // Clear existing tags for this project
    await knex('t_decision_tags')
      .where({ decision_key_id: keyId, project_id: projectId })
      .delete();

    // Insert new tags
    for (const tagName of tags) {
      const tagId = await getOrCreateTag(adapter, projectId, tagName, trx);  // v3.7.3: pass projectId
      await knex('t_decision_tags').insert({
        decision_key_id: keyId,
        tag_id: tagId,
        project_id: projectId
      });
    }
  }

  // Handle m_scopes (many-to-many)
  if (params.scopes && params.scopes.length > 0) {
    // Parse scopes (handles both arrays and JSON strings from MCP)
    const scopes = parseStringArray(params.scopes);

    // Clear existing scopes for this project
    await knex('t_decision_scopes')
      .where({ decision_key_id: keyId, project_id: projectId })
      .delete();

    // Insert new scopes
    for (const scopeName of scopes) {
      const scopeId = await getOrCreateScope(adapter, projectId, scopeName, trx);  // v3.7.3: pass projectId
      await knex('t_decision_scopes').insert({
        decision_key_id: keyId,
        scope_id: scopeId,
        project_id: projectId
      });
    }
  }

  return {
    success: true,
    key: params.key,
    key_id: keyId,
    version: version,
    message: `Decision "${params.key}" set successfully`
  };
}

/**
 * Set or update a decision in the context
 * Auto-detects numeric vs string values and routes to appropriate table
 * Supports tags, layers, scopes, and version tracking
 *
 * @param params - Decision parameters
 * @param adapter - Optional database adapter (for testing)
 * @returns Response with success status and metadata
 */
export async function setDecision(
  params: SetDecisionParams,
  adapter?: DatabaseAdapter
): Promise<SetDecisionResponse> {
  debugLogFunctionEntry('setDecision', params);

  // Validate parameters
  try {
    validateActionParams('decision', 'set', params);
  } catch (error) {
    throw error;
  }

  const actualAdapter = adapter ?? getAdapter();

  try {
    debugLogTransaction('START', 'setDecision');

    // Use transaction for atomicity with connection retry
    const result = await connectionManager.executeWithRetry(async () => {
      return await actualAdapter.transaction(async (trx) => {
        debugLogTransaction('COMMIT', 'setDecision-transaction-begin');
        const internalResult = await setDecisionInternal(params, actualAdapter, trx);
        debugLogTransaction('COMMIT', 'setDecision-transaction-end');
        return internalResult;
      });
    });

    debugLogFunctionExit('setDecision', true, result);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    debugLogCriticalError('setDecision', error, {
      function: 'setDecision',
      params
    });
    debugLogTransaction('ROLLBACK', 'setDecision');
    debugLogFunctionExit('setDecision', false, undefined, error);
    throw new Error(`Failed to set decision: ${message}`);
  }
}

/**
 * Get context t_decisions with advanced filtering
 * Uses v_tagged_decisions view for token efficiency
 * Supports filtering by status, layer, tags, and scope
 *
 * @param params - Filter parameters
 * @param adapter - Optional database adapter (for testing)
 * @returns Array of t_decisions with metadata
 */
export async function getContext(
  params: GetContextParams = {},
  adapter?: DatabaseAdapter
): Promise<GetContextResponse> {
  // Validate parameters
  try {
    validateActionParams('decision', 'list', params);
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
    debugLog('INFO', 'Cross-project query', {
      currentProject: getProjectContext().getProjectName(),
      referencedProject: params._reference_project,
      projectId
    });
  } else {
    // Normal query: use current project
    projectId = getProjectContext().getProjectId();
  }

  try {
    // Build query dynamically based on filters
    // NOTE: v_tagged_decisions view will be updated to include project_id filtering
    let query = knex('v_tagged_decisions').where('project_id', projectId);

    // Filter by status
    if (params.status) {
      if (!STRING_TO_STATUS[params.status]) {
        throw new Error(`Invalid status: ${params.status}`);
      }
      query = query.where('status', params.status);
    }

    // Filter by layer
    if (params.layer) {
      query = query.where('layer', params.layer);
    }

    // Filter by scope
    if (params.scope) {
      // Use LIKE for comma-separated scopes
      query = query.where('scopes', 'like', `%${params.scope}%`);
    }

    // Filter by tags
    if (params.tags && params.tags.length > 0) {
      const tagMatch = params.tag_match || 'OR';

      if (tagMatch === 'AND') {
        // All tags must be present
        for (const tag of params.tags) {
          query = query.where('tags', 'like', `%${tag}%`);
        }
      } else {
        // Any tag must be present (OR)
        query = query.where((builder) => {
          for (const tag of params.tags!) {
            builder.orWhere('tags', 'like', `%${tag}%`);
          }
        });
      }
    }

    // Order by most recent
    query = query.orderBy('updated', 'desc');

    // Execute query
    const rows = await query.select('*') as TaggedDecision[];

    return {
      decisions: rows,
      count: rows.length
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get context: ${message}`);
  }
}

/**
 * Get a specific decision by key
 * Returns full metadata including tags, layer, scopes, version
 * Optionally includes decision context (v3.2.2)
 *
 * @param params - Decision key and optional include_context flag
 * @param adapter - Optional database adapter (for testing)
 * @returns Decision details or not found
 */
export async function getDecision(
  params: GetDecisionParams & { include_context?: boolean },
  adapter?: DatabaseAdapter
): Promise<GetDecisionResponse> {
  // Validate parameters
  try {
    validateActionParams('decision', 'get', params);
  } catch (error) {
    throw error;
  }

  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  // Validate project context
  const projectId = getProjectContext().getProjectId();

  // Validate parameter
  if (!params.key || params.key.trim() === '') {
    throw new Error('Parameter "key" is required and cannot be empty');
  }

  try {
    // If include_context is true, use the context-aware function
    if (params.include_context) {
      // TODO: Update dbGetDecisionWithContext to accept projectId parameter
      const result = await dbGetDecisionWithContext(actualAdapter, params.key);

      if (!result) {
        return {
          found: false
        };
      }

      return {
        found: true,
        decision: {
          key: result.key,
          value: result.value,
          version: result.version,
          status: result.status as 'active' | 'deprecated' | 'draft',
          layer: result.layer,
          decided_by: result.decided_by,
          updated: result.updated,
          tags: null,  // Not included in getDecisionWithContext
          scopes: null  // Not included in getDecisionWithContext
        },
        context: result.context.map(ctx => ({
          ...ctx,
          // Parse JSON fields
          alternatives_considered: ctx.alternatives_considered ? JSON.parse(ctx.alternatives_considered) : null,
          tradeoffs: ctx.tradeoffs ? JSON.parse(ctx.tradeoffs) : null
        }))
      };
    }

    // Standard query without context (backward compatible)
    const row = await knex('v_tagged_decisions')
      .where({ key: params.key, project_id: projectId })
      .first() as TaggedDecision | undefined;

    if (!row) {
      return {
        found: false
      };
    }

    return {
      found: true,
      decision: row
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get decision: ${message}`);
  }
}

/**
 * Search for t_decisions by m_tags with AND/OR logic
 * Provides flexible tag-based filtering with status and layer support
 *
 * @param params - Search parameters (tags, match_mode, status, layer)
 * @param adapter - Optional database adapter (for testing)
 * @returns Array of t_decisions matching tag criteria
 */
export async function searchByTags(
  params: SearchByTagsParams,
  adapter?: DatabaseAdapter
): Promise<SearchByTagsResponse> {
  // Validate parameters
  try {
    validateActionParams('decision', 'search_tags', params);
  } catch (error) {
    throw error;
  }

  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  // Validate project context
  const projectId = getProjectContext().getProjectId();

  // Validate required parameters
  if (!params.tags || params.tags.length === 0) {
    throw new Error('Parameter "tags" is required and must contain at least one tag');
  }

  try {
    // Parse tags (handles both arrays and JSON strings from MCP)
    const tags = parseStringArray(params.tags);

    const matchMode = params.match_mode || 'OR';
    let query = knex('v_tagged_decisions').where('project_id', projectId);

    // Apply tag filtering based on match mode
    if (matchMode === 'AND') {
      // All tags must be present
      for (const tag of tags) {
        query = query.where('tags', 'like', `%${tag}%`);
      }
    } else if (matchMode === 'OR') {
      // Any tag must be present
      query = query.where((builder) => {
        for (const tag of tags) {
          builder.orWhere('tags', 'like', `%${tag}%`);
        }
      });
    } else {
      throw new Error(`Invalid match_mode: ${matchMode}. Must be 'AND' or 'OR'`);
    }

    // Optional status filter
    if (params.status) {
      if (!STRING_TO_STATUS[params.status]) {
        throw new Error(`Invalid status: ${params.status}. Must be 'active', 'deprecated', or 'draft'`);
      }
      query = query.where('status', params.status);
    }

    // Optional layer filter
    if (params.layer) {
      // Validate layer exists
      const layerId = await getLayerId(actualAdapter, params.layer);
      if (layerId === null) {
        throw new Error(`Invalid layer: ${params.layer}. Must be one of: presentation, business, data, infrastructure, cross-cutting`);
      }
      query = query.where('layer', params.layer);
    }

    // Order by most recent
    query = query.orderBy('updated', 'desc');

    // Execute query
    const rows = await query.select('*') as TaggedDecision[];

    return {
      decisions: rows,
      count: rows.length
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to search by tags: ${message}`);
  }
}

/**
 * Get version history for a specific decision key
 * Returns all historical versions ordered by timestamp (newest first)
 *
 * @param params - Decision key to get history for
 * @param adapter - Optional database adapter (for testing)
 * @returns Array of historical versions with metadata
 */
export async function getVersions(
  params: GetVersionsParams,
  adapter?: DatabaseAdapter
): Promise<GetVersionsResponse> {
  // Validate parameters
  try {
    validateActionParams('decision', 'versions', params);
  } catch (error) {
    throw error;
  }

  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  // Validate project context
  const projectId = getProjectContext().getProjectId();

  // Validate required parameter
  if (!params.key || params.key.trim() === '') {
    throw new Error('Parameter "key" is required and cannot be empty');
  }

  try {
    // Get key_id for the decision
    const keyResult = await knex('m_context_keys')
      .where({ key: params.key })
      .first('id') as { id: number } | undefined;

    if (!keyResult) {
      // Key doesn't exist, return empty history
      return {
        key: params.key,
        history: [],
        count: 0
      };
    }

    const keyId = keyResult.id;

    // Query t_decision_history with agent join
    const rows = await knex('t_decision_history as dh')
      .leftJoin('m_agents as a', 'dh.agent_id', 'a.id')
      .where({ 'dh.key_id': keyId, 'dh.project_id': projectId })
      .select(
        'dh.version',
        'dh.value',
        'a.name as agent_name',
        knex.raw(`datetime(dh.ts, 'unixepoch') as timestamp`)
      )
      .orderBy('dh.ts', 'desc') as Array<{
        version: string;
        value: string;
        agent_name: string | null;
        timestamp: string;
      }>;

    // Transform to response format
    const history = rows.map(row => ({
      version: row.version,
      value: row.value,
      agent: row.agent_name,
      timestamp: row.timestamp
    }));

    return {
      key: params.key,
      history: history,
      count: history.length
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get versions: ${message}`);
  }
}

/**
 * Search for t_decisions within a specific architecture layer
 * Supports status filtering and optional tag inclusion
 *
 * @param params - Layer name, optional status and include_tags
 * @param adapter - Optional database adapter (for testing)
 * @returns Array of t_decisions in the specified layer
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

/**
 * Quick set decision with smart defaults and inference
 * Reduces required parameters from 7 to 2 (key + value only)
 *
 * Inference Rules:
 * - Layer: Inferred from key prefix
 *   - api/*, endpoint/*, ui/* → "presentation"
 *   - service/*, logic/*, workflow/* → "business"
 *   - db/*, model/*, schema/* → "data"
 *   - config/*, deploy/* → "infrastructure"
 *   - Default → "business"
 *
 * - Tags: Extracted from key hierarchy
 *   - Key "api/instruments/synthesis" → tags: ["api", "instruments", "synthesis"]
 *
 * - Scope: Inferred from key hierarchy
 *   - Key "api/instruments/synthesis" → scope: "api/instruments"
 *
 * - Auto-defaults:
 *   - status: "active"
 *   - version: "1.0.0"
 *
 * All inferred fields can be overridden via optional parameters.
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
    const parts = params.key.split(/[\/\-_]/).filter(p => p.trim() !== '');
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
    agent: params.agent, // May be undefined, setDecision will default to 'system'
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

/**
 * Advanced query composition with complex filtering capabilities
 * Supports multiple filter types, sorting, and pagination
 *
 * Filter Logic:
 * - layers: OR relationship - match any layer in the array
 * - tags_all: AND relationship - must have ALL tags
 * - tags_any: OR relationship - must have ANY tag
 * - exclude_tags: Exclude decisions with these tags
 * - scopes: Wildcard support (e.g., "api/instruments/*")
 * - updated_after/before: Temporal filtering (ISO timestamp or relative like "7d")
 * - decided_by: Filter by agent names (OR relationship)
 * - statuses: Multiple statuses (OR relationship)
 * - search_text: Full-text search in value field
 *
 * @param params - Advanced search parameters with filtering, sorting, pagination
 * @param adapter - Optional database adapter (for testing)
 * @returns Filtered decisions with total count for pagination
 */
export async function searchAdvanced(
  params: SearchAdvancedParams = {},
  adapter?: DatabaseAdapter
): Promise<SearchAdvancedResponse> {
  // Validate parameters
  validateActionParams('decision', 'search_advanced', params);

  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  // Validate project context
  const projectId = getProjectContext().getProjectId();

  try {
    // Parse relative time to Unix timestamp
    const parseRelativeTime = (relativeTime: string): number | null => {
      const match = relativeTime.match(/^(\d+)(m|h|d)$/);
      if (!match) {
        // Try parsing as ISO timestamp
        const date = new Date(relativeTime);
        if (isNaN(date.getTime())) {
          return null;
        }
        return Math.floor(date.getTime() / 1000);
      }

      const value = parseInt(match[1], 10);
      const unit = match[2];
      const now = Math.floor(Date.now() / 1000);

      switch (unit) {
        case 'm': return now - (value * 60);
        case 'h': return now - (value * 3600);
        case 'd': return now - (value * 86400);
        default: return null;
      }
    };

    // Build base query using v_tagged_decisions view
    let query = knex('v_tagged_decisions').where('project_id', projectId);

    // Filter by layers (OR relationship)
    if (params.layers && params.layers.length > 0) {
      query = query.whereIn('layer', params.layers);
    }

    // Filter by tags_all (AND relationship - must have ALL tags)
    if (params.tags_all && params.tags_all.length > 0) {
      // Parse tags (handles both arrays and JSON strings from MCP)
      const tagsAll = parseStringArray(params.tags_all);
      for (const tag of tagsAll) {
        query = query.where((builder) => {
          builder.where('tags', 'like', `%${tag}%`).orWhere('tags', tag);
        });
      }
    }

    // Filter by tags_any (OR relationship - must have ANY tag)
    if (params.tags_any && params.tags_any.length > 0) {
      // Parse tags (handles both arrays and JSON strings from MCP)
      const tagsAny = parseStringArray(params.tags_any);
      query = query.where((builder) => {
        for (const tag of tagsAny) {
          builder.orWhere('tags', 'like', `%${tag}%`).orWhere('tags', tag);
        }
      });
    }

    // Exclude tags
    if (params.exclude_tags && params.exclude_tags.length > 0) {
      // Parse tags (handles both arrays and JSON strings from MCP)
      const excludeTags = parseStringArray(params.exclude_tags);
      for (const tag of excludeTags) {
        query = query.where((builder) => {
          builder.whereNull('tags')
            .orWhere((subBuilder) => {
              subBuilder.where('tags', 'not like', `%${tag}%`)
                .where('tags', '!=', tag);
            });
        });
      }
    }

    // Filter by scopes with wildcard support
    if (params.scopes && params.scopes.length > 0) {
      // Parse scopes (handles both arrays and JSON strings from MCP)
      const scopes = parseStringArray(params.scopes);
      query = query.where((builder) => {
        for (const scope of scopes) {
          if (scope.includes('*')) {
            // Wildcard pattern - convert to LIKE pattern
            const likePattern = scope.replace(/\*/g, '%');
            builder.orWhere('scopes', 'like', `%${likePattern}%`)
              .orWhere('scopes', likePattern);
          } else {
            // Exact match
            builder.orWhere('scopes', 'like', `%${scope}%`)
              .orWhere('scopes', scope);
          }
        }
      });
    }

    // Temporal filtering - updated_after
    if (params.updated_after) {
      const timestamp = parseRelativeTime(params.updated_after);
      if (timestamp !== null) {
        query = query.whereRaw('unixepoch(updated) >= ?', [timestamp]);
      } else {
        throw new Error(`Invalid updated_after format: ${params.updated_after}. Use ISO timestamp or relative time like "7d", "2h", "30m"`);
      }
    }

    // Temporal filtering - updated_before
    if (params.updated_before) {
      const timestamp = parseRelativeTime(params.updated_before);
      if (timestamp !== null) {
        query = query.whereRaw('unixepoch(updated) <= ?', [timestamp]);
      } else {
        throw new Error(`Invalid updated_before format: ${params.updated_before}. Use ISO timestamp or relative time like "7d", "2h", "30m"`);
      }
    }

    // Filter by decided_by (OR relationship)
    if (params.decided_by && params.decided_by.length > 0) {
      query = query.whereIn('decided_by', params.decided_by);
    }

    // Filter by statuses (OR relationship)
    if (params.statuses && params.statuses.length > 0) {
      query = query.whereIn('status', params.statuses);
    }

    // Full-text search in value field
    if (params.search_text) {
      query = query.where('value', 'like', `%${params.search_text}%`);
    }

    // Count total matching records (before pagination)
    const countQuery = query.clone().count('* as total');
    const countResult = await countQuery.first() as { total: number };
    const totalCount = countResult.total;

    // Sorting
    const sortBy = params.sort_by || 'updated';
    const sortOrder = params.sort_order || 'desc';

    // Validate sort parameters
    if (!['updated', 'key', 'version'].includes(sortBy)) {
      throw new Error(`Invalid sort_by: ${sortBy}. Must be 'updated', 'key', or 'version'`);
    }
    if (!['asc', 'desc'].includes(sortOrder)) {
      throw new Error(`Invalid sort_order: ${sortOrder}. Must be 'asc' or 'desc'`);
    }

    query = query.orderBy(sortBy, sortOrder);

    // Pagination
    const limit = params.limit !== undefined ? params.limit : 20;
    const offset = params.offset || 0;

    // Validate pagination parameters
    if (limit < 0 || limit > 1000) {
      throw new Error('Parameter "limit" must be between 0 and 1000');
    }
    if (offset < 0) {
      throw new Error('Parameter "offset" must be non-negative');
    }

    query = query.limit(limit).offset(offset);

    // Execute query
    const rows = await query.select('*') as TaggedDecision[];

    return {
      decisions: rows,
      count: rows.length,
      total_count: totalCount
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to execute advanced search: ${message}`);
  }
}

/**
 * Set multiple decisions in a single batch operation (FR-005)
 * Supports atomic (all succeed or all fail) and non-atomic modes
 * Limit: 50 items per batch (constraint #3)
 *
 * @param params - Batch parameters with array of decisions and atomic flag
 * @param adapter - Optional database adapter (for testing)
 * @returns Response with success status and detailed results for each item
 */
export async function setDecisionBatch(
  params: SetDecisionBatchParams,
  adapter?: DatabaseAdapter
): Promise<SetDecisionBatchResponse> {
  // Validate batch parameters
  validateBatchParams('decision', 'decisions', params.decisions, 'set', 50);

  const actualAdapter = adapter ?? getAdapter();

  if (params.decisions.length === 0) {
    return {
      success: true,
      inserted: 0,
      failed: 0,
      results: []
    };
  }

  if (params.decisions.length > 50) {
    throw new Error('Parameter "decisions" must contain at most 50 items');
  }

  const atomic = params.atomic !== undefined ? params.atomic : true;

  try {
    if (atomic) {
      // Atomic mode: All or nothing
      const results = await connectionManager.executeWithRetry(async () => {
        return await actualAdapter.transaction(async (trx) => {
          const processedResults = [];

        for (const decision of params.decisions) {
          try {
            const result = await setDecisionInternal(decision, actualAdapter, trx);
            processedResults.push({
              key: decision.key,
              key_id: result.key_id,
              version: result.version,
              success: true,
              error: undefined
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Batch failed at decision "${decision.key}": ${message}`);
          }
        }

          return processedResults;
        });
      });

      return {
        success: true,
        inserted: results.length,
        failed: 0,
        results: results
      };
    } else {
      // Non-atomic mode: Process each independently
      const results = [];
      let inserted = 0;
      let failed = 0;

      for (const decision of params.decisions) {
        try {
          const result = await connectionManager.executeWithRetry(async () => {
            return await actualAdapter.transaction(async (trx) => {
              return await setDecisionInternal(decision, actualAdapter, trx);
            });
          });

          results.push({
            key: decision.key,
            key_id: result.key_id,
            version: result.version,
            success: true,
            error: undefined
          });
          inserted++;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          results.push({
            key: decision.key,
            key_id: undefined,
            version: undefined,
            success: false,
            error: message
          });
          failed++;
        }
      }

      return {
        success: failed === 0,
        inserted: inserted,
        failed: failed,
        results: results
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to execute batch operation: ${message}`);
  }
}

/**
 * Check for updates since a given timestamp (FR-003 Phase A)
 * Lightweight polling mechanism using COUNT queries
 * Token cost: ~5-10 tokens per check
 *
 * @param params - Agent name and since_timestamp (ISO 8601)
 * @param adapter - Optional database adapter (for testing)
 * @returns Boolean flag and counts for decisions, messages, files
 */
export async function hasUpdates(
  params: HasUpdatesParams,
  adapter?: DatabaseAdapter
): Promise<HasUpdatesResponse> {
  // Validate parameters
  validateActionParams('decision', 'has_updates', params);

  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  // Validate project context
  const projectId = getProjectContext().getProjectId();

  try {
    // Parse ISO timestamp to Unix epoch
    const sinceDate = new Date(params.since_timestamp);
    if (isNaN(sinceDate.getTime())) {
      throw new Error(`Invalid since_timestamp format: ${params.since_timestamp}. Use ISO 8601 format (e.g., "2025-10-14T08:00:00Z")`);
    }
    const sinceTs = Math.floor(sinceDate.getTime() / 1000);

    // Count decisions updated since timestamp (both string and numeric tables)
    const decisionCount1 = await knex('t_decisions')
      .where({ project_id: projectId })
      .where('ts', '>', sinceTs)
      .count('* as count')
      .first() as { count: number };

    const decisionCount2 = await knex('t_decisions_numeric')
      .where({ project_id: projectId })
      .where('ts', '>', sinceTs)
      .count('* as count')
      .first() as { count: number };

    const decisionsCount = (decisionCount1?.count || 0) + (decisionCount2?.count || 0);

    // Get agent_id for the requesting agent
    const agentResult = await knex('m_agents')
      .where({ name: params.agent_name })
      .first('id') as { id: number } | undefined;

    // Count messages for the agent (received messages - to_agent_id matches OR broadcast messages)
    let messagesCount = 0;
    if (agentResult) {
      const agentId = agentResult.id;
      const messageResult = await knex('t_agent_messages')
        .where('ts', '>', sinceTs)
        .where((builder) => {
          builder.where('to_agent_id', agentId)
            .orWhereNull('to_agent_id');
        })
        .count('* as count')
        .first() as { count: number };
      messagesCount = messageResult?.count || 0;
    }

    // Count file changes since timestamp (project-scoped)
    const fileResult = await knex('t_file_changes')
      .where({ project_id: projectId })
      .where('ts', '>', sinceTs)
      .count('* as count')
      .first() as { count: number };
    const filesCount = fileResult?.count || 0;

    // Determine if there are any updates
    const hasUpdatesFlag = decisionsCount > 0 || messagesCount > 0 || filesCount > 0;

    return {
      has_updates: hasUpdatesFlag,
      counts: {
        decisions: decisionsCount,
        messages: messagesCount,
        files: filesCount
      }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to check for updates: ${message}`);
  }
}

/**
 * Set decision from template with defaults and required field validation (FR-006)
 * Applies template defaults while allowing overrides
 * Validates required fields if template specifies any
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
    const templateRow = await knex('t_decision_templates')
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

/**
 * Create a new decision template (FR-006)
 * Defines reusable defaults and required fields for decisions
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

      // Get or create agent if creator specified
      let createdById: number | null = null;
      if (params.created_by) {
        createdById = await getOrCreateAgent(actualAdapter, params.created_by, trx);
      }

      // Serialize defaults and required fields
      const defaultsJson = JSON.stringify(params.defaults);
      const requiredFieldsJson = params.required_fields ? JSON.stringify(params.required_fields) : null;

      // Insert template
      const [id] = await trx('t_decision_templates').insert({
        name: params.name,
        project_id: projectId,
        defaults: defaultsJson,
        required_fields: requiredFieldsJson,
        created_by: createdById
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

/**
 * List all available decision templates (FR-006)
 * Returns all templates with their defaults and metadata
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

/**
 * Permanently delete a decision and all related data (hard delete)
 * Unlike soft delete (status=deprecated), this removes all records from database
 *
 * Use cases:
 * - Manual cleanup after decision-to-task migration
 * - Remove test/debug decisions that are no longer needed
 * - Purge sensitive data that should not be retained
 *
 * WARNING: This operation is irreversible. Version history and all relationships
 * (tags, scopes) will also be deleted due to CASCADE constraints.
 *
 * @param params - Decision key to delete
 * @param adapter - Optional database adapter (for testing)
 * @returns Response with success status
 */
export async function hardDeleteDecision(
  params: HardDeleteDecisionParams,
  adapter?: DatabaseAdapter
): Promise<HardDeleteDecisionResponse> {
  // Validate parameters
  validateActionParams('decision', 'hard_delete', params);

  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  // Validate project context (fail-fast)
  const projectId = getProjectContext().getProjectId();

  try {
    return await connectionManager.executeWithRetry(async () => {
      return await actualAdapter.transaction(async (trx) => {
        // Get key_id
        const keyResult = await trx('m_context_keys')
          .where({ key: params.key })
          .first('id') as { id: number } | undefined;

        if (!keyResult) {
          // Key doesn't exist - still return success (idempotent)
          return {
            success: true,
            key: params.key,
            message: `Decision "${params.key}" not found (already deleted or never existed)`
          };
        }

      const keyId = keyResult.id;

      // SECURITY: All deletes MUST filter by project_id to prevent cross-project deletion
      // Delete from t_decisions (if exists in this project)
      const deletedString = await trx('t_decisions')
        .where({ key_id: keyId, project_id: projectId })
        .delete();

      // Delete from t_decisions_numeric (if exists in this project)
      const deletedNumeric = await trx('t_decisions_numeric')
        .where({ key_id: keyId, project_id: projectId })
        .delete();

      // Delete from t_decision_history (for this project only)
      const deletedHistory = await trx('t_decision_history')
        .where({ key_id: keyId, project_id: projectId })
        .delete();

      // Delete from t_decision_tags (for this project only)
      const deletedTags = await trx('t_decision_tags')
        .where({ decision_key_id: keyId, project_id: projectId })
        .delete();

      // Delete from t_decision_scopes (for this project only)
      const deletedScopes = await trx('t_decision_scopes')
        .where({ decision_key_id: keyId, project_id: projectId })
        .delete();

      // Calculate total deleted records
      const totalDeleted = deletedString + deletedNumeric + deletedHistory + deletedTags + deletedScopes;

      if (totalDeleted === 0) {
        return {
          success: true,
          key: params.key,
          message: `Decision "${params.key}" not found (already deleted or never existed)`
        };
      }

        return {
          success: true,
          key: params.key,
          message: `Decision "${params.key}" permanently deleted (${totalDeleted} record${totalDeleted === 1 ? '' : 's'})`
        };
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to hard delete decision: ${message}`);
  }
}

// ============================================================================
// Decision Context Actions (v3.2.2)
// ============================================================================

/**
 * Add decision context action
 * Adds rich context (rationale, alternatives, tradeoffs) to a decision
 *
 * @param params - Context parameters
 * @param adapter - Optional database adapter (for testing)
 * @returns Response with success status
 */
export async function addDecisionContextAction(
  params: any,
  adapter?: DatabaseAdapter
): Promise<any> {
  // Validate parameters
  validateActionParams('decision', 'add_decision_context', params);

  const actualAdapter = adapter ?? getAdapter();

  try {
    // Parse JSON if provided as strings
    let alternatives = params.alternatives_considered || null;
    let tradeoffs = params.tradeoffs || null;

    // Convert to JSON strings
    if (alternatives !== null) {
      if (typeof alternatives === 'object') {
        alternatives = JSON.stringify(alternatives);
      } else if (typeof alternatives === 'string') {
        try {
          JSON.parse(alternatives);
        } catch {
          alternatives = JSON.stringify([alternatives]);
        }
      }
    }

    if (tradeoffs !== null) {
      if (typeof tradeoffs === 'object') {
        tradeoffs = JSON.stringify(tradeoffs);
      } else if (typeof tradeoffs === 'string') {
        try {
          JSON.parse(tradeoffs);
        } catch {
          tradeoffs = JSON.stringify({ description: tradeoffs });
        }
      }
    }

    const contextId = await dbAddDecisionContext(
      actualAdapter,
      params.key,
      params.rationale,
      alternatives,
      tradeoffs,
      params.decided_by || null,
      params.related_task_id || null,
      params.related_constraint_id || null
    );

    return {
      success: true,
      context_id: contextId,
      decision_key: params.key,
      message: `Decision context added successfully to "${params.key}"`
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to add decision context: ${message}`);
  }
}

/**
 * List decision contexts action
 * Query decision contexts with optional filters
 *
 * @param params - Filter parameters
 * @param adapter - Optional database adapter (for testing)
 * @returns Array of decision contexts
 */
export async function listDecisionContextsAction(
  params: any,
  adapter?: DatabaseAdapter
): Promise<any> {
  // Validate parameters
  validateActionParams('decision', 'list_decision_contexts', params);

  const actualAdapter = adapter ?? getAdapter();

  try {
    const contexts = await dbListDecisionContexts(actualAdapter, {
      decisionKey: params.decision_key,
      relatedTaskId: params.related_task_id,
      relatedConstraintId: params.related_constraint_id,
      decidedBy: params.decided_by,
      limit: params.limit || 50,
      offset: params.offset || 0
    });

    return {
      success: true,
      contexts: contexts.map(ctx => ({
        ...ctx,
        // Parse JSON fields for display
        alternatives_considered: ctx.alternatives_considered ? JSON.parse(ctx.alternatives_considered) : null,
        tradeoffs: ctx.tradeoffs ? JSON.parse(ctx.tradeoffs) : null
      })),
      count: contexts.length
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to list decision contexts: ${message}`);
  }
}

/**
 * Help action for decision tool
 */
export function decisionHelp(): any {
  return {
    tool: 'decision',
    description: 'Manage decisions with metadata (tags, layers, versions, scopes)',
    note: '💡 TIP: Use action: "example" to see comprehensive usage scenarios and real-world examples for all decision actions.',
    purpose: {
      title: '⚠️ CRITICAL: Store WHY and REASON, Not WHAT',
      principle: 'Decisions table is for ARCHITECTURAL CONTEXT and REASONING, NOT implementation logs or task completion status',
      what_to_store: {
        correct: [
          'WHY a design choice was made (e.g., "Chose JWT over sessions because stateless auth scales better for our microservice architecture")',
          'REASONING behind architecture decisions (e.g., "Moved oscillator_type to MonophonicSynthConfig to separate synthesis methods - FM operators use different config")',
          'PROBLEM ANALYSIS and solution rationale (e.g., "Nested transaction bug: setDecision wraps in transaction, batch also wraps → solution: extract internal helper without transaction wrapper")',
          'DESIGN TRADE-OFFS and alternatives considered (e.g., "Query builder limited to simple filters, kept domain-specific logic inline for maintainability")',
          'CONSTRAINTS and requirements reasoning (e.g., "API response must be <100ms because mobile clients timeout at 200ms")',
          'BREAKING CHANGES with migration rationale (e.g., "Removed /v1/users endpoint - clients must use /v2/users with pagination for scalability")'
        ],
        incorrect: [
          '❌ Task completion logs (e.g., "Task 5 completed", "Refactoring done", "Tests passing") → Use tasks tool instead',
          '❌ Implementation status (e.g., "Added validators.ts", "Fixed bug in batch_create", "Updated README") → These are WHAT, not WHY',
          '❌ Test results (e.g., "All tests passing", "Integration tests complete", "v3.0.2 testing verified") → Temporary status, not architectural context',
          '❌ Git commit summaries (e.g., "Released v3.0.2", "Created git commit 2bf55a0") → Belongs in git history',
          '❌ Documentation updates (e.g., "README reorganized", "Help actions enhanced") → Implementation logs, not decisions',
          '❌ Build status (e.g., "Build succeeded", "TypeScript compiled with zero errors") → Temporary status'
        ]
      },
      analogy: {
        git_history: 'WHAT changed (files, lines, commits)',
        code_comments: 'HOW it works (implementation details, algorithms)',
        sqlew_decisions: 'WHY it was changed (reasoning, trade-offs, context)',
        sqlew_tasks: 'WHAT needs to be done (work items, status, completion)'
      },
      examples: [
        {
          key: 'api/auth/jwt-choice',
          value: 'Chose JWT over session-based auth because: (1) Stateless design scales horizontally, (2) Mobile clients can cache tokens, (3) Microservice architecture requires distributed auth. Trade-off: Revocation requires token blacklist, but acceptable for 15-min token lifetime.',
          explanation: 'Explains WHY JWT was chosen, considers trade-offs, provides architectural context'
        },
        {
          key: 'database/postgresql-choice',
          value: 'Selected PostgreSQL over MongoDB because: (1) Complex relational queries required for reporting, (2) ACID compliance critical for financial data, (3) Team has strong SQL expertise. Trade-off: Less flexible schema, but data integrity more important than schema flexibility for our use case.',
          explanation: 'Documents database choice with reasoning, alternatives considered, and trade-offs'
        },
        {
          key: 'security/encryption-at-rest',
          value: 'Implementing AES-256 encryption for all PII in database because: (1) GDPR compliance requires encryption at rest, (2) Recent security audit identified unencrypted sensitive data, (3) Performance impact <5ms per query acceptable. Alternative considered: Database-level encryption rejected due to backup/restore complexity.',
          explanation: 'Explains security decision with compliance reasoning and performance considerations'
        }
      ],
      cleanup_rule: 'Delete decisions that start with "COMPLETED:", contain task status, test results, or implementation logs. Keep only architectural reasoning and design rationale.'
    },
    actions: {
      set: 'Set/update a decision. Params: key (required), value (required), agent, layer, version, status, tags, scopes',
      get: 'Get specific decision by key. Params: key (required), include_context (optional, boolean, default: false). When include_context=true, returns decision with attached context (rationale, alternatives, tradeoffs). Backward compatible - omitting flag returns standard decision format.',
      list: 'List/filter decisions. Params: status, layer, tags, scope, tag_match',
      search_tags: 'Search decisions by tags. Params: tags (required), match_mode, status, layer',
      search_layer: 'Search decisions by layer. Params: layer (required), status, include_tags',
      versions: 'Get version history for a decision. Params: key (required)',
      quick_set: 'Quick set with smart defaults (FR-002). Params: key (required), value (required), agent, layer, version, status, tags, scopes. Auto-infers layer from key prefix (api/*→presentation, db/*→data, service/*→business, config/*→infrastructure), tags from key hierarchy, scope from parent path. Defaults: status=active, version=1.0.0. All inferred fields can be overridden.',
      search_advanced: 'Advanced query with complex filtering (FR-004). Params: layers (OR), tags_all (AND), tags_any (OR), exclude_tags, scopes (wildcards), updated_after/before (ISO or relative like "7d"), decided_by, statuses, search_text, sort_by (updated/key/version), sort_order (asc/desc), limit (default:20, max:1000), offset (default:0). Returns decisions with total_count for pagination. All filters use parameterized queries (SQL injection protection).',
      set_batch: 'Batch set decisions (FR-005). Params: decisions (required, array of SetDecisionParams, max: 50), atomic (optional, boolean, default: true). Returns: {success, inserted, failed, results}. ATOMIC MODE BEHAVIOR (atomic: true): All decisions succeed or all fail as a single transaction. If ANY decision fails, entire batch is rolled back and error is thrown. Use for critical operations requiring consistency. NON-ATOMIC MODE (atomic: false): Each decision is processed independently. If some fail, others still succeed. Returns partial results with per-item success/error status. Use for best-effort batch operations or when individual failures are acceptable. RECOMMENDATION FOR AI AGENTS: Use atomic:false by default to avoid transaction failures from validation errors or malformed data. Only use atomic:true when all-or-nothing guarantee is required. 52% token reduction vs individual calls.',
      has_updates: 'Check for updates since timestamp (FR-003 Phase A - Lightweight Polling). Params: agent_name (required), since_timestamp (required, ISO 8601 format like "2025-10-14T08:00:00Z"). Returns: {has_updates: boolean, counts: {decisions: N, messages: N, files: N}}. Token cost: ~5-10 tokens per check. Uses COUNT queries on t_decisions, t_agent_messages, t_file_changes with timestamp filtering. Enables efficient polling without full data retrieval.',
      set_from_template: 'Set decision using template (FR-006). Params: template (required, template name), key (required), value (required), agent, layer (override), version, status (override), tags (override), scopes, plus any template-required fields. Applies template defaults (layer, status, tags) while allowing overrides. Validates required fields if specified by template. Returns: {success, key, key_id, version, template_used, applied_defaults, message}. Built-in templates: breaking_change, security_vulnerability, performance_optimization, deprecation, architecture_decision.',
      create_template: 'Create new decision template (FR-006). Params: name (required, unique), defaults (required, object with layer/status/tags/priority), required_fields (optional, array of field names), created_by (optional, agent name). Returns: {success, template_id, template_name, message}. Example defaults: {"layer":"business","status":"active","tags":["breaking"]}. Validates layer/status values.',
      list_templates: 'List all decision templates (FR-006). No params required. Returns: {templates: [{id, name, defaults, required_fields, created_by, created_at}], count}. Shows both built-in and custom templates.',
      hard_delete: 'Permanently delete a decision (hard delete). Params: key (required). WARNING: IRREVERSIBLE - removes all records including version history, tags, scopes. Use cases: manual cleanup after decision-to-task migration, remove test/debug decisions, purge sensitive data. Unlike soft delete (status=deprecated), this completely removes from database. Idempotent - safe to call even if already deleted. Returns: {success, key, message}.',
      add_decision_context: 'Add rich context to a decision (v3.2.2). Params: key (required), rationale (required), alternatives_considered (optional, JSON array), tradeoffs (optional, JSON object with pros/cons), decided_by (optional), related_task_id (optional), related_constraint_id (optional). Use to document WHY decisions were made, what alternatives were considered, and trade-offs. Multiple contexts can be attached to the same decision over time. Returns: {success, context_id, decision_key, message}.',
      list_decision_contexts: 'List decision contexts with filters (v3.2.2). Params: decision_key (optional), related_task_id (optional), related_constraint_id (optional), decided_by (optional), limit (default: 50), offset (default: 0). Returns: {success, contexts: [{id, decision_key, rationale, alternatives_considered, tradeoffs, decided_by, decision_date, related_task_id, related_constraint_id}], count}. JSON fields (alternatives, tradeoffs) are automatically parsed.'
    },
    examples: {
      set: '{ action: "set", key: "auth_method", value: "jwt", tags: ["security"] }',
      get: '{ action: "get", key: "auth_method" }',
      list: '{ action: "list", status: "active", layer: "infrastructure" }',
      search_tags: '{ action: "search_tags", tags: ["security", "api"] }',
      quick_set: '{ action: "quick_set", key: "api/instruments/oscillator-refactor", value: "Moved oscillator_type to MonophonicSynthConfig" }',
      search_advanced: '{ action: "search_advanced", layers: ["business", "data"], tags_all: ["breaking", "v0.3.3"], tags_any: ["api", "synthesis"], exclude_tags: ["deprecated"], scopes: ["api/instruments/*"], updated_after: "2025-10-01", statuses: ["active", "draft"], search_text: "oscillator", sort_by: "updated", sort_order: "desc", limit: 20, offset: 0 }',
      set_batch: '{ action: "set_batch", decisions: [{"key": "feat-1", "value": "...", "layer": "business"}, {"key": "feat-2", "value": "...", "layer": "data"}], atomic: true }',
      has_updates: '{ action: "has_updates", agent_name: "my-agent", since_timestamp: "2025-10-14T08:00:00Z" }',
      set_from_template: '{ action: "set_from_template", template: "breaking_change", key: "oscillator-type-moved", value: "oscillator_type moved to MonophonicSynthConfig" }',
      create_template: '{ action: "create_template", name: "bug_fix", defaults: {"layer":"business","tags":["bug","fix"],"status":"active"}, created_by: "my-agent" }',
      list_templates: '{ action: "list_templates" }',
      hard_delete: '{ action: "hard_delete", key: "task_old_authentication_refactor" }'
    },
    documentation: {
      tool_selection: 'docs/TOOL_SELECTION.md - Decision tree, tool comparison, when to use each tool (236 lines, ~12k tokens)',
      tool_reference: 'docs/TOOL_REFERENCE.md - Parameter requirements, batch operations, templates (471 lines, ~24k tokens)',
      workflows: 'docs/WORKFLOWS.md - Multi-step workflow examples, multi-agent coordination (602 lines, ~30k tokens)',
      best_practices: 'docs/BEST_PRACTICES.md - Common errors, best practices, troubleshooting (345 lines, ~17k tokens)',
      shared_concepts: 'docs/SHARED_CONCEPTS.md - Layer definitions, enum values (status/layer/priority), atomic mode (339 lines, ~17k tokens)'
    }
  };
}

/**
 * Example action for decision tool
 */
export function decisionExample(): any {
  return {
    tool: 'decision',
    description: 'Comprehensive decision tool examples without needing WebFetch access',
    scenarios: {
      basic_usage: {
        title: 'Basic Decision Management',
        examples: [
          {
            scenario: 'Record API design decision',
            request: '{ action: "set", key: "api_auth_method", value: "JWT with refresh tokens", layer: "business", tags: ["api", "security", "authentication"] }',
            explanation: 'Documents the choice of authentication method for the API'
          },
          {
            scenario: 'Retrieve a decision',
            request: '{ action: "get", key: "api_auth_method" }',
            response_structure: '{ key, value, layer, status, version, tags, scopes, decided_by, updated_at }'
          },
          {
            scenario: 'List all active decisions',
            request: '{ action: "list", status: "active", limit: 20 }',
            explanation: 'Returns active decisions with metadata for browsing'
          }
        ]
      },
      advanced_filtering: {
        title: 'Advanced Search and Filtering',
        examples: [
          {
            scenario: 'Find all security-related decisions in business layer',
            request: '{ action: "search_advanced", layers: ["business"], tags_any: ["security", "authentication"], status: ["active"], sort_by: "updated", sort_order: "desc" }',
            explanation: 'Combines layer filtering, tag matching, and sorting'
          },
          {
            scenario: 'Search within API scope with multiple tags',
            request: '{ action: "search_advanced", scopes: ["api/*"], tags_all: ["breaking", "v2.0"], updated_after: "2025-01-01" }',
            explanation: 'Uses scope wildcards and timestamp filtering for recent breaking changes'
          }
        ]
      },
      versioning_workflow: {
        title: 'Version Management',
        steps: [
          {
            step: 1,
            action: 'Create initial decision',
            request: '{ action: "set", key: "database_choice", value: "PostgreSQL", layer: "data", version: "1.0.0", tags: ["database"] }'
          },
          {
            step: 2,
            action: 'Update decision (creates new version)',
            request: '{ action: "set", key: "database_choice", value: "PostgreSQL with read replicas", layer: "data", version: "1.1.0", tags: ["database", "scaling"] }'
          },
          {
            step: 3,
            action: 'View version history',
            request: '{ action: "versions", key: "database_choice" }',
            result: 'Returns all versions with timestamps and changes'
          }
        ]
      },
      batch_operations: {
        title: 'Batch Decision Management',
        examples: [
          {
            scenario: 'Record multiple related decisions atomically',
            request: '{ action: "set_batch", decisions: [{"key": "cache_layer", "value": "Redis", "layer": "infrastructure"}, {"key": "cache_ttl", "value": "3600", "layer": "infrastructure"}], atomic: true }',
            explanation: 'All decisions succeed or all fail together (atomic mode)'
          },
          {
            scenario: 'Best-effort batch insert',
            request: '{ action: "set_batch", decisions: [{...}, {...}, {...}], atomic: false }',
            explanation: 'Each decision processed independently - partial success allowed'
          }
        ]
      },
      templates: {
        title: 'Using Decision Templates',
        examples: [
          {
            scenario: 'Use built-in breaking_change template',
            request: '{ action: "set_from_template", template: "breaking_change", key: "api_remove_legacy_endpoint", value: "Removed /v1/users endpoint - migrate to /v2/users" }',
            explanation: 'Automatically applies layer=business, tags=["breaking"], status=active'
          },
          {
            scenario: 'Create custom template',
            request: '{ action: "create_template", name: "feature_flag", defaults: {"layer": "presentation", "tags": ["feature-flag"], "status": "draft"}, created_by: "backend-team" }',
            explanation: 'Define reusable templates for common decision patterns'
          }
        ]
      },
      quick_set_inference: {
        title: 'Quick Set with Smart Defaults',
        examples: [
          {
            scenario: 'Auto-infer layer from key prefix',
            request: '{ action: "quick_set", key: "api/instruments/oscillator-refactor", value: "Moved oscillator_type to MonophonicSynthConfig" }',
            inferred: 'layer=presentation (from api/*), tags=["instruments", "oscillator-refactor"], scope=api/instruments'
          },
          {
            scenario: 'Database decision with auto-inference',
            request: '{ action: "quick_set", key: "db/users/add-email-index", value: "Added index on email column" }',
            inferred: 'layer=data (from db/*), tags=["users", "add-email-index"]'
          }
        ]
      }
    },
    best_practices: {
      key_naming: [
        'Use hierarchical keys: "api/users/authentication"',
        'Prefix with layer hint: api/* → presentation, db/* → data, service/* → business',
        'Use descriptive names that explain the decision context'
      ],
      tagging: [
        'Tag with relevant categories: security, performance, breaking, etc.',
        'Include version tags for release-specific decisions',
        'Use consistent tag naming conventions across team'
      ],
      versioning: [
        'Use semantic versioning: 1.0.0, 1.1.0, 2.0.0',
        'Increment major version for breaking changes',
        'Document rationale in decision value text'
      ],
      cleanup: [
        'Mark deprecated decisions with status="deprecated"',
        'Use hard_delete only for sensitive data or migration cleanup',
        'Link related decisions using scopes'
      ]
    }
  };
}
