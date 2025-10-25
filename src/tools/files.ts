/**
 * File tracking tools for MCP Shared Context Server
 * Provides file change tracking with layer integration and lock detection
 *
 * CONVERTED: Using Knex.js with DatabaseAdapter (async/await)
 */

import { DatabaseAdapter } from '../adapters/index.js';
import {
  getAdapter,
  getOrCreateFile,
  getOrCreateAgent,
  getLayerId
} from '../database.js';
import {
  STRING_TO_CHANGE_TYPE,
  CHANGE_TYPE_TO_STRING,
  STANDARD_LAYERS,
  DEFAULT_QUERY_LIMIT
} from '../constants.js';
import { validateChangeType } from '../utils/validators.js';
import { buildWhereClause, type FilterCondition } from '../utils/query-builder.js';
import { logFileRecord } from '../utils/activity-logging.js';
import { Knex } from 'knex';
import type {
  RecordFileChangeParams,
  RecordFileChangeResponse,
  GetFileChangesParams,
  GetFileChangesResponse,
  CheckFileLockParams,
  CheckFileLockResponse,
  RecentFileChange,
  RecordFileChangeBatchParams,
  RecordFileChangeBatchResponse
} from '../types.js';

/**
 * Internal helper: Record file change without transaction wrapper
 * Used by recordFileChange (with transaction) and recordFileChangeBatch (manages its own transaction)
 *
 * @param params - File change parameters
 * @param adapter - Database adapter instance
 * @param trx - Optional transaction
 * @returns Success response with change ID and timestamp
 */
async function recordFileChangeInternal(
  params: RecordFileChangeParams,
  adapter: DatabaseAdapter,
  trx?: Knex.Transaction
): Promise<RecordFileChangeResponse> {
  const knex = trx || adapter.getKnex();

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
    layerId = await getLayerId(adapter, params.layer, trx);
    if (layerId === null) {
      throw new Error(`Layer not found: ${params.layer}`);
    }
  }

  // Auto-register file and agent
  const fileId = await getOrCreateFile(adapter, params.file_path, trx);
  const agentId = await getOrCreateAgent(adapter, params.agent_name, trx);

  // Current timestamp
  const ts = Math.floor(Date.now() / 1000);

  // Insert file change record
  const [changeId] = await knex('t_file_changes').insert({
    file_id: fileId,
    agent_id: agentId,
    layer_id: layerId,
    change_type: changeTypeInt,
    description: params.description || null,
    ts: ts
  });

  // Activity logging (replaces trigger)
  await logFileRecord(knex, {
    file_path: params.file_path,
    change_type: changeTypeInt,
    agent_id: agentId,
    layer_id: layerId || undefined
  });

  const timestamp = new Date(ts * 1000).toISOString();

  return {
    success: true,
    change_id: Number(changeId),
    timestamp: timestamp,
  };
}

/**
 * Record a file change with optional layer assignment and description.
 * Auto-registers the file and agent if they don't exist.
 *
 * @param params - File change parameters
 * @param adapter - Optional database adapter (for testing)
 * @returns Success response with change ID and timestamp
 */
