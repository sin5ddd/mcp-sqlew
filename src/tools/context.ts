/**
 * Context management tools for MCP Shared Context Server
 * Implements set_decision, get_context, and get_decision tools
 */

import { getDatabase, getOrCreateAgent, getOrCreateContextKey, getOrCreateTag, getOrCreateScope, getLayerId, transaction, addDecisionContext as dbAddDecisionContext, getDecisionWithContext as dbGetDecisionWithContext, listDecisionContexts as dbListDecisionContexts } from '../database.js';
import { STRING_TO_STATUS, STATUS_TO_STRING, DEFAULT_VERSION, DEFAULT_STATUS } from '../constants.js';
import { processBatch } from '../utils/batch.js';
import { validateRequired, validateStatus, validateLayer } from '../utils/validators.js';
import { buildWhereClause, type FilterCondition } from '../utils/query-builder.js';
import type {
  SetDecisionParams,
  GetContextParams,
  GetDecisionParams,
  SetDecisionResponse,
  GetContextResponse,
  GetDecisionResponse,
  TaggedDecision,
  Database,
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
  HardDeleteDecisionResponse
} from '../types.js';

/**
 * Internal helper: Set decision without wrapping in transaction
 * Used by setDecision (with transaction) and setDecisionBatch (manages its own transaction)
 *
 * @param params - Decision parameters
 * @param db - Database instance
 * @returns Response with success status and metadata
 */
