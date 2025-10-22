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
import { validateChangeType } from '../utils/validators.js';
import { buildWhereClause, type FilterCondition } from '../utils/query-builder.js';
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
  validateChangeType(params.change_type);
  const changeTypeInt = STRING_TO_CHANGE_TYPE[params.change_type];

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
 * @param db - Optional database instance (for testing)
 * @returns Success response with change ID and timestamp
 */
export function recordFileChange(params: RecordFileChangeParams, db?: Database): RecordFileChangeResponse {
  const actualDb = db ?? getDatabase();

  // Cleanup old file changes before inserting new one
  performAutoCleanup(actualDb);

  try {
    return recordFileChangeInternal(params, actualDb);
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
 * @param db - Optional database instance (for testing)
 * @returns Array of file changes with metadata
 */
export function getFileChanges(params: GetFileChangesParams, db?: Database): GetFileChangesResponse {
  const actualDb = db ?? getDatabase();

  try {
    const limit = params.limit || DEFAULT_QUERY_LIMIT;

    // Build filter conditions using query builder
    const filterConditions: FilterCondition[] = [];

    if (params.file_path) {
      filterConditions.push({ type: 'equals', field: 'f.path', value: params.file_path });
    }

    if (params.agent_name) {
      filterConditions.push({ type: 'equals', field: 'a.name', value: params.agent_name });
    }

    if (params.layer) {
      // Validate layer
      if (!STANDARD_LAYERS.includes(params.layer as any)) {
        throw new Error(
          `Invalid layer: ${params.layer}. Must be one of: ${STANDARD_LAYERS.join(', ')}`
        );
      }
      filterConditions.push({ type: 'equals', field: 'l.name', value: params.layer });
    }

    if (params.change_type) {
      validateChangeType(params.change_type);
      const changeTypeInt = STRING_TO_CHANGE_TYPE[params.change_type];
      filterConditions.push({ type: 'equals', field: 'fc.change_type', value: changeTypeInt });
    }

    if (params.since) {
      // Convert ISO 8601 to Unix epoch
      const sinceEpoch = Math.floor(new Date(params.since).getTime() / 1000);
      filterConditions.push({ type: 'greaterThanOrEqual', field: 'fc.ts', value: sinceEpoch });
    }

    // Use view if no specific filters (token efficient)
    if (filterConditions.length === 0) {
      const stmt = actualDb.prepare(`
        SELECT * FROM v_recent_file_changes
        LIMIT ?
      `);

      const rows = stmt.all(limit) as RecentFileChange[];

      return {
        changes: rows,
        count: rows.length,
      };
    }

    // Build WHERE clause using query builder
    const { whereClause, params: queryParams } = buildWhereClause(filterConditions);

    const stmt = actualDb.prepare(`
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
      WHERE 1=1${whereClause}
      ORDER BY fc.ts DESC
      LIMIT ?
    `);

    queryParams.push(limit);
    const rows = stmt.all(...queryParams) as RecentFileChange[];

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
 * @param db - Optional database instance (for testing)
 * @returns Lock status with details
 */
export function checkFileLock(params: CheckFileLockParams, db?: Database): CheckFileLockResponse {
  const actualDb = db ?? getDatabase();

  try {
    const lockDuration = params.lock_duration || 300; // Default 5 minutes
    const currentTime = Math.floor(Date.now() / 1000);
    const lockThreshold = currentTime - lockDuration;

    // Get the most recent change to this file
    const stmt = actualDb.prepare(`
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
 * @param db - Optional database instance (for testing)
 * @returns Response with success status and detailed results for each item
 */
export function recordFileChangeBatch(params: RecordFileChangeBatchParams, db?: Database): RecordFileChangeBatchResponse {
  const actualDb = db ?? getDatabase();

  // Validate required parameters
  if (!params.file_changes || !Array.isArray(params.file_changes)) {
    throw new Error('Parameter "file_changes" is required and must be an array');
  }

  // Cleanup old file changes before processing batch
  performAutoCleanup(actualDb);

  const atomic = params.atomic !== undefined ? params.atomic : true;

  // Use processBatch utility
  const batchResult = processBatch(
    actualDb,
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

/**
 * Help action for file tool
 */
export function fileHelp(): any {
  return {
    tool: 'file',
    description: 'Track file changes across agents with layer classification',
    note: '💡 TIP: Use action: "example" to see comprehensive usage scenarios and real-world examples for all file tracking actions.',
    actions: {
      record: 'Record file change. Params: file_path (required), agent_name (required), change_type (required), layer, description',
      get: 'Get file changes. Params: file_path, agent_name, layer, change_type, since, limit',
      check_lock: 'Check if file locked. Params: file_path (required), lock_duration',
      record_batch: 'Batch record file changes (FR-005). Params: file_changes (required, array of RecordFileChangeParams, max: 50), atomic (optional, boolean, default: true). Returns: {success, inserted, failed, results}. ATOMIC MODE (atomic: true): All file changes succeed or all fail as a single transaction. IF ANY record fails, entire batch is rolled back and error is thrown. NON-ATOMIC MODE (atomic: false): Each file change is processed independently. If some fail, others still succeed. Returns partial results with per-item success/error status. RECOMMENDATION FOR AI AGENTS: Use atomic:false by default for best-effort recording. Use atomic:true only when all-or-nothing guarantee is required. 52% token reduction vs individual calls.'
    },
    examples: {
      record: '{ action: "record", file_path: "src/index.ts", agent_name: "refactor-bot", change_type: "modified", layer: "infrastructure" }',
      get: '{ action: "get", agent_name: "refactor-bot", layer: "infrastructure", limit: 10 }',
      check_lock: '{ action: "check_lock", file_path: "src/index.ts", lock_duration: 300 }',
      record_batch: '{ action: "record_batch", file_changes: [{"file_path": "src/types.ts", "agent_name": "bot1", "change_type": "modified", "layer": "data"}, {"file_path": "src/index.ts", "agent_name": "bot1", "change_type": "modified", "layer": "infrastructure"}], atomic: true }'
    },
    documentation: {
      workflows: 'docs/WORKFLOWS.md - File locking patterns, concurrent file access workflows (602 lines, ~30k tokens)',
      tool_reference: 'docs/TOOL_REFERENCE.md - File tool parameters, batch operations (471 lines, ~24k tokens)',
      shared_concepts: 'docs/SHARED_CONCEPTS.md - Layer definitions, enum values (change_type), atomic mode (339 lines, ~17k tokens)',
      best_practices: 'docs/BEST_PRACTICES.md - File tracking best practices (345 lines, ~17k tokens)'
    }
  };
}

/**
 * Example action for file tool
 */
export function fileExample(): any {
  return {
    tool: 'file',
    description: 'Comprehensive file tracking examples for multi-agent coordination',
    scenarios: {
      basic_tracking: {
        title: 'Basic File Change Tracking',
        examples: [
          {
            scenario: 'Record file modification',
            request: '{ action: "record", file_path: "src/api/users.ts", agent_name: "refactor-agent", change_type: "modified", layer: "business", description: "Added email validation" }',
            explanation: 'Track changes with layer and description'
          },
          {
            scenario: 'Get recent changes by agent',
            request: '{ action: "get", agent_name: "refactor-agent", limit: 10 }',
            explanation: 'View what an agent has been working on'
          },
          {
            scenario: 'Track changes to specific file',
            request: '{ action: "get", file_path: "src/api/users.ts" }',
            explanation: 'See all modifications to a particular file'
          }
        ]
      },
      file_locking: {
        title: 'Concurrent Access Prevention',
        workflow: [
          {
            step: 1,
            action: 'Check if file is locked',
            request: '{ action: "check_lock", file_path: "src/database/schema.sql", lock_duration: 300 }',
            result: '{ locked: false } or { locked: true, locked_by: "agent-name", locked_at: "timestamp" }'
          },
          {
            step: 2,
            action: 'If not locked, record change (creates lock)',
            request: '{ action: "record", file_path: "src/database/schema.sql", agent_name: "migration-agent", change_type: "modified" }'
          },
          {
            step: 3,
            action: 'Lock expires after 5 minutes (default) or specified duration'
          }
        ]
      },
      layer_organization: {
        title: 'Tracking by Architecture Layer',
        examples: [
          {
            scenario: 'Get all presentation layer changes',
            request: '{ action: "get", layer: "presentation", limit: 20 }',
            explanation: 'View frontend/UI changes across agents'
          },
          {
            scenario: 'Track infrastructure changes',
            request: '{ action: "get", layer: "infrastructure", change_type: "modified" }',
            explanation: 'Monitor config and deployment file changes'
          }
        ]
      },
      batch_tracking: {
        title: 'Batch File Operations',
        examples: [
          {
            scenario: 'Record multiple file changes atomically',
            request: '{ action: "record_batch", file_changes: [{"file_path": "src/api.ts", "agent_name": "bot1", "change_type": "modified", "layer": "presentation"}, {"file_path": "src/types.ts", "agent_name": "bot1", "change_type": "modified", "layer": "data"}], atomic: true }',
            explanation: 'All changes recorded or none (transaction)'
          }
        ]
      }
    },
    best_practices: {
      change_tracking: [
        'Always specify layer for better organization',
        'Include description for non-obvious changes',
        'Use check_lock before modifying shared files',
        'Track both creation and deletion of files'
      ],
      lock_management: [
        'Default lock duration is 300 seconds (5 minutes)',
        'Locks prevent concurrent modifications',
        'Locks auto-expire - no manual unlock needed',
        'Use appropriate lock_duration for operation complexity'
      ],
      layer_assignment: [
        'presentation: UI components, API controllers',
        'business: Services, domain logic',
        'data: Models, repositories, migrations',
        'infrastructure: Config, deployment, CI/CD',
        'cross-cutting: Utilities used across layers'
      ]
    }
  };
}
