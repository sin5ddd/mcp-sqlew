/**
 * File tracking tools for MCP Shared Context Server
 * Provides file change tracking with layer integration and lock detection
 */

import { getDatabase, getOrCreateFile, getOrCreateAgent, getLayerId, transaction } from '../database.js';
import {
  STRING_TO_CHANGE_TYPE,
  CHANGE_TYPE_TO_STRING,
  STANDARD_LAYERS,
  DEFAULT_QUERY_LIMIT
} from '../constants.js';
import type {
  RecordFileChangeParams,
  RecordFileChangeResponse,
  GetFileChangesParams,
  GetFileChangesResponse,
  CheckFileLockParams,
  CheckFileLockResponse,
  RecentFileChange,
  RecordFileChangeBatchParams,
  RecordFileChangeBatchResponse,
  Database
} from '../types.js';
import { performAutoCleanup } from '../utils/cleanup.js';
import { processBatch } from '../utils/batch.js';

/**
 * Internal helper: Record file change without cleanup or transaction wrapper
 * Used by recordFileChange (with cleanup) and recordFileChangeBatch (manages its own transaction)
 *
 * @param params - File change parameters
 * @param db - Database instance
 * @returns Success response with change ID and timestamp
 */
function recordFileChangeInternal(params: RecordFileChangeParams, db: Database): RecordFileChangeResponse {
  // Validate change_type
  const changeTypeInt = STRING_TO_CHANGE_TYPE[params.change_type];
  if (changeTypeInt === undefined) {
    throw new Error(`Invalid change_type: ${params.change_type}. Must be one of: created, modified, deleted`);
  }

  // Validate layer if provided
  let layerId: number | null = null;
  if (params.layer) {
    if (!STANDARD_LAYERS.includes(params.layer as any)) {
      throw new Error(
        `Invalid layer: ${params.layer}. Must be one of: ${STANDARD_LAYERS.join(', ')}`
      );
    }
    layerId = getLayerId(db, params.layer);
    if (layerId === null) {
      throw new Error(`Layer not found: ${params.layer}`);
    }
  }

  // Auto-register file and agent
  const fileId = getOrCreateFile(db, params.file_path);
  const agentId = getOrCreateAgent(db, params.agent_name);

  // Insert file change record
  const stmt = db.prepare(`
    INSERT INTO t_file_changes (file_id, agent_id, layer_id, change_type, description)
    VALUES (?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    fileId,
    agentId,
    layerId,
    changeTypeInt,
    params.description || null
  );

  // Get timestamp
  const tsResult = db.prepare('SELECT ts FROM t_file_changes WHERE id = ?')
    .get(result.lastInsertRowid) as { ts: number } | undefined;

  return {
    success: true,
    change_id: result.lastInsertRowid as number,
    timestamp: tsResult ? new Date(tsResult.ts * 1000).toISOString() : new Date().toISOString(),
  };
}

/**
 * Record a file change with optional layer assignment and description.
 * Auto-registers the file and agent if they don't exist.
 *
 * @param params - File change parameters
 * @returns Success response with change ID and timestamp
 */
export function recordFileChange(params: RecordFileChangeParams): RecordFileChangeResponse {
  const db = getDatabase();

  // Cleanup old file changes before inserting new one
  performAutoCleanup(db);

  try {
    return recordFileChangeInternal(params, db);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to record file change: ${message}`);
  }
}

/**
 * Get file changes with advanced filtering.
 * Uses token-efficient view when no specific filters are applied.
 *
 * @param params - Filter parameters
 * @returns Array of file changes with metadata
 */