function setDecisionInternal(params: SetDecisionParams, db: Database): SetDecisionResponse {
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
    layerId = validateLayer(db, params.layer);
  }

  // Get or create master records
  const agentId = getOrCreateAgent(db, agentName);
  const keyId = getOrCreateContextKey(db, params.key);

  // Current timestamp
  const ts = Math.floor(Date.now() / 1000);

  // Insert or update decision based on value type
  if (isNumeric) {
    // Numeric decision
    const stmt = db.prepare(`
      INSERT INTO t_decisions_numeric (key_id, value, agent_id, layer_id, version, status, ts)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(key_id) DO UPDATE SET
        value = excluded.value,
        agent_id = excluded.agent_id,
        layer_id = excluded.layer_id,
        version = excluded.version,
        status = excluded.status,
        ts = excluded.ts
    `);
    stmt.run(keyId, value, agentId, layerId, version, status, ts);
  } else {
    // String decision
    const stmt = db.prepare(`
      INSERT INTO t_decisions (key_id, value, agent_id, layer_id, version, status, ts)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(key_id) DO UPDATE SET
        value = excluded.value,
        agent_id = excluded.agent_id,
        layer_id = excluded.layer_id,
        version = excluded.version,
        status = excluded.status,
        ts = excluded.ts
    `);
    stmt.run(keyId, String(value), agentId, layerId, version, status, ts);
  }

  // Handle m_tags (many-to-many)
  if (params.tags && params.tags.length > 0) {
    // Clear existing tags
    db.prepare('DELETE FROM t_decision_tags WHERE decision_key_id = ?').run(keyId);

    // Insert new tags
    const tagStmt = db.prepare('INSERT INTO t_decision_tags (decision_key_id, tag_id) VALUES (?, ?)');
    for (const tagName of params.tags) {
      const tagId = getOrCreateTag(db, tagName);
      tagStmt.run(keyId, tagId);
    }
  }

  // Handle m_scopes (many-to-many)
  if (params.scopes && params.scopes.length > 0) {
    // Clear existing scopes
    db.prepare('DELETE FROM t_decision_scopes WHERE decision_key_id = ?').run(keyId);

    // Insert new scopes
    const scopeStmt = db.prepare('INSERT INTO t_decision_scopes (decision_key_id, scope_id) VALUES (?, ?)');
    for (const scopeName of params.scopes) {
      const scopeId = getOrCreateScope(db, scopeName);
      scopeStmt.run(keyId, scopeId);
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
 * @returns Response with success status and metadata
 */
export function setDecision(params: SetDecisionParams): SetDecisionResponse {
  const db = getDatabase();

  try {
    // Use transaction for atomicity
    return transaction(db, () => {
      return setDecisionInternal(params, db);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to set decision: ${message}`);
  }
}

/**
 * Get context t_decisions with advanced filtering
 * Uses v_tagged_decisions view for token efficiency
 * Supports filtering by status, layer, tags, and scope
 *
 * @param params - Filter parameters
 * @returns Array of t_decisions with metadata
 */
export function getContext(params: GetContextParams = {}): GetContextResponse {
  const db = getDatabase();

  try {
    // Build query dynamically based on filters
    let query = 'SELECT * FROM v_tagged_decisions WHERE 1=1';
    const queryParams: any[] = [];

    // Filter by status
    if (params.status) {
      if (!STRING_TO_STATUS[params.status]) {
        throw new Error(`Invalid status: ${params.status}`);
      }
      query += ' AND status = ?';
      queryParams.push(params.status);
    }

    // Filter by layer
    if (params.layer) {
      query += ' AND layer = ?';
      queryParams.push(params.layer);
    }

    // Filter by scope
    if (params.scope) {
      // Use LIKE for comma-separated scopes
      query += ' AND scopes LIKE ?';
      queryParams.push(`%${params.scope}%`);
    }

    // Filter by tags
    if (params.tags && params.tags.length > 0) {
      const tagMatch = params.tag_match || 'OR';

      if (tagMatch === 'AND') {
        // All tags must be present
        for (const tag of params.tags) {
          query += ' AND tags LIKE ?';
          queryParams.push(`%${tag}%`);
        }
      } else {
        // Any tag must be present (OR)
        const tagConditions = params.tags.map(() => 'tags LIKE ?').join(' OR ');
        query += ` AND (${tagConditions})`;
        for (const tag of params.tags) {
          queryParams.push(`%${tag}%`);
        }
      }
    }

    // Order by most recent
    query += ' ORDER BY updated DESC';

    // Execute query
    const stmt = db.prepare(query);
    const rows = stmt.all(...queryParams) as TaggedDecision[];

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
 * @returns Decision details or not found
 */
export function getDecision(params: GetDecisionParams & { include_context?: boolean }): GetDecisionResponse {
  const db = getDatabase();

  // Validate parameter
  if (!params.key || params.key.trim() === '') {
    throw new Error('Parameter "key" is required and cannot be empty');
  }

  try {
    // If include_context is true, use the context-aware function
    if (params.include_context) {
      const result = dbGetDecisionWithContext(db, params.key);

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
    const stmt = db.prepare('SELECT * FROM v_tagged_decisions WHERE key = ?');
    const row = stmt.get(params.key) as TaggedDecision | undefined;

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
 * @returns Array of t_decisions matching tag criteria
 */
export function searchByTags(params: SearchByTagsParams): SearchByTagsResponse {
  const db = getDatabase();

  // Validate required parameters
  if (!params.tags || params.tags.length === 0) {
    throw new Error('Parameter "tags" is required and must contain at least one tag');
  }

  try {
    const matchMode = params.match_mode || 'OR';
    let query = 'SELECT * FROM v_tagged_decisions WHERE 1=1';
    const queryParams: any[] = [];

    // Apply tag filtering based on match mode
    if (matchMode === 'AND') {
      // All tags must be present
      for (const tag of params.tags) {
        query += ' AND tags LIKE ?';
        queryParams.push(`%${tag}%`);
      }
    } else if (matchMode === 'OR') {
      // Any tag must be present
      const tagConditions = params.tags.map(() => 'tags LIKE ?').join(' OR ');
      query += ` AND (${tagConditions})`;
      for (const tag of params.tags) {
        queryParams.push(`%${tag}%`);
      }
    } else {
      throw new Error(`Invalid match_mode: ${matchMode}. Must be 'AND' or 'OR'`);
    }

    // Optional status filter
    if (params.status) {
      if (!STRING_TO_STATUS[params.status]) {
        throw new Error(`Invalid status: ${params.status}. Must be 'active', 'deprecated', or 'draft'`);
      }
      query += ' AND status = ?';
      queryParams.push(params.status);
    }

    // Optional layer filter
    if (params.layer) {
      // Validate layer exists
      const layerId = getLayerId(db, params.layer);
      if (layerId === null) {
        throw new Error(`Invalid layer: ${params.layer}. Must be one of: presentation, business, data, infrastructure, cross-cutting`);
      }
      query += ' AND layer = ?';
      queryParams.push(params.layer);
    }

    // Order by most recent
    query += ' ORDER BY updated DESC';

    // Execute query
    const stmt = db.prepare(query);
    const rows = stmt.all(...queryParams) as TaggedDecision[];

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
 * @returns Array of historical versions with metadata
 */
export function getVersions(params: GetVersionsParams): GetVersionsResponse {
  const db = getDatabase();

  // Validate required parameter
  if (!params.key || params.key.trim() === '') {
    throw new Error('Parameter "key" is required and cannot be empty');
  }

  try {
    // Get key_id for the decision
    const keyResult = db.prepare('SELECT id FROM m_context_keys WHERE key = ?').get(params.key) as { id: number } | undefined;

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
    const stmt = db.prepare(`
      SELECT
        dh.version,
        dh.value,
        a.name as agent_name,
        datetime(dh.ts, 'unixepoch') as timestamp
      FROM t_decision_history dh
      LEFT JOIN m_agents a ON dh.agent_id = a.id
      WHERE dh.key_id = ?
      ORDER BY dh.ts DESC
    `);

    const rows = stmt.all(keyId) as Array<{
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
 * @returns Array of t_decisions in the specified layer
 */
export function searchByLayer(params: SearchByLayerParams): SearchByLayerResponse {
  const db = getDatabase();

  // Validate required parameter
  if (!params.layer || params.layer.trim() === '') {
    throw new Error('Parameter "layer" is required and cannot be empty');
  }

  try {
    // Validate layer exists
    const layerId = getLayerId(db, params.layer);
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

    let query: string;
    const queryParams: any[] = [params.layer, statusValue];

    if (includeTagsValue) {
      // Use v_tagged_decisions view for full metadata
      query = `
        SELECT * FROM v_tagged_decisions
        WHERE layer = ? AND status = ?
        ORDER BY updated DESC
      `;
    } else {
      // Use base t_decisions table with minimal joins
      query = `
        SELECT
          ck.key,
          d.value,
          d.version,
          CASE d.status
            WHEN 1 THEN 'active'
            WHEN 2 THEN 'deprecated'
            WHEN 3 THEN 'draft'
          END as status,
          l.name as layer,
          NULL as tags,
          NULL as scopes,
          a.name as decided_by,
          datetime(d.ts, 'unixepoch') as updated
        FROM t_decisions d
        INNER JOIN m_context_keys ck ON d.key_id = ck.id
        LEFT JOIN m_layers l ON d.layer_id = l.id
        LEFT JOIN m_agents a ON d.agent_id = a.id
        WHERE l.name = ? AND d.status = ?

        UNION ALL

        SELECT
          ck.key,
          CAST(dn.value AS TEXT) as value,
          dn.version,
          CASE dn.status
            WHEN 1 THEN 'active'
            WHEN 2 THEN 'deprecated'
            WHEN 3 THEN 'draft'
          END as status,
          l.name as layer,
          NULL as tags,
          NULL as scopes,
          a.name as decided_by,
          datetime(dn.ts, 'unixepoch') as updated
        FROM t_decisions_numeric dn
        INNER JOIN m_context_keys ck ON dn.key_id = ck.id
        LEFT JOIN m_layers l ON dn.layer_id = l.id
        LEFT JOIN m_agents a ON dn.agent_id = a.id
        WHERE l.name = ? AND dn.status = ?

        ORDER BY updated DESC
      `;
      // Add params for the numeric table part of UNION
      queryParams.push(params.layer, statusValue);
    }

    // Execute query
    const stmt = db.prepare(query);
    const rows = stmt.all(...queryParams) as TaggedDecision[];

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
 * @returns Response with success status and inferred metadata
 */
export function quickSetDecision(params: QuickSetDecisionParams): QuickSetDecisionResponse {
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

  // Call setDecision with full params
  const result = setDecision(fullParams);

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
 * @returns Filtered decisions with total count for pagination
 */
export function searchAdvanced(params: SearchAdvancedParams = {}): SearchAdvancedResponse {
  const db = getDatabase();

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
    let query = 'SELECT * FROM v_tagged_decisions WHERE 1=1';
    const queryParams: any[] = [];

    // Filter by layers (OR relationship)
    if (params.layers && params.layers.length > 0) {
      const layerConditions = params.layers.map(() => 'layer = ?').join(' OR ');
      query += ` AND (${layerConditions})`;
      queryParams.push(...params.layers);
    }

    // Filter by tags_all (AND relationship - must have ALL tags)
    if (params.tags_all && params.tags_all.length > 0) {
      for (const tag of params.tags_all) {
        query += ' AND (tags LIKE ? OR tags = ?)';
        queryParams.push(`%${tag}%`, tag);
      }
    }

    // Filter by tags_any (OR relationship - must have ANY tag)
    if (params.tags_any && params.tags_any.length > 0) {
      const tagConditions = params.tags_any.map(() => '(tags LIKE ? OR tags = ?)').join(' OR ');
      query += ` AND (${tagConditions})`;
      for (const tag of params.tags_any) {
        queryParams.push(`%${tag}%`, tag);
      }
    }

    // Exclude tags
    if (params.exclude_tags && params.exclude_tags.length > 0) {
      for (const tag of params.exclude_tags) {
        query += ' AND (tags IS NULL OR (tags NOT LIKE ? AND tags != ?))';
        queryParams.push(`%${tag}%`, tag);
      }
    }

    // Filter by scopes with wildcard support
    if (params.scopes && params.scopes.length > 0) {
      const scopeConditions: string[] = [];
      for (const scope of params.scopes) {
        if (scope.includes('*')) {
          // Wildcard pattern - convert to LIKE pattern
          const likePattern = scope.replace(/\*/g, '%');
          scopeConditions.push('(scopes LIKE ? OR scopes = ?)');
          queryParams.push(`%${likePattern}%`, likePattern);
        } else {
          // Exact match
          scopeConditions.push('(scopes LIKE ? OR scopes = ?)');
          queryParams.push(`%${scope}%`, scope);
        }
      }
      query += ` AND (${scopeConditions.join(' OR ')})`;
    }

    // Temporal filtering - updated_after
    if (params.updated_after) {
      const timestamp = parseRelativeTime(params.updated_after);
      if (timestamp !== null) {
        query += ' AND (SELECT unixepoch(updated)) >= ?';
        queryParams.push(timestamp);
      } else {
        throw new Error(`Invalid updated_after format: ${params.updated_after}. Use ISO timestamp or relative time like "7d", "2h", "30m"`);
      }
    }

    // Temporal filtering - updated_before
    if (params.updated_before) {
      const timestamp = parseRelativeTime(params.updated_before);
      if (timestamp !== null) {
        query += ' AND (SELECT unixepoch(updated)) <= ?';
        queryParams.push(timestamp);
      } else {
        throw new Error(`Invalid updated_before format: ${params.updated_before}. Use ISO timestamp or relative time like "7d", "2h", "30m"`);
      }
    }

    // Filter by decided_by (OR relationship)
    if (params.decided_by && params.decided_by.length > 0) {
      const agentConditions = params.decided_by.map(() => 'decided_by = ?').join(' OR ');
      query += ` AND (${agentConditions})`;
      queryParams.push(...params.decided_by);
    }

    // Filter by statuses (OR relationship)
    if (params.statuses && params.statuses.length > 0) {
      const statusConditions = params.statuses.map(() => 'status = ?').join(' OR ');
      query += ` AND (${statusConditions})`;
      queryParams.push(...params.statuses);
    }

    // Full-text search in value field
    if (params.search_text) {
      query += ' AND value LIKE ?';
      queryParams.push(`%${params.search_text}%`);
    }

    // Count total matching records (before pagination)
    const countQuery = query.replace('SELECT * FROM', 'SELECT COUNT(*) as total FROM');
    const countStmt = db.prepare(countQuery);
    const countResult = countStmt.get(...queryParams) as { total: number };
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

    query += ` ORDER BY ${sortBy} ${sortOrder.toUpperCase()}`;

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

    query += ' LIMIT ? OFFSET ?';
    queryParams.push(limit, offset);

    // Execute query
    const stmt = db.prepare(query);
    const rows = stmt.all(...queryParams) as TaggedDecision[];

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
 * @returns Response with success status and detailed results for each item
 */
export function setDecisionBatch(params: SetDecisionBatchParams): SetDecisionBatchResponse {
  const db = getDatabase();

  // Validate required parameters
  if (!params.decisions || !Array.isArray(params.decisions)) {
    throw new Error('Parameter "decisions" is required and must be an array');
  }

  const atomic = params.atomic !== undefined ? params.atomic : true;

  // Use processBatch utility
  const batchResult = processBatch(
    db,
    params.decisions,
    (decision, db) => {
      const result = setDecisionInternal(decision, db);
      return {
        key: decision.key,
        key_id: result.key_id,
        version: result.version
      };
    },
    atomic,
    50
  );

  // Map batch results to SetDecisionBatchResponse format
  return {
    success: batchResult.success,
    inserted: batchResult.processed,
    failed: batchResult.failed,
    results: batchResult.results.map(r => ({
      key: (r.data as any)?.key || '',
      key_id: r.data?.key_id,
      version: r.data?.version,
      success: r.success,
      error: r.error
    }))
  };
}

/**
 * Check for updates since a given timestamp (FR-003 Phase A)
 * Lightweight polling mechanism using COUNT queries
 * Token cost: ~5-10 tokens per check
 *
 * @param params - Agent name and since_timestamp (ISO 8601)
 * @returns Boolean flag and counts for decisions, messages, files
 */
export function hasUpdates(params: HasUpdatesParams): HasUpdatesResponse {
  const db = getDatabase();

  // Validate required parameters
  if (!params.agent_name || params.agent_name.trim() === '') {
    throw new Error('Parameter "agent_name" is required and cannot be empty');
  }

  if (!params.since_timestamp || params.since_timestamp.trim() === '') {
    throw new Error('Parameter "since_timestamp" is required and cannot be empty');
  }

  try {
    // Parse ISO timestamp to Unix epoch
    const sinceDate = new Date(params.since_timestamp);
    if (isNaN(sinceDate.getTime())) {
      throw new Error(`Invalid since_timestamp format: ${params.since_timestamp}. Use ISO 8601 format (e.g., "2025-10-14T08:00:00Z")`);
    }
    const sinceTs = Math.floor(sinceDate.getTime() / 1000);

    // Count decisions updated since timestamp (both string and numeric tables)
    const decisionCountStmt = db.prepare(`
      SELECT COUNT(*) as count FROM (
        SELECT ts FROM t_decisions WHERE ts > ?
        UNION ALL
        SELECT ts FROM t_decisions_numeric WHERE ts > ?
      )
    `);
    const decisionResult = decisionCountStmt.get(sinceTs, sinceTs) as { count: number };
    const decisionsCount = decisionResult.count;

    // Get agent_id for the requesting agent
    const agentResult = db.prepare('SELECT id FROM m_agents WHERE name = ?').get(params.agent_name) as { id: number } | undefined;

    // Count messages for the agent (received messages - to_agent_id matches OR broadcast messages)
    let messagesCount = 0;
    if (agentResult) {
      const agentId = agentResult.id;
      const messageCountStmt = db.prepare(`
        SELECT COUNT(*) as count FROM t_agent_messages
        WHERE ts > ? AND (to_agent_id = ? OR to_agent_id IS NULL)
      `);
      const messageResult = messageCountStmt.get(sinceTs, agentId) as { count: number };
      messagesCount = messageResult.count;
    }

    // Count file changes since timestamp
    const fileCountStmt = db.prepare(`
      SELECT COUNT(*) as count FROM t_file_changes WHERE ts > ?
    `);
    const fileResult = fileCountStmt.get(sinceTs) as { count: number };
    const filesCount = fileResult.count;

    // Determine if there are any updates
    const hasUpdates = decisionsCount > 0 || messagesCount > 0 || filesCount > 0;

    return {
      has_updates: hasUpdates,
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
 * @returns Response with success status and applied defaults metadata
 */
export function setFromTemplate(params: SetFromTemplateParams): SetFromTemplateResponse {
  const db = getDatabase();

  // Validate required parameters
  if (!params.template || params.template.trim() === '') {
    throw new Error('Parameter "template" is required and cannot be empty');
  }

  if (!params.key || params.key.trim() === '') {
    throw new Error('Parameter "key" is required and cannot be empty');
  }

  if (params.value === undefined || params.value === null) {
    throw new Error('Parameter "value" is required');
  }

  try {
    // Get template
    const templateRow = db.prepare('SELECT * FROM t_decision_templates WHERE name = ?').get(params.template) as {
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
        if (!(field in params) || params[field] === undefined || params[field] === null) {
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

    // Call setDecision with merged params
    const result = setDecision(decisionParams);

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
 * @returns Response with success status and template ID
 */
export function createTemplate(params: CreateTemplateParams): CreateTemplateResponse {
  const db = getDatabase();

  // Validate required parameters
  if (!params.name || params.name.trim() === '') {
    throw new Error('Parameter "name" is required and cannot be empty');
  }

  if (!params.defaults || typeof params.defaults !== 'object') {
    throw new Error('Parameter "defaults" is required and must be an object');
  }

  try {
    return transaction(db, () => {
      // Validate layer if provided in defaults
      if (params.defaults.layer) {
        const layerId = getLayerId(db, params.defaults.layer);
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
        createdById = getOrCreateAgent(db, params.created_by);
      }

      // Serialize defaults and required fields
      const defaultsJson = JSON.stringify(params.defaults);
      const requiredFieldsJson = params.required_fields ? JSON.stringify(params.required_fields) : null;

      // Insert template
      const stmt = db.prepare(`
        INSERT INTO t_decision_templates (name, defaults, required_fields, created_by)
        VALUES (?, ?, ?, ?)
      `);

      const info = stmt.run(params.name, defaultsJson, requiredFieldsJson, createdById);

      return {
        success: true,
        template_id: info.lastInsertRowid as number,
        template_name: params.name,
        message: `Template "${params.name}" created successfully`
      };
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
 * @returns Array of all templates with parsed JSON fields
 */
export function listTemplates(params: ListTemplatesParams = {}): ListTemplatesResponse {
  const db = getDatabase();

  try {
    const stmt = db.prepare(`
      SELECT
        t.id,
        t.name,
        t.defaults,
        t.required_fields,
        a.name as created_by,
        datetime(t.ts, 'unixepoch') as created_at
      FROM t_decision_templates t
      LEFT JOIN m_agents a ON t.created_by = a.id
      ORDER BY t.name ASC
    `);

    const rows = stmt.all() as Array<{
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
 * @returns Response with success status
 */
export function hardDeleteDecision(params: HardDeleteDecisionParams): HardDeleteDecisionResponse {
  const db = getDatabase();

  // Validate parameter
  if (!params.key || params.key.trim() === '') {
    throw new Error('Parameter "key" is required and cannot be empty');
  }

  try {
    return transaction(db, () => {
      // Get key_id
      const keyResult = db.prepare('SELECT id FROM m_context_keys WHERE key = ?').get(params.key) as { id: number } | undefined;

      if (!keyResult) {
        // Key doesn't exist - still return success (idempotent)
        return {
          success: true,
          key: params.key,
          message: `Decision "${params.key}" not found (already deleted or never existed)`
        };
      }

      const keyId = keyResult.id;

      // Delete from t_decisions (if exists)
      const deletedString = db.prepare('DELETE FROM t_decisions WHERE key_id = ?').run(keyId);

      // Delete from t_decisions_numeric (if exists)
      const deletedNumeric = db.prepare('DELETE FROM t_decisions_numeric WHERE key_id = ?').run(keyId);

      // Delete from t_decision_history (CASCADE should handle this, but explicit for clarity)
      const deletedHistory = db.prepare('DELETE FROM t_decision_history WHERE key_id = ?').run(keyId);

      // Delete from t_decision_tags (CASCADE should handle this)
      const deletedTags = db.prepare('DELETE FROM t_decision_tags WHERE decision_key_id = ?').run(keyId);

      // Delete from t_decision_scopes (CASCADE should handle this)
      const deletedScopes = db.prepare('DELETE FROM t_decision_scopes WHERE decision_key_id = ?').run(keyId);

      // Calculate total deleted records
      const totalDeleted = deletedString.changes + deletedNumeric.changes + deletedHistory.changes + deletedTags.changes + deletedScopes.changes;

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
 * @returns Response with success status
 */
export function addDecisionContextAction(params: any): any {
  const db = getDatabase();

  // Validate required parameters
  if (!params.key || params.key.trim() === '') {
    throw new Error('Parameter "key" is required and cannot be empty');
  }

  if (!params.rationale || params.rationale.trim() === '') {
    throw new Error('Parameter "rationale" is required and cannot be empty');
  }

  try {
    // Parse JSON if provided as strings
    let alternatives = params.alternatives_considered || null;
    let tradeoffs = params.tradeoffs || null;

    // If already objects, stringify them
    if (alternatives && typeof alternatives === 'object') {
      alternatives = JSON.stringify(alternatives);
    }
    if (tradeoffs && typeof tradeoffs === 'object') {
      tradeoffs = JSON.stringify(tradeoffs);
    }

    const contextId = dbAddDecisionContext(
      db,
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
 * @returns Array of decision contexts
 */
export function listDecisionContextsAction(params: any): any {
  const db = getDatabase();

  try {
    const contexts = dbListDecisionContexts(db, {
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
