/**
 * Context management tools for MCP Shared Context Server
 * Implements set_decision, get_context, and get_decision tools
 */

import { getDatabase, getOrCreateAgent, getOrCreateContextKey, getOrCreateTag, getOrCreateScope, getLayerId, transaction } from '../database.js';
import { STRING_TO_STATUS, STATUS_TO_STRING, DEFAULT_VERSION, DEFAULT_STATUS } from '../constants.js';
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
  SearchByLayerResponse
} from '../types.js';

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

  // Validate required parameters
  if (!params.key || params.key.trim() === '') {
    throw new Error('Parameter "key" is required and cannot be empty');
  }

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
  if (params.status && !STRING_TO_STATUS[params.status]) {
    throw new Error(`Invalid status: ${params.status}. Must be 'active', 'deprecated', or 'draft'`);
  }

  // Validate layer if provided
  let layerId: number | null = null;
  if (params.layer) {
    layerId = getLayerId(db, params.layer);
    if (layerId === null) {
      throw new Error(`Invalid layer: ${params.layer}. Must be one of: presentation, business, data, infrastructure, cross-cutting`);
    }
  }

  try {
    // Use transaction for atomicity
    return transaction(db, () => {
      // Get or create master records
      const agentId = getOrCreateAgent(db, agentName);
      const keyId = getOrCreateContextKey(db, params.key);

      // Current timestamp
      const ts = Math.floor(Date.now() / 1000);

      // Insert or update decision based on value type
      if (isNumeric) {
        // Numeric decision
        const stmt = db.prepare(`
          INSERT INTO decisions_numeric (key_id, value, agent_id, layer_id, version, status, ts)
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
          INSERT INTO decisions (key_id, value, agent_id, layer_id, version, status, ts)
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

      // Handle tags (many-to-many)
      if (params.tags && params.tags.length > 0) {
        // Clear existing tags
        db.prepare('DELETE FROM decision_tags WHERE decision_key_id = ?').run(keyId);

        // Insert new tags
        const tagStmt = db.prepare('INSERT INTO decision_tags (decision_key_id, tag_id) VALUES (?, ?)');
        for (const tagName of params.tags) {
          const tagId = getOrCreateTag(db, tagName);
          tagStmt.run(keyId, tagId);
        }
      }

      // Handle scopes (many-to-many)
      if (params.scopes && params.scopes.length > 0) {
        // Clear existing scopes
        db.prepare('DELETE FROM decision_scopes WHERE decision_key_id = ?').run(keyId);

        // Insert new scopes
        const scopeStmt = db.prepare('INSERT INTO decision_scopes (decision_key_id, scope_id) VALUES (?, ?)');
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
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to set decision: ${message}`);
  }
}

/**
 * Get context decisions with advanced filtering
 * Uses tagged_decisions view for token efficiency
 * Supports filtering by status, layer, tags, and scope
 *
 * @param params - Filter parameters
 * @returns Array of decisions with metadata
 */
export function getContext(params: GetContextParams = {}): GetContextResponse {
  const db = getDatabase();

  try {
    // Build query dynamically based on filters
    let query = 'SELECT * FROM tagged_decisions WHERE 1=1';
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
      query += ' AND (scopes LIKE ? OR scopes = ?)';
      queryParams.push(`%${params.scope}%`, params.scope);
    }

    // Filter by tags
    if (params.tags && params.tags.length > 0) {
      const tagMatch = params.tag_match || 'OR';

      if (tagMatch === 'AND') {
        // All tags must be present
        for (const tag of params.tags) {
          query += ' AND (tags LIKE ? OR tags = ?)';
          queryParams.push(`%${tag}%`, tag);
        }
      } else {
        // Any tag must be present (OR)
        const tagConditions = params.tags.map(() => '(tags LIKE ? OR tags = ?)').join(' OR ');
        query += ` AND (${tagConditions})`;
        for (const tag of params.tags) {
          queryParams.push(`%${tag}%`, tag);
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
 *
 * @param params - Decision key
 * @returns Decision details or not found
 */
export function getDecision(params: GetDecisionParams): GetDecisionResponse {
  const db = getDatabase();

  // Validate parameter
  if (!params.key || params.key.trim() === '') {
    throw new Error('Parameter "key" is required and cannot be empty');
  }

  try {
    // Query tagged_decisions view
    const stmt = db.prepare('SELECT * FROM tagged_decisions WHERE key = ?');
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
 * Search for decisions by tags with AND/OR logic
 * Provides flexible tag-based filtering with status and layer support
 *
 * @param params - Search parameters (tags, match_mode, status, layer)
 * @returns Array of decisions matching tag criteria
 */
export function searchByTags(params: SearchByTagsParams): SearchByTagsResponse {
  const db = getDatabase();

  // Validate required parameters
  if (!params.tags || params.tags.length === 0) {
    throw new Error('Parameter "tags" is required and must contain at least one tag');
  }

  try {
    const matchMode = params.match_mode || 'OR';
    let query = 'SELECT * FROM tagged_decisions WHERE 1=1';
    const queryParams: any[] = [];

    // Apply tag filtering based on match mode
    if (matchMode === 'AND') {
      // All tags must be present
      for (const tag of params.tags) {
        query += ' AND (tags LIKE ? OR tags = ?)';
        queryParams.push(`%${tag}%`, tag);
      }
    } else if (matchMode === 'OR') {
      // Any tag must be present
      const tagConditions = params.tags.map(() => '(tags LIKE ? OR tags = ?)').join(' OR ');
      query += ` AND (${tagConditions})`;
      for (const tag of params.tags) {
        queryParams.push(`%${tag}%`, tag);
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
    const keyResult = db.prepare('SELECT id FROM context_keys WHERE key = ?').get(params.key) as { id: number } | undefined;

    if (!keyResult) {
      // Key doesn't exist, return empty history
      return {
        key: params.key,
        history: [],
        count: 0
      };
    }

    const keyId = keyResult.id;

    // Query decision_history with agent join
    const stmt = db.prepare(`
      SELECT
        dh.version,
        dh.value,
        a.name as agent_name,
        datetime(dh.ts, 'unixepoch') as timestamp
      FROM decision_history dh
      LEFT JOIN agents a ON dh.agent_id = a.id
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
 * Search for decisions within a specific architecture layer
 * Supports status filtering and optional tag inclusion
 *
 * @param params - Layer name, optional status and include_tags
 * @returns Array of decisions in the specified layer
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
      // Use tagged_decisions view for full metadata
      query = `
        SELECT * FROM tagged_decisions
        WHERE layer = ? AND status = ?
        ORDER BY updated DESC
      `;
    } else {
      // Use base decisions table with minimal joins
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
        FROM decisions d
        INNER JOIN context_keys ck ON d.key_id = ck.id
        LEFT JOIN layers l ON d.layer_id = l.id
        LEFT JOIN agents a ON d.agent_id = a.id
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
        FROM decisions_numeric dn
        INNER JOIN context_keys ck ON dn.key_id = ck.id
        LEFT JOIN layers l ON dn.layer_id = l.id
        LEFT JOIN agents a ON dn.agent_id = a.id
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