export function getFileChanges(params: GetFileChangesParams): GetFileChangesResponse {
  const db = getDatabase();

  try {
    const limit = params.limit || DEFAULT_QUERY_LIMIT;
    const conditions: string[] = [];
    const values: any[] = [];

    // Build WHERE clause based on filters
    if (params.file_path) {
      conditions.push('f.path = ?');
      values.push(params.file_path);
    }

    if (params.agent_name) {
      conditions.push('a.name = ?');
      values.push(params.agent_name);
    }

    if (params.layer) {
      // Validate layer
      if (!STANDARD_LAYERS.includes(params.layer as any)) {
        throw new Error(
          `Invalid layer: ${params.layer}. Must be one of: ${STANDARD_LAYERS.join(', ')}`
        );
      }
      conditions.push('l.name = ?');
      values.push(params.layer);
    }

    if (params.change_type) {
      const changeTypeInt = STRING_TO_CHANGE_TYPE[params.change_type];
      if (changeTypeInt === undefined) {
        throw new Error(`Invalid change_type: ${params.change_type}`);
      }
      conditions.push('fc.change_type = ?');
      values.push(changeTypeInt);
    }

    if (params.since) {
      // Convert ISO 8601 to Unix epoch
      const sinceEpoch = Math.floor(new Date(params.since).getTime() / 1000);
      conditions.push('fc.ts >= ?');
      values.push(sinceEpoch);
    }

    // Use view if no specific filters (token efficient)
    if (conditions.length === 0) {
      const stmt = db.prepare(`
        SELECT * FROM v_recent_file_changes
        LIMIT ?
      `);

      const rows = stmt.all(limit) as RecentFileChange[];

      return {
        changes: rows,
        count: rows.length,
      };
    }

    // Otherwise, build custom query
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const stmt = db.prepare(`
      SELECT
        f.path,
        a.name as changed_by,
        l.name as layer,
        CASE fc.change_type
          WHEN 1 THEN 'created'
          WHEN 2 THEN 'modified'
          ELSE 'deleted'
        END as change_type,
        fc.description,
        datetime(fc.ts, 'unixepoch') as changed_at
      FROM t_file_changes fc
      JOIN m_files f ON fc.file_id = f.id
      JOIN m_agents a ON fc.agent_id = a.id
      LEFT JOIN m_layers l ON fc.layer_id = l.id
      ${whereClause}
      ORDER BY fc.ts DESC
      LIMIT ?
    `);

    values.push(limit);
    const rows = stmt.all(...values) as RecentFileChange[];

    return {
      changes: rows,
      count: rows.length,
    };

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get file changes: ${message}`);
  }
}

/**
 * Check if a file is "locked" (recently modified by another agent).
 * Useful to prevent concurrent edits by multiple agents.
 *
 * @param params - File path and lock duration
 * @returns Lock status with details
 */
export function checkFileLock(params: CheckFileLockParams): CheckFileLockResponse {
  const db = getDatabase();

  try {
    const lockDuration = params.lock_duration || 300; // Default 5 minutes
    const currentTime = Math.floor(Date.now() / 1000);
    const lockThreshold = currentTime - lockDuration;

    // Get the most recent change to this file
    const stmt = db.prepare(`
      SELECT
        a.name as agent,
        fc.change_type,
        fc.ts
      FROM t_file_changes fc
      JOIN m_files f ON fc.file_id = f.id
      JOIN m_agents a ON fc.agent_id = a.id
      WHERE f.path = ?
      ORDER BY fc.ts DESC
      LIMIT 1
    `);

    const result = stmt.get(params.file_path) as
      { agent: string; change_type: number; ts: number } | undefined;

    if (!result) {
      // File never changed
      return {
        locked: false,
      };
    }

    // Check if within lock duration
    if (result.ts >= lockThreshold) {
      return {
        locked: true,
        last_agent: result.agent,
        last_change: new Date(result.ts * 1000).toISOString(),
        change_type: CHANGE_TYPE_TO_STRING[result.change_type as 1 | 2 | 3],
      };
    }

    // Not locked (too old)
    return {
      locked: false,
      last_agent: result.agent,
      last_change: new Date(result.ts * 1000).toISOString(),
      change_type: CHANGE_TYPE_TO_STRING[result.change_type as 1 | 2 | 3],
    };

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to check file lock: ${message}`);
  }
}

/**
 * Record multiple file changes in a single batch operation (FR-005)
 * Supports atomic (all succeed or all fail) and non-atomic modes
 * Limit: 50 items per batch (constraint #3)
 *
 * @param params - Batch parameters with array of file changes and atomic flag
 * @returns Response with success status and detailed results for each item
 */
export function recordFileChangeBatch(params: RecordFileChangeBatchParams): RecordFileChangeBatchResponse {
  const db = getDatabase();

  // Validate required parameters
  if (!params.file_changes || !Array.isArray(params.file_changes)) {
    throw new Error('Parameter "file_changes" is required and must be an array');
  }

  // Cleanup old file changes before processing batch
  performAutoCleanup(db);

  const atomic = params.atomic !== undefined ? params.atomic : true;

  // Use processBatch utility
  const batchResult = processBatch(
    db,
    params.file_changes,
    (fileChange, db) => {
      const result = recordFileChangeInternal(fileChange, db);
      return {
        file_path: fileChange.file_path,
        change_id: result.change_id,
        timestamp: result.timestamp
      };
    },
    atomic,
    50
  );

  // Map batch results to RecordFileChangeBatchResponse format
  return {
    success: batchResult.success,
    inserted: batchResult.processed,
    failed: batchResult.failed,
    results: batchResult.results.map(r => ({
      file_path: (r.data as any)?.file_path || '',
      change_id: r.data?.change_id,
      timestamp: r.data?.timestamp,
      success: r.success,
      error: r.error
    }))
  };
}