export async function recordFileChange(
  params: RecordFileChangeParams,
  adapter?: DatabaseAdapter
): Promise<RecordFileChangeResponse> {
  const actualAdapter = adapter ?? getAdapter();

  try {
    // Use transaction for atomicity
    return await actualAdapter.transaction(async (trx) => {
      return await recordFileChangeInternal(params, actualAdapter, trx);
    });
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
 * @param adapter - Optional database adapter (for testing)
 * @returns Array of file changes with metadata
 */
export async function getFileChanges(
  params: GetFileChangesParams = {},
  adapter?: DatabaseAdapter
): Promise<GetFileChangesResponse> {
  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

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
      const rows = await knex('v_recent_file_changes')
        .limit(limit)
        .select('*') as RecentFileChange[];

      return {
        changes: rows,
        count: rows.length,
      };
    }

    // Build WHERE clause using query builder
    const { whereClause, params: queryParams } = buildWhereClause(filterConditions);

    // Build query dynamically with filters
    let query = knex('t_file_changes as fc')
      .join('m_files as f', 'fc.file_id', 'f.id')
      .join('m_agents as a', 'fc.agent_id', 'a.id')
      .leftJoin('m_layers as l', 'fc.layer_id', 'l.id')
      .select(
        'f.path',
        'a.name as changed_by',
        'l.name as layer',
        knex.raw(`CASE fc.change_type
          WHEN 1 THEN 'created'
          WHEN 2 THEN 'modified'
          ELSE 'deleted'
        END as change_type`),
        'fc.description',
        knex.raw(`datetime(fc.ts, 'unixepoch') as changed_at`)
      )
      .orderBy('fc.ts', 'desc')
      .limit(limit);

    // Apply filter conditions
    if (params.file_path) {
      query = query.where('f.path', params.file_path);
    }

    if (params.agent_name) {
      query = query.where('a.name', params.agent_name);
    }

    if (params.layer) {
      query = query.where('l.name', params.layer);
    }

    if (params.change_type) {
      const changeTypeInt = STRING_TO_CHANGE_TYPE[params.change_type];
      query = query.where('fc.change_type', changeTypeInt);
    }

    if (params.since) {
      const sinceEpoch = Math.floor(new Date(params.since).getTime() / 1000);
      query = query.where('fc.ts', '>=', sinceEpoch);
    }

    const rows = await query as RecentFileChange[];

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
 * @param adapter - Optional database adapter (for testing)
 * @returns Lock status with details
 */
export async function checkFileLock(
  params: CheckFileLockParams,
  adapter?: DatabaseAdapter
): Promise<CheckFileLockResponse> {
  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  try {
    const lockDuration = params.lock_duration || 300; // Default 5 minutes
    const currentTime = Math.floor(Date.now() / 1000);
    const lockThreshold = currentTime - lockDuration;

    // Get the most recent change to this file
    const result = await knex('t_file_changes as fc')
      .join('m_files as f', 'fc.file_id', 'f.id')
      .join('m_agents as a', 'fc.agent_id', 'a.id')
      .where('f.path', params.file_path)
      .select('a.name as agent', 'fc.change_type', 'fc.ts')
      .orderBy('fc.ts', 'desc')
      .limit(1)
      .first() as { agent: string; change_type: number; ts: number } | undefined;

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
 * @param adapter - Optional database adapter (for testing)
 * @returns Response with success status and detailed results for each item
 */
export async function recordFileChangeBatch(
  params: RecordFileChangeBatchParams,
  adapter?: DatabaseAdapter
): Promise<RecordFileChangeBatchResponse> {
  const actualAdapter = adapter ?? getAdapter();

  // Validate required parameters
  if (!params.file_changes || !Array.isArray(params.file_changes)) {
    throw new Error('Parameter "file_changes" is required and must be an array');
  }

  if (params.file_changes.length === 0) {
    return {
      success: true,
      inserted: 0,
      failed: 0,
      results: []
    };
  }

  if (params.file_changes.length > 50) {
    throw new Error('Parameter "file_changes" must contain at most 50 items');
  }

  const atomic = params.atomic !== undefined ? params.atomic : true;

  try {
    if (atomic) {
      // Atomic mode: All or nothing
      const results = await actualAdapter.transaction(async (trx) => {
        const processedResults = [];

        for (const fileChange of params.file_changes) {
          try {
            const result = await recordFileChangeInternal(fileChange, actualAdapter, trx);
            processedResults.push({
              file_path: fileChange.file_path,
              change_id: result.change_id,
              timestamp: result.timestamp,
              success: true,
              error: undefined
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Batch failed at file "${fileChange.file_path}": ${message}`);
          }
        }

        return processedResults;
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

      for (const fileChange of params.file_changes) {
        try {
          const result = await actualAdapter.transaction(async (trx) => {
            return await recordFileChangeInternal(fileChange, actualAdapter, trx);
          });

          results.push({
            file_path: fileChange.file_path,
            change_id: result.change_id,
            timestamp: result.timestamp,
            success: true,
            error: undefined
          });
          inserted++;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          results.push({
            file_path: fileChange.file_path,
            change_id: undefined,
            timestamp: undefined,
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
