/**
 * Task management tools for Kanban Task Watcher
 * Implements create, update, get, list, move, link, archive, batch_create actions
 *
 * CONVERTED: Using Knex.js with DatabaseAdapter (async/await)
 */

import { DatabaseAdapter } from '../adapters/index.js';
import {
  getAdapter,
  getOrCreateAgent,
  getOrCreateTag,
  getOrCreateContextKey,
  getLayerId,
  getOrCreateFile
} from '../database.js';
import { detectAndTransitionStaleTasks, autoArchiveOldDoneTasks, detectAndCompleteReviewedTasks, detectAndArchiveOnCommit } from '../utils/task-stale-detection.js';
import { FileWatcher } from '../watcher/index.js';
import {
  validatePriorityRange,
  validateLength,
  validateRange
} from '../utils/validators.js';
import { Knex } from 'knex';
import {
  logTaskCreate,
  logTaskStatusChange
} from '../utils/activity-logging.js';
import { parseStringArray } from '../utils/param-parser.js';
import { validateActionParams, validateBatchParams } from '../utils/parameter-validator.js';
import { debugLog } from '../utils/debug-logger.js';

/**
 * Task status enum (matches m_task_statuses)
 */
const TASK_STATUS = {
  TODO: 1,
  IN_PROGRESS: 2,
  WAITING_REVIEW: 3,
  BLOCKED: 4,
  DONE: 5,
  ARCHIVED: 6,
} as const;

/**
 * Task status name mapping
 */
const STATUS_TO_ID: Record<string, number> = {
  'todo': TASK_STATUS.TODO,
  'in_progress': TASK_STATUS.IN_PROGRESS,
  'waiting_review': TASK_STATUS.WAITING_REVIEW,
  'blocked': TASK_STATUS.BLOCKED,
  'done': TASK_STATUS.DONE,
  'archived': TASK_STATUS.ARCHIVED,
};

const ID_TO_STATUS: Record<number, string> = {
  [TASK_STATUS.TODO]: 'todo',
  [TASK_STATUS.IN_PROGRESS]: 'in_progress',
  [TASK_STATUS.WAITING_REVIEW]: 'waiting_review',
  [TASK_STATUS.BLOCKED]: 'blocked',
  [TASK_STATUS.DONE]: 'done',
  [TASK_STATUS.ARCHIVED]: 'archived',
};

/**
 * Valid status transitions
 */
const VALID_TRANSITIONS: Record<number, number[]> = {
  [TASK_STATUS.TODO]: [TASK_STATUS.IN_PROGRESS, TASK_STATUS.BLOCKED],
  [TASK_STATUS.IN_PROGRESS]: [TASK_STATUS.WAITING_REVIEW, TASK_STATUS.BLOCKED, TASK_STATUS.DONE],
  [TASK_STATUS.WAITING_REVIEW]: [TASK_STATUS.IN_PROGRESS, TASK_STATUS.TODO, TASK_STATUS.DONE],
  [TASK_STATUS.BLOCKED]: [TASK_STATUS.TODO, TASK_STATUS.IN_PROGRESS],
  [TASK_STATUS.DONE]: [TASK_STATUS.ARCHIVED],
  [TASK_STATUS.ARCHIVED]: [], // No transitions from archived
};

/**
 * Internal helper: Create task without wrapping in transaction
 * Used by createTask (with transaction) and batchCreateTasks (manages its own transaction)
 *
 * @param params - Task parameters
 * @param adapter - Database adapter instance
 * @param trx - Optional transaction
 * @returns Response with success status and task metadata
 */
async function createTaskInternal(params: {
  title: string;
  description?: string;
  acceptance_criteria?: string | any[];  // Can be string or array of AcceptanceCheck objects
  notes?: string;
  priority?: number;
  assigned_agent?: string;
  created_by_agent?: string;
  layer?: string;
  tags?: string[];
  status?: string;
  watch_files?: string[];  // Array of file paths to watch (v3.4.1)
}, adapter: DatabaseAdapter, trx?: Knex.Transaction): Promise<any> {
  const knex = trx || adapter.getKnex();

  // Validate priority
  const priority = params.priority !== undefined ? params.priority : 2;
  validatePriorityRange(priority);

  // Get status_id
  const status = params.status || 'todo';
  const statusId = STATUS_TO_ID[status];
  if (!statusId) {
    throw new Error(`Invalid status: ${status}. Must be one of: todo, in_progress, waiting_review, blocked, done, archived`);
  }

  // Validate layer if provided
  let layerId: number | null = null;
  if (params.layer) {
    layerId = await getLayerId(adapter, params.layer, trx);
    if (layerId === null) {
      throw new Error(`Invalid layer: ${params.layer}. Must be one of: presentation, business, data, infrastructure, cross-cutting`);
    }
  }

  // Get or create agents
  let assignedAgentId: number | null = null;
  if (params.assigned_agent) {
    assignedAgentId = await getOrCreateAgent(adapter, params.assigned_agent, trx);
  }

  // Default to generic agent pool if no created_by_agent provided
  // Empty string triggers allocation from generic-N pool
  const createdBy = params.created_by_agent || '';
  const createdByAgentId = await getOrCreateAgent(adapter, createdBy, trx);

  // Insert task
  const now = Math.floor(Date.now() / 1000);
  const [taskId] = await knex('t_tasks').insert({
    title: params.title,
    status_id: statusId,
    priority: priority,
    assigned_agent_id: assignedAgentId,
    created_by_agent_id: createdByAgentId,
    layer_id: layerId,
    created_ts: now,
    updated_ts: now
  });

  // Process acceptance_criteria (can be string, JSON string, or array)
  let acceptanceCriteriaString: string | null = null;
  let acceptanceCriteriaJson: string | null = null;

  if (params.acceptance_criteria) {
    if (Array.isArray(params.acceptance_criteria)) {
      // Array format - store as JSON in acceptance_criteria_json
      acceptanceCriteriaJson = JSON.stringify(params.acceptance_criteria);
      // Also create human-readable summary in acceptance_criteria
      acceptanceCriteriaString = params.acceptance_criteria
        .map((check: any, i: number) => `${i + 1}. ${check.type}: ${check.command || check.file || check.pattern || ''}`)
        .join('\n');
    } else if (typeof params.acceptance_criteria === 'string') {
      // Try to parse as JSON first
      try {
        const parsed = JSON.parse(params.acceptance_criteria);
        if (Array.isArray(parsed)) {
          // It's a JSON array string - store in JSON field
          acceptanceCriteriaJson = params.acceptance_criteria;
          // Also create human-readable summary
          acceptanceCriteriaString = parsed
            .map((check: any, i: number) => `${i + 1}. ${check.type}: ${check.command || check.file || check.pattern || ''}`)
            .join('\n');
        } else {
          // Valid JSON but not an array - store as plain text
          acceptanceCriteriaString = params.acceptance_criteria;
        }
      } catch {
        // Not valid JSON - store as plain text
        acceptanceCriteriaString = params.acceptance_criteria;
      }
    }
  }

  // Insert task details if provided
  if (params.description || acceptanceCriteriaString || acceptanceCriteriaJson || params.notes) {
    await knex('t_task_details').insert({
      task_id: Number(taskId),
      description: params.description || null,
      acceptance_criteria: acceptanceCriteriaString,
      acceptance_criteria_json: acceptanceCriteriaJson,
      notes: params.notes || null
    });
  }

  // Insert tags if provided
  if (params.tags && params.tags.length > 0) {
    // Parse tags - handle MCP SDK converting JSON string to char array
    let tagsParsed: string[];

    if (typeof params.tags === 'string') {
      // String - try to parse as JSON
      try {
        tagsParsed = JSON.parse(params.tags);
      } catch {
        // If not valid JSON, treat as single tag name
        tagsParsed = [params.tags];
      }
    } else if (Array.isArray(params.tags)) {
      // Check if it's an array of single characters (MCP SDK bug)
      // Example: ['[', '"', 't', 'e', 's', 't', 'i', 'n', 'g', '"', ']']
      if (params.tags.every((item: any) => typeof item === 'string' && item.length === 1)) {
        // Join characters back into string and parse JSON
        const jsonString = params.tags.join('');
        try {
          tagsParsed = JSON.parse(jsonString);
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          throw new Error(`Invalid tags format: ${jsonString}. ${errMsg}`);
        }
      } else {
        // Normal array of tag names
        tagsParsed = params.tags;
      }
    } else {
      throw new Error('Parameter "tags" must be a string or array');
    }

    for (const tagName of tagsParsed) {
      const tagId = await getOrCreateTag(adapter, tagName, trx);
      await knex('t_task_tags').insert({
        task_id: Number(taskId),
        tag_id: tagId
      }).onConflict(['task_id', 'tag_id']).ignore();
    }
  }

  // Activity logging (replaces triggers)
  await logTaskCreate(knex, {
    task_id: Number(taskId),
    title: params.title,
    agent_id: createdByAgentId,
    layer_id: layerId || undefined
  });

  // Link files and register with watcher if watch_files provided (v3.4.1)
  if (params.watch_files && params.watch_files.length > 0) {
    // Parse watch_files - handle MCP SDK converting JSON string to char array
    let watchFilesParsed: string[];

    if (typeof params.watch_files === 'string') {
      // String - try to parse as JSON
      try {
        watchFilesParsed = JSON.parse(params.watch_files);
      } catch {
        // If not valid JSON, treat as single file path
        watchFilesParsed = [params.watch_files];
      }
    } else if (Array.isArray(params.watch_files)) {
      // Check if it's an array of single characters (MCP SDK bug)
      // Example: ['[', '"', 'f', 'i', 'l', 'e', '.', 't', 'x', 't', '"', ']']
      if (params.watch_files.every((item: any) => typeof item === 'string' && item.length === 1)) {
        // Join characters back into string and parse JSON
        const jsonString = params.watch_files.join('');
        try {
          watchFilesParsed = JSON.parse(jsonString);
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          throw new Error(`Invalid watch_files format: ${jsonString}. ${errMsg}`);
        }
      } else {
        // Normal array of file paths
        watchFilesParsed = params.watch_files;
      }
    } else {
      throw new Error('Parameter "watch_files" must be a string or array');
    }

    for (const filePath of watchFilesParsed) {
      const fileId = await getOrCreateFile(adapter, filePath, trx);
      await knex('t_task_file_links').insert({
        task_id: Number(taskId),
        file_id: fileId
      }).onConflict(['task_id', 'file_id']).ignore();
    }

    // Register files with watcher for auto-tracking
    try {
      const watcher = FileWatcher.getInstance();
      for (const filePath of watchFilesParsed) {
        watcher.registerFile(filePath, Number(taskId), params.title, status);
      }
    } catch (error) {
      // Watcher may not be initialized yet, ignore
      debugLog('WARN', 'Could not register files with watcher', { error });
    }
  }

  return {
    success: true,
    task_id: Number(taskId),
    title: params.title,
    status: status,
    message: `Task "${params.title}" created successfully`
  };
}

/**
 * Create a new task
 */
export async function createTask(params: {
  title: string;
  description?: string;
  acceptance_criteria?: string | any[];  // Can be string or array of AcceptanceCheck objects
  notes?: string;
  priority?: number;
  assigned_agent?: string;
  created_by_agent?: string;
  layer?: string;
  tags?: string[];
  status?: string;
  watch_files?: string[];  // Array of file paths to watch (v3.4.1)
}, adapter?: DatabaseAdapter): Promise<any> {
  validateActionParams('task', 'create', params);

  const actualAdapter = adapter ?? getAdapter();

  // Validate required parameters
  if (!params.title || params.title.trim() === '') {
    throw new Error('Parameter "title" is required and cannot be empty');
  }

  validateLength(params.title, 'Parameter "title"', 200);

  try {
    return await actualAdapter.transaction(async (trx) => {
      return await createTaskInternal(params, actualAdapter, trx);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to create task: ${message}`);
  }
}

/**
 * Update task metadata
 */
export async function updateTask(params: {
  task_id: number;
  title?: string;
  priority?: number;
  assigned_agent?: string;
  layer?: string;
  description?: string;
  acceptance_criteria?: string | any[];  // Can be string or array of AcceptanceCheck objects
  notes?: string;
  watch_files?: string[];  // Array of file paths to watch (v3.4.1)
}, adapter?: DatabaseAdapter): Promise<any> {
  validateActionParams('task', 'update', params);

  const actualAdapter = adapter ?? getAdapter();

  // Validate required parameters
  if (!params.task_id) {
    throw new Error('Parameter "task_id" is required');
  }

  try {
    return await actualAdapter.transaction(async (trx) => {
      const knex = actualAdapter.getKnex();

      // Check if task exists
      const taskExists = await trx('t_tasks').where({ id: params.task_id }).first();
      if (!taskExists) {
        throw new Error(`Task with id ${params.task_id} not found`);
      }

      // Build update data dynamically
      const updateData: any = {};

      if (params.title !== undefined) {
        if (params.title.trim() === '') {
          throw new Error('Parameter "title" cannot be empty');
        }
        validateLength(params.title, 'Parameter "title"', 200);
        updateData.title = params.title;
      }

      if (params.priority !== undefined) {
        validatePriorityRange(params.priority);
        updateData.priority = params.priority;
      }

      if (params.assigned_agent !== undefined) {
        const agentId = await getOrCreateAgent(actualAdapter, params.assigned_agent, trx);
        updateData.assigned_agent_id = agentId;
      }

      if (params.layer !== undefined) {
        const layerId = await getLayerId(actualAdapter, params.layer, trx);
        if (layerId === null) {
          throw new Error(`Invalid layer: ${params.layer}. Must be one of: presentation, business, data, infrastructure, cross-cutting`);
        }
        updateData.layer_id = layerId;
      }

      // Update t_tasks if any updates
      if (Object.keys(updateData).length > 0) {
        await trx('t_tasks')
          .where({ id: params.task_id })
          .update(updateData);

        // TODO: Add activity logging for updates if needed
      }

      // Update t_task_details if any detail fields provided
      if (params.description !== undefined || params.acceptance_criteria !== undefined || params.notes !== undefined) {
        // Process acceptance_criteria (can be string or array)
        let acceptanceCriteriaString: string | null | undefined = undefined;
        let acceptanceCriteriaJson: string | null | undefined = undefined;

        if (params.acceptance_criteria !== undefined) {
          if (Array.isArray(params.acceptance_criteria)) {
            // Array format - store as JSON in acceptance_criteria_json
            acceptanceCriteriaJson = JSON.stringify(params.acceptance_criteria);
            // Also create human-readable summary in acceptance_criteria
            acceptanceCriteriaString = params.acceptance_criteria
              .map((check: any, i: number) => `${i + 1}. ${check.type}: ${check.command || check.file || check.pattern || ''}`)
              .join('\n');
          } else if (typeof params.acceptance_criteria === 'string') {
            // Try to parse as JSON first
            try {
              const parsed = JSON.parse(params.acceptance_criteria);
              if (Array.isArray(parsed)) {
                // It's a JSON array string - store in JSON field
                acceptanceCriteriaJson = params.acceptance_criteria;
                // Also create human-readable summary
                acceptanceCriteriaString = parsed
                  .map((check: any, i: number) => `${i + 1}. ${check.type}: ${check.command || check.file || check.pattern || ''}`)
                  .join('\n');
              } else {
                // Valid JSON but not an array - store as plain text
                acceptanceCriteriaString = params.acceptance_criteria || null;
                acceptanceCriteriaJson = null;
              }
            } catch {
              // Not valid JSON - store as plain text
              acceptanceCriteriaString = params.acceptance_criteria || null;
              acceptanceCriteriaJson = null;
            }
          }
        }

        // Check if details exist
        const detailsExist = await trx('t_task_details').where({ task_id: params.task_id }).first();

        const detailsUpdate: any = {};
        if (params.description !== undefined) {
          detailsUpdate.description = params.description || null;
        }
        if (acceptanceCriteriaString !== undefined) {
          detailsUpdate.acceptance_criteria = acceptanceCriteriaString;
        }
        if (acceptanceCriteriaJson !== undefined) {
          detailsUpdate.acceptance_criteria_json = acceptanceCriteriaJson;
        }
        if (params.notes !== undefined) {
          detailsUpdate.notes = params.notes || null;
        }

        if (detailsExist && Object.keys(detailsUpdate).length > 0) {
          // Update existing details
          await trx('t_task_details')
            .where({ task_id: params.task_id })
            .update(detailsUpdate);
        } else if (!detailsExist) {
          // Insert new details
          await trx('t_task_details').insert({
            task_id: params.task_id,
            description: params.description || null,
            acceptance_criteria: acceptanceCriteriaString !== undefined ? acceptanceCriteriaString : null,
            acceptance_criteria_json: acceptanceCriteriaJson !== undefined ? acceptanceCriteriaJson : null,
            notes: params.notes || null
          });
        }
      }

      // Handle watch_files if provided (v3.4.1)
      if (params.watch_files && params.watch_files.length > 0) {
        // Parse watch_files - handle MCP SDK converting JSON string to char array
        let watchFilesParsed: string[];

        if (typeof params.watch_files === 'string') {
          // String - try to parse as JSON
          try {
            watchFilesParsed = JSON.parse(params.watch_files);
          } catch {
            // If not valid JSON, treat as single file path
            watchFilesParsed = [params.watch_files];
          }
        } else if (Array.isArray(params.watch_files)) {
          // Check if it's an array of single characters (MCP SDK bug)
          if (params.watch_files.every((item: any) => typeof item === 'string' && item.length === 1)) {
            // Join characters back into string and parse JSON
            const jsonString = params.watch_files.join('');
            try {
              watchFilesParsed = JSON.parse(jsonString);
            } catch {
              throw new Error(`Invalid watch_files format: ${jsonString}`);
            }
          } else {
            // Normal array of file paths
            watchFilesParsed = params.watch_files;
          }
        } else {
          throw new Error('Parameter "watch_files" must be a string or array');
        }

        for (const filePath of watchFilesParsed) {
          const fileId = await getOrCreateFile(actualAdapter, filePath, trx);
          await trx('t_task_file_links').insert({
            task_id: params.task_id,
            file_id: fileId
          }).onConflict(['task_id', 'file_id']).ignore();
        }

        // Register files with watcher for auto-tracking
        try {
          const taskData = await trx('t_tasks as t')
            .join('m_task_statuses as s', 't.status_id', 's.id')
            .where('t.id', params.task_id)
            .select('t.title', 's.name as status')
            .first() as { title: string; status: string } | undefined;

          if (taskData) {
            const watcher = FileWatcher.getInstance();
            for (const filePath of watchFilesParsed) {
              watcher.registerFile(filePath, params.task_id, taskData.title, taskData.status);
            }
          }
        } catch (error) {
          // Watcher may not be initialized yet, ignore
          debugLog('WARN', 'Could not register files with watcher', { error });
        }
      }

      return {
        success: true,
        task_id: params.task_id,
        message: `Task ${params.task_id} updated successfully`
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to update task: ${message}`);
  }
}

/**
 * Internal helper: Query task dependencies (used by getTask and getDependencies)
 */
async function queryTaskDependencies(adapter: DatabaseAdapter, taskId: number, includeDetails: boolean = false): Promise<{ blockers: any[], blocking: any[] }> {
  const knex = adapter.getKnex();

  // Build query based on include_details flag
  const selectFields = includeDetails
    ? [
        't.id',
        't.title',
        's.name as status',
        't.priority',
        'aa.name as assigned_to',
        't.created_ts',
        't.updated_ts',
        'td.description'
      ]
    : [
        't.id',
        't.title',
        's.name as status',
        't.priority'
      ];

  // Get blockers (tasks that block this task)
  let blockersQuery = knex('t_tasks as t')
    .join('t_task_dependencies as d', 't.id', 'd.blocker_task_id')
    .leftJoin('m_task_statuses as s', 't.status_id', 's.id')
    .leftJoin('m_agents as aa', 't.assigned_agent_id', 'aa.id')
    .where('d.blocked_task_id', taskId)
    .select(selectFields);

  if (includeDetails) {
    blockersQuery = blockersQuery.leftJoin('t_task_details as td', 't.id', 'td.task_id');
  }

  const blockers = await blockersQuery;

  // Get blocking (tasks this task blocks)
  let blockingQuery = knex('t_tasks as t')
    .join('t_task_dependencies as d', 't.id', 'd.blocked_task_id')
    .leftJoin('m_task_statuses as s', 't.status_id', 's.id')
    .leftJoin('m_agents as aa', 't.assigned_agent_id', 'aa.id')
    .where('d.blocker_task_id', taskId)
    .select(selectFields);

  if (includeDetails) {
    blockingQuery = blockingQuery.leftJoin('t_task_details as td', 't.id', 'td.task_id');
  }

  const blocking = await blockingQuery;

  return { blockers, blocking };
}

/**
 * Get full task details
 */
export async function getTask(params: {
  task_id: number;
  include_dependencies?: boolean;
}, adapter?: DatabaseAdapter): Promise<any> {
  validateActionParams('task', 'get', params);

  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  if (!params.task_id) {
    throw new Error('Parameter "task_id" is required');
  }

  try {
    // Get task with details
    const task = await knex('t_tasks as t')
      .leftJoin('m_task_statuses as s', 't.status_id', 's.id')
      .leftJoin('m_agents as aa', 't.assigned_agent_id', 'aa.id')
      .leftJoin('m_agents as ca', 't.created_by_agent_id', 'ca.id')
      .leftJoin('m_layers as l', 't.layer_id', 'l.id')
      .leftJoin('t_task_details as td', 't.id', 'td.task_id')
      .where('t.id', params.task_id)
      .select(
        't.id',
        't.title',
        's.name as status',
        't.priority',
        'aa.name as assigned_to',
        'ca.name as created_by',
        'l.name as layer',
        't.created_ts',
        't.updated_ts',
        't.completed_ts',
        'td.description',
        'td.acceptance_criteria',
        'td.notes'
      )
      .first() as any;

    if (!task) {
      return {
        found: false,
        task_id: params.task_id
      };
    }

    // Get tags
    const tags = await knex('t_task_tags as tt')
      .join('m_tags as tg', 'tt.tag_id', 'tg.id')
      .where('tt.task_id', params.task_id)
      .select('tg.name')
      .then(rows => rows.map((row: any) => row.name));

    // Get decision links
    const decisions = await knex('t_task_decision_links as tdl')
      .join('m_context_keys as ck', 'tdl.decision_key_id', 'ck.id')
      .where('tdl.task_id', params.task_id)
      .select('ck.key', 'tdl.link_type');

    // Get constraint links
    const constraints = await knex('t_task_constraint_links as tcl')
      .join('t_constraints as c', 'tcl.constraint_id', 'c.id')
      .where('tcl.task_id', params.task_id)
      .select('c.id', 'c.constraint_text');

    // Get file links
    const files = await knex('t_task_file_links as tfl')
      .join('m_files as f', 'tfl.file_id', 'f.id')
      .where('tfl.task_id', params.task_id)
      .select('f.path')
      .then(rows => rows.map((row: any) => row.path));

    // Build result
    const result: any = {
      found: true,
      task: {
        ...task,
        tags: tags,
        linked_decisions: decisions,
        linked_constraints: constraints,
        linked_files: files
      }
    };

    // Include dependencies if requested (token-efficient, metadata-only)
    if (params.include_dependencies) {
      const deps = await queryTaskDependencies(actualAdapter, params.task_id, false);
      result.task.dependencies = {
        blockers: deps.blockers,
        blocking: deps.blocking
      };
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get task: ${message}`);
  }
}

/**
 * List tasks (token-efficient, no descriptions)
 */
export async function listTasks(params: {
  status?: string;
  assigned_agent?: string;
  layer?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
  include_dependency_counts?: boolean;
} = {}, adapter?: DatabaseAdapter): Promise<any> {
  validateActionParams('task', 'list', params);

  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  try {
    // Run auto-stale detection, git-aware completion, and auto-archive before listing
    const transitionCount = await detectAndTransitionStaleTasks(actualAdapter);
    const gitCompletedCount = await detectAndCompleteReviewedTasks(actualAdapter);
    const gitArchivedCount = await detectAndArchiveOnCommit(actualAdapter);
    const archiveCount = await autoArchiveOldDoneTasks(actualAdapter);

    // Build query with optional dependency counts
    let query;
    if (params.include_dependency_counts) {
      // Include dependency counts with LEFT JOINs
      const blockersCTE = knex('t_task_dependencies')
        .select('blocked_task_id')
        .count('* as blocked_by_count')
        .groupBy('blocked_task_id')
        .as('blockers');

      const blockingCTE = knex('t_task_dependencies')
        .select('blocker_task_id')
        .count('* as blocking_count')
        .groupBy('blocker_task_id')
        .as('blocking');

      query = knex('v_task_board as vt')
        .leftJoin(blockersCTE, 'vt.id', 'blockers.blocked_task_id')
        .leftJoin(blockingCTE, 'vt.id', 'blocking.blocker_task_id')
        .select(
          'vt.*',
          knex.raw('COALESCE(blockers.blocked_by_count, 0) as blocked_by_count'),
          knex.raw('COALESCE(blocking.blocking_count, 0) as blocking_count')
        );
    } else {
      // Standard query without dependency counts
      query = knex('v_task_board');
    }

    // Filter by status
    if (params.status) {
      if (!STATUS_TO_ID[params.status]) {
        throw new Error(`Invalid status: ${params.status}. Must be one of: todo, in_progress, waiting_review, blocked, done, archived`);
      }
      query = query.where(params.include_dependency_counts ? 'vt.status' : 'status', params.status);
    }

    // Filter by assigned agent
    if (params.assigned_agent) {
      query = query.where(params.include_dependency_counts ? 'vt.assigned_to' : 'assigned_to', params.assigned_agent);
    }

    // Filter by layer
    if (params.layer) {
      query = query.where(params.include_dependency_counts ? 'vt.layer' : 'layer', params.layer);
    }

    // Filter by tags
    if (params.tags && params.tags.length > 0) {
      // Parse tags (handles both arrays and JSON strings from MCP)
      const tags = parseStringArray(params.tags);
      for (const tag of tags) {
        query = query.where(params.include_dependency_counts ? 'vt.tags' : 'tags', 'like', `%${tag}%`);
      }
    }

    // Order by updated timestamp (most recent first)
    query = query.orderBy(params.include_dependency_counts ? 'vt.updated_ts' : 'updated_ts', 'desc');

    // Pagination
    const limit = params.limit !== undefined ? params.limit : 50;
    const offset = params.offset || 0;

    validateRange(limit, 'Parameter "limit"', 0, 100);
    validateRange(offset, 'Parameter "offset"', 0, Number.MAX_SAFE_INTEGER);

    query = query.limit(limit).offset(offset);

    // Execute query
    const rows = await query;

    return {
      tasks: rows,
      count: rows.length,
      stale_tasks_transitioned: transitionCount,
      git_auto_completed: gitCompletedCount,
      git_archived: gitArchivedCount,
      archived_tasks: archiveCount
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to list tasks: ${message}`);
  }
}

/**
 * Move task to different status
 */
export async function moveTask(params: {
  task_id: number;
  new_status: string;
}, adapter?: DatabaseAdapter): Promise<any> {
  validateActionParams('task', 'move', params);

  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  if (!params.task_id) {
    throw new Error('Parameter "task_id" is required');
  }

  if (!params.new_status) {
    throw new Error('Parameter "new_status" is required');
  }

  try {
    // Run auto-stale detection and auto-archive before move
    await detectAndTransitionStaleTasks(actualAdapter);
    await autoArchiveOldDoneTasks(actualAdapter);

    return await actualAdapter.transaction(async (trx) => {
      // Get current status
      const taskRow = await trx('t_tasks')
        .where({ id: params.task_id })
        .select('status_id')
        .first() as { status_id: number } | undefined;

      if (!taskRow) {
        throw new Error(`Task with id ${params.task_id} not found`);
      }

      const currentStatusId = taskRow.status_id;
      const newStatusId = STATUS_TO_ID[params.new_status];

      if (!newStatusId) {
        throw new Error(`Invalid new_status: ${params.new_status}. Must be one of: todo, in_progress, waiting_review, blocked, done, archived`);
      }

      // Check if transition is valid
      const validNextStatuses = VALID_TRANSITIONS[currentStatusId] || [];
      if (!validNextStatuses.includes(newStatusId)) {
        throw new Error(
          `Invalid transition from ${ID_TO_STATUS[currentStatusId]} to ${params.new_status}. ` +
          `Valid transitions: ${validNextStatuses.map(id => ID_TO_STATUS[id]).join(', ')}`
        );
      }

      // Update status
      const updateData: any = {
        status_id: newStatusId
      };

      // Set completed_ts when moving to done
      if (newStatusId === TASK_STATUS.DONE) {
        updateData.completed_ts = Math.floor(Date.now() / 1000);
      }

      await trx('t_tasks')
        .where({ id: params.task_id })
        .update(updateData);

      // Activity logging (replaces trigger)
      // Note: Using system agent (id=1) for status changes
      // In a real implementation, you'd pass the actual agent_id who made the change
      const systemAgentId = 1;
      await logTaskStatusChange(trx, {
        task_id: params.task_id,
        old_status: currentStatusId,
        new_status: newStatusId,
        agent_id: systemAgentId
      });

      // Update watcher if moving to done or archived (stop watching)
      if (params.new_status === 'done' || params.new_status === 'archived') {
        try {
          const watcher = FileWatcher.getInstance();
          watcher.unregisterTask(params.task_id);
        } catch (error) {
          // Watcher may not be initialized, ignore
        }
      }

      return {
        success: true,
        task_id: params.task_id,
        old_status: ID_TO_STATUS[currentStatusId],
        new_status: params.new_status,
        message: `Task ${params.task_id} moved from ${ID_TO_STATUS[currentStatusId]} to ${params.new_status}`
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to move task: ${message}`);
  }
}

/**
 * Link task to decision/constraint/file
 */
export async function linkTask(params: {
  task_id: number;
  link_type: 'decision' | 'constraint' | 'file';
  target_id: string | number;
  link_relation?: string;
}, adapter?: DatabaseAdapter): Promise<any> {
  validateActionParams('task', 'link', params);

  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  if (!params.task_id) {
    throw new Error('Parameter "task_id" is required');
  }

  if (!params.link_type) {
    throw new Error('Parameter "link_type" is required');
  }

  if (params.target_id === undefined || params.target_id === null) {
    throw new Error('Parameter "target_id" is required');
  }

  try {
    return await actualAdapter.transaction(async (trx) => {
      // Check if task exists
      const taskExists = await trx('t_tasks').where({ id: params.task_id }).first();
      if (!taskExists) {
        throw new Error(`Task with id ${params.task_id} not found`);
      }

      if (params.link_type === 'decision') {
        const decisionKey = String(params.target_id);
        const keyId = await getOrCreateContextKey(actualAdapter, decisionKey, trx);
        const linkRelation = params.link_relation || 'implements';

        await trx('t_task_decision_links').insert({
          task_id: params.task_id,
          decision_key_id: keyId,
          link_type: linkRelation
        }).onConflict(['task_id', 'decision_key_id']).merge();

        return {
          success: true,
          task_id: params.task_id,
          linked_to: 'decision',
          target: decisionKey,
          relation: linkRelation,
          message: `Task ${params.task_id} linked to decision "${decisionKey}"`
        };

      } else if (params.link_type === 'constraint') {
        const constraintId = Number(params.target_id);

        // Check if constraint exists
        const constraintExists = await trx('t_constraints').where({ id: constraintId }).first();
        if (!constraintExists) {
          throw new Error(`Constraint with id ${constraintId} not found`);
        }

        await trx('t_task_constraint_links').insert({
          task_id: params.task_id,
          constraint_id: constraintId
        }).onConflict(['task_id', 'constraint_id']).ignore();

        return {
          success: true,
          task_id: params.task_id,
          linked_to: 'constraint',
          target: constraintId,
          message: `Task ${params.task_id} linked to constraint ${constraintId}`
        };

      } else if (params.link_type === 'file') {
        // Deprecation warning (v3.4.1)
        debugLog('WARN', `DEPRECATION: task.link(link_type="file") is deprecated as of v3.4.1. Use task.create(watch_files=[...]) or task.update(watch_files=[...]) instead. Or use the new watch_files action: { action: "watch_files", task_id: ${params.task_id}, file_paths: ["..."] }`);

        const filePath = String(params.target_id);
        const fileId = await getOrCreateFile(actualAdapter, filePath, trx);

        await trx('t_task_file_links').insert({
          task_id: params.task_id,
          file_id: fileId
        }).onConflict(['task_id', 'file_id']).ignore();

        // Register file with watcher for auto-tracking
        try {
          const taskData = await trx('t_tasks as t')
            .join('m_task_statuses as s', 't.status_id', 's.id')
            .where('t.id', params.task_id)
            .select('t.title', 's.name as status')
            .first() as { title: string; status: string } | undefined;

          if (taskData) {
            const watcher = FileWatcher.getInstance();
            watcher.registerFile(filePath, params.task_id, taskData.title, taskData.status);
          }
        } catch (error) {
          // Watcher may not be initialized yet, ignore
          debugLog('WARN', 'Could not register file with watcher', { error });
        }

        return {
          success: true,
          task_id: params.task_id,
          linked_to: 'file',
          target: filePath,
          deprecation_warning: 'task.link(link_type="file") is deprecated. Use task.create/update(watch_files) or watch_files action instead.',
          message: `Task ${params.task_id} linked to file "${filePath}" (DEPRECATED API - use watch_files instead)`
        };

      } else {
        throw new Error(`Invalid link_type: ${params.link_type}. Must be one of: decision, constraint, file`);
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to link task: ${message}`);
  }
}

/**
 * Archive completed task
 */
export async function archiveTask(params: { task_id: number }, adapter?: DatabaseAdapter): Promise<any> {
  validateActionParams('task', 'archive', params);

  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  if (!params.task_id) {
    throw new Error('Parameter "task_id" is required');
  }

  try {
    return await actualAdapter.transaction(async (trx) => {
      // Check if task is in 'done' status
      const taskRow = await trx('t_tasks')
        .where({ id: params.task_id })
        .select('status_id')
        .first() as { status_id: number } | undefined;

      if (!taskRow) {
        throw new Error(`Task with id ${params.task_id} not found`);
      }

      if (taskRow.status_id !== TASK_STATUS.DONE) {
        throw new Error(`Task ${params.task_id} must be in 'done' status to archive (current: ${ID_TO_STATUS[taskRow.status_id]})`);
      }

      // Update to archived
      await trx('t_tasks')
        .where({ id: params.task_id })
        .update({ status_id: TASK_STATUS.ARCHIVED });

      // Activity logging
      // Note: Using system agent (id=1) for status changes
      const systemAgentId = 1;
      await logTaskStatusChange(trx, {
        task_id: params.task_id,
        old_status: TASK_STATUS.DONE,
        new_status: TASK_STATUS.ARCHIVED,
        agent_id: systemAgentId
      });

      // Unregister from file watcher (archived tasks don't need tracking)
      try {
        const watcher = FileWatcher.getInstance();
        watcher.unregisterTask(params.task_id);
      } catch (error) {
        // Watcher may not be initialized, ignore
      }

      return {
        success: true,
        task_id: params.task_id,
        message: `Task ${params.task_id} archived successfully`
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to archive task: ${message}`);
  }
}

/**
 * Add dependency (blocking relationship) between tasks
 */
export async function addDependency(params: {
  blocker_task_id: number;
  blocked_task_id: number;
}, adapter?: DatabaseAdapter): Promise<any> {
  validateActionParams('task', 'add_dependency', params);

  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  if (!params.blocker_task_id) {
    throw new Error('Parameter "blocker_task_id" is required');
  }

  if (!params.blocked_task_id) {
    throw new Error('Parameter "blocked_task_id" is required');
  }

  try {
    return await actualAdapter.transaction(async (trx) => {
      // Validation 1: No self-dependencies
      if (params.blocker_task_id === params.blocked_task_id) {
        throw new Error('Self-dependency not allowed');
      }

      // Validation 2: Both tasks must exist and check if archived
      const blockerTask = await trx('t_tasks')
        .where({ id: params.blocker_task_id })
        .select('id', 'status_id')
        .first() as { id: number; status_id: number } | undefined;

      const blockedTask = await trx('t_tasks')
        .where({ id: params.blocked_task_id })
        .select('id', 'status_id')
        .first() as { id: number; status_id: number } | undefined;

      if (!blockerTask) {
        throw new Error(`Blocker task #${params.blocker_task_id} not found`);
      }

      if (!blockedTask) {
        throw new Error(`Blocked task #${params.blocked_task_id} not found`);
      }

      // Validation 3: Neither task is archived
      if (blockerTask.status_id === TASK_STATUS.ARCHIVED) {
        throw new Error(`Cannot add dependency: Task #${params.blocker_task_id} is archived`);
      }

      if (blockedTask.status_id === TASK_STATUS.ARCHIVED) {
        throw new Error(`Cannot add dependency: Task #${params.blocked_task_id} is archived`);
      }

      // Validation 4: No direct circular (reverse relationship)
      const reverseExists = await trx('t_task_dependencies')
        .where({
          blocker_task_id: params.blocked_task_id,
          blocked_task_id: params.blocker_task_id
        })
        .first();

      if (reverseExists) {
        throw new Error(`Circular dependency detected: Task #${params.blocked_task_id} already blocks Task #${params.blocker_task_id}`);
      }

      // Validation 5: No transitive circular (check if adding this would create a cycle)
      const cycleCheck = await trx.raw(`
        WITH RECURSIVE dependency_chain AS (
          -- Start from the task that would be blocked
          SELECT blocked_task_id as task_id, 1 as depth
          FROM t_task_dependencies
          WHERE blocker_task_id = ?

          UNION ALL

          -- Follow the chain of dependencies
          SELECT d.blocked_task_id, dc.depth + 1
          FROM t_task_dependencies d
          JOIN dependency_chain dc ON d.blocker_task_id = dc.task_id
          WHERE dc.depth < 100
        )
        SELECT task_id FROM dependency_chain WHERE task_id = ?
      `, [params.blocked_task_id, params.blocker_task_id])
        .then((result: any) => result[0] as { task_id: number } | undefined);

      if (cycleCheck) {
        // Build cycle path for error message
        const cyclePathResult = await trx.raw(`
          WITH RECURSIVE dependency_chain AS (
            SELECT blocked_task_id as task_id, 1 as depth,
                   CAST(blocked_task_id AS TEXT) as path
            FROM t_task_dependencies
            WHERE blocker_task_id = ?

            UNION ALL

            SELECT d.blocked_task_id, dc.depth + 1,
                   dc.path || ' → ' || d.blocked_task_id
            FROM t_task_dependencies d
            JOIN dependency_chain dc ON d.blocker_task_id = dc.task_id
            WHERE dc.depth < 100
          )
          SELECT path FROM dependency_chain WHERE task_id = ? ORDER BY depth DESC LIMIT 1
        `, [params.blocked_task_id, params.blocker_task_id])
          .then((result: any) => result[0] as { path: string } | undefined);

        const cyclePath = cyclePathResult?.path || `#${params.blocked_task_id} → ... → #${params.blocker_task_id}`;
        throw new Error(`Circular dependency detected: Task #${params.blocker_task_id} → #${cyclePath} → #${params.blocker_task_id}`);
      }

      // All validations passed - insert dependency
      await trx('t_task_dependencies').insert({
        blocker_task_id: params.blocker_task_id,
        blocked_task_id: params.blocked_task_id,
        created_ts: Math.floor(Date.now() / 1000)
      });

      return {
        success: true,
        message: `Dependency added: Task #${params.blocker_task_id} blocks Task #${params.blocked_task_id}`
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Don't wrap error messages that are already descriptive
    if (message.includes('not found') || message.includes('not allowed') || message.includes('Circular dependency') || message.includes('Cannot add dependency')) {
      throw new Error(message);
    }
    throw new Error(`Failed to add dependency: ${message}`);
  }
}

/**
 * Remove dependency between tasks
 */
export async function removeDependency(params: {
  blocker_task_id: number;
  blocked_task_id: number;
}, adapter?: DatabaseAdapter): Promise<any> {
  validateActionParams('task', 'remove_dependency', params);

  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  if (!params.blocker_task_id) {
    throw new Error('Parameter "blocker_task_id" is required');
  }

  if (!params.blocked_task_id) {
    throw new Error('Parameter "blocked_task_id" is required');
  }

  try {
    await knex('t_task_dependencies')
      .where({
        blocker_task_id: params.blocker_task_id,
        blocked_task_id: params.blocked_task_id
      })
      .delete();

    return {
      success: true,
      message: `Dependency removed: Task #${params.blocker_task_id} no longer blocks Task #${params.blocked_task_id}`
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to remove dependency: ${message}`);
  }
}

/**
 * Get dependencies for a task (bidirectional: what blocks this task, what this task blocks)
 */
export async function getDependencies(params: {
  task_id: number;
  include_details?: boolean;
}, adapter?: DatabaseAdapter): Promise<any> {
  validateActionParams('task', 'get_dependencies', params);

  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  if (!params.task_id) {
    throw new Error('Parameter "task_id" is required');
  }

  const includeDetails = params.include_details || false;

  try {
    // Check if task exists
    const taskExists = await knex('t_tasks').where({ id: params.task_id }).first();
    if (!taskExists) {
      throw new Error(`Task with id ${params.task_id} not found`);
    }

    // Use the shared helper function
    const deps = await queryTaskDependencies(actualAdapter, params.task_id, includeDetails);

    return {
      task_id: params.task_id,
      blockers: deps.blockers,
      blocking: deps.blocking
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Don't wrap error messages that are already descriptive
    if (message.includes('not found')) {
      throw new Error(message);
    }
    throw new Error(`Failed to get dependencies: ${message}`);
  }
}

/**
 * Create multiple tasks atomically
 */
export async function batchCreateTasks(params: {
  tasks: Array<{
    title: string;
    description?: string;
    priority?: number;
    assigned_agent?: string;
    layer?: string;
    tags?: string[];
  }>;
  atomic?: boolean;
}, adapter?: DatabaseAdapter): Promise<any> {
  validateBatchParams('task', 'tasks', params.tasks, 'create', 50);

  const actualAdapter = adapter ?? getAdapter();

  if (!params.tasks || !Array.isArray(params.tasks)) {
    throw new Error('Parameter "tasks" is required and must be an array');
  }

  if (params.tasks.length > 50) {
    throw new Error('Parameter "tasks" must contain at most 50 items');
  }

  const atomic = params.atomic !== undefined ? params.atomic : true;

  try {
    if (atomic) {
      // Atomic mode: All or nothing
      const results = await actualAdapter.transaction(async (trx) => {
        const processedResults = [];

        for (const task of params.tasks) {
          try {
            const result = await createTaskInternal(task, actualAdapter, trx);
            processedResults.push({
              title: task.title,
              task_id: result.task_id,
              success: true,
              error: undefined
            });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Batch failed at task "${task.title}": ${errorMessage}`);
          }
        }

        return processedResults;
      });

      return {
        success: true,
        created: results.length,
        failed: 0,
        results: results
      };
    } else {
      // Non-atomic mode: Process each independently
      const results = [];
      let created = 0;
      let failed = 0;

      for (const task of params.tasks) {
        try {
          const result = await actualAdapter.transaction(async (trx) => {
            return await createTaskInternal(task, actualAdapter, trx);
          });

          results.push({
            title: task.title,
            task_id: result.task_id,
            success: true,
            error: undefined
          });
          created++;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          results.push({
            title: task.title,
            task_id: undefined,
            success: false,
            error: errorMessage
          });
          failed++;
        }
      }

      return {
        success: failed === 0,
        created: created,
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
 * Watch/unwatch files for a task (v3.4.1)
 * Replaces the need to use task.link(file) for file watching
 */
export async function watchFiles(params: {
  task_id: number;
  action: 'watch' | 'unwatch' | 'list';
  file_paths?: string[];
}, adapter?: DatabaseAdapter): Promise<any> {
  validateActionParams('task', 'watch_files', params);

  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  if (!params.task_id) {
    throw new Error('Parameter "task_id" is required');
  }

  if (!params.action) {
    throw new Error('Parameter "action" is required (watch, unwatch, or list)');
  }

  try {
    return await actualAdapter.transaction(async (trx) => {
      // Check if task exists
      const taskData = await trx('t_tasks as t')
        .join('m_task_statuses as s', 't.status_id', 's.id')
        .where('t.id', params.task_id)
        .select('t.id', 't.title', 's.name as status')
        .first() as { id: number; title: string; status: string } | undefined;

      if (!taskData) {
        throw new Error(`Task with id ${params.task_id} not found`);
      }

      if (params.action === 'watch') {
        if (!params.file_paths || params.file_paths.length === 0) {
          throw new Error('Parameter "file_paths" is required for watch action');
        }

        const addedFiles: string[] = [];
        for (const filePath of params.file_paths) {
          const fileId = await getOrCreateFile(actualAdapter, filePath, trx);

          // Check if already exists
          const existing = await trx('t_task_file_links')
            .where({ task_id: params.task_id, file_id: fileId })
            .first();

          if (!existing) {
            await trx('t_task_file_links').insert({
              task_id: params.task_id,
              file_id: fileId
            });
            addedFiles.push(filePath);
          }
        }

        // Register files with watcher
        try {
          const watcher = FileWatcher.getInstance();
          for (const filePath of addedFiles) {
            watcher.registerFile(filePath, params.task_id, taskData.title, taskData.status);
          }
        } catch (error) {
          // Watcher may not be initialized yet, ignore
          debugLog('WARN', 'Could not register files with watcher', { error });
        }

        return {
          success: true,
          task_id: params.task_id,
          action: 'watch',
          files_added: addedFiles.length,
          files: addedFiles,
          message: `Watching ${addedFiles.length} file(s) for task ${params.task_id}`
        };

      } else if (params.action === 'unwatch') {
        if (!params.file_paths || params.file_paths.length === 0) {
          throw new Error('Parameter "file_paths" is required for unwatch action');
        }

        const removedFiles: string[] = [];
        for (const filePath of params.file_paths) {
          const deleted = await trx('t_task_file_links')
            .where('task_id', params.task_id)
            .whereIn('file_id', function() {
              this.select('id').from('m_files').where({ path: filePath });
            })
            .delete();

          if (deleted > 0) {
            removedFiles.push(filePath);
          }
        }

        return {
          success: true,
          task_id: params.task_id,
          action: 'unwatch',
          files_removed: removedFiles.length,
          files: removedFiles,
          message: `Stopped watching ${removedFiles.length} file(s) for task ${params.task_id}`
        };

      } else if (params.action === 'list') {
        const files = await trx('t_task_file_links as tfl')
          .join('m_files as f', 'tfl.file_id', 'f.id')
          .where('tfl.task_id', params.task_id)
          .select('f.path')
          .then(rows => rows.map((row: any) => row.path));

        return {
          success: true,
          task_id: params.task_id,
          action: 'list',
          files_count: files.length,
          files: files,
          message: `Task ${params.task_id} is watching ${files.length} file(s)`
        };

      } else {
        throw new Error(`Invalid action: ${params.action}. Must be one of: watch, unwatch, list`);
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to ${params.action} files: ${message}`);
  }
}

/**
 * Get pruned files for a task (v3.5.0 Auto-Pruning)
 * Returns audit trail of files that were auto-pruned as non-existent
 */
export async function getPrunedFiles(params: {
  task_id: number;
  limit?: number;
}, adapter?: DatabaseAdapter): Promise<any> {
  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  try {
    // Validate task_id
    if (!params.task_id || typeof params.task_id !== 'number') {
      throw new Error('task_id is required and must be a number');
    }

    // Validate task exists
    const task = await knex('t_tasks').where({ id: params.task_id }).first();
    if (!task) {
      throw new Error(`Task not found: ${params.task_id}`);
    }

    // Get pruned files
    const limit = params.limit || 100;
    const rows = await knex('t_task_pruned_files as tpf')
      .leftJoin('m_context_keys as k', 'tpf.linked_decision_key_id', 'k.id')
      .where('tpf.task_id', params.task_id)
      .select(
        'tpf.id',
        'tpf.file_path',
        knex.raw(`datetime(tpf.pruned_ts, 'unixepoch') as pruned_at`),
        'k.key as linked_decision'
      )
      .orderBy('tpf.pruned_ts', 'desc')
      .limit(limit) as Array<{
        id: number;
        file_path: string;
        pruned_at: string;
        linked_decision: string | null;
      }>;

    return {
      success: true,
      task_id: params.task_id,
      pruned_files: rows,
      count: rows.length,
      message: rows.length > 0
        ? `Found ${rows.length} pruned file(s) for task ${params.task_id}`
        : `No pruned files for task ${params.task_id}`
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get pruned files: ${message}`);
  }
}

/**
 * Link a pruned file to a decision (v3.5.0 Auto-Pruning)
 * Attaches WHY reasoning to pruned files for project archaeology
 */
export async function linkPrunedFile(params: {
  pruned_file_id: number;
  decision_key: string;
}, adapter?: DatabaseAdapter): Promise<any> {
  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  try {
    // Validate pruned_file_id
    if (!params.pruned_file_id || typeof params.pruned_file_id !== 'number') {
      throw new Error('pruned_file_id is required and must be a number');
    }

    // Validate decision_key
    if (!params.decision_key || typeof params.decision_key !== 'string') {
      throw new Error('decision_key is required and must be a string');
    }

    // Get decision key_id
    const decision = await knex('m_context_keys as k')
      .whereExists(function() {
        this.select('*')
          .from('t_decisions as d')
          .whereRaw('d.key_id = k.id');
      })
      .where('k.key', params.decision_key)
      .select('k.id as key_id')
      .first() as { key_id: number } | undefined;

    if (!decision) {
      throw new Error(`Decision not found: ${params.decision_key}`);
    }

    // Check if pruned file exists
    const prunedFile = await knex('t_task_pruned_files')
      .where({ id: params.pruned_file_id })
      .select('id', 'task_id', 'file_path')
      .first() as { id: number; task_id: number; file_path: string } | undefined;

    if (!prunedFile) {
      throw new Error(`Pruned file record not found: ${params.pruned_file_id}`);
    }

    // Update the link
    const updated = await knex('t_task_pruned_files')
      .where({ id: params.pruned_file_id })
      .update({ linked_decision_key_id: decision.key_id });

    if (updated === 0) {
      throw new Error(`Failed to link pruned file #${params.pruned_file_id} to decision ${params.decision_key}`);
    }

    return {
      success: true,
      pruned_file_id: params.pruned_file_id,
      decision_key: params.decision_key,
      task_id: prunedFile.task_id,
      file_path: prunedFile.file_path,
      message: `Linked pruned file "${prunedFile.file_path}" to decision "${params.decision_key}"`
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to link pruned file: ${message}`);
  }
}

/**
 * Return comprehensive help documentation
 */
export function taskHelp(): any {
  return {
    tool: 'task',
    description: 'Kanban Task Watcher for managing tasks with AI-optimized lifecycle states',
    note: '💡 TIP: Use action: "example" to see comprehensive usage scenarios and real-world examples for all task actions.',
    important: '🚨 AUTOMATIC FILE WATCHING: Linking files to tasks activates automatic file change monitoring and acceptance criteria validation. You can save 300 tokens per file compared to registering watchers manually. See auto_file_tracking section below.',
    actions: {
      create: {
        description: 'Create a new task',
        required_params: ['title'],
        optional_params: ['description', 'acceptance_criteria', 'notes', 'priority', 'assigned_agent', 'created_by_agent', 'layer', 'tags', 'status', 'watch_files'],
        watch_files_param: '⭐ NEW in v3.4.1: Pass watch_files array to automatically link and watch files (replaces task.link(file))',
        example: {
          action: 'create',
          title: 'Implement authentication endpoint',
          description: 'Add JWT-based authentication to /api/login',
          priority: 3,
          assigned_agent: 'backend-agent',
          layer: 'presentation',
          tags: ['api', 'authentication'],
          watch_files: ['src/api/auth.ts', 'src/middleware/jwt.ts']
        }
      },
      update: {
        description: 'Update task metadata',
        required_params: ['task_id'],
        optional_params: ['title', 'priority', 'assigned_agent', 'layer', 'description', 'acceptance_criteria', 'notes', 'watch_files'],
        watch_files_param: '⭐ NEW in v3.4.1: Pass watch_files array to add files to watch list',
        example: {
          action: 'update',
          task_id: 5,
          priority: 4,
          assigned_agent: 'senior-backend-agent',
          watch_files: ['src/api/users.ts']
        }
      },
      get: {
        description: 'Get full task details including descriptions and links',
        required_params: ['task_id'],
        example: {
          action: 'get',
          task_id: 5
        }
      },
      list: {
        description: 'List tasks (token-efficient, no descriptions)',
        required_params: [],
        optional_params: ['status', 'assigned_agent', 'layer', 'tags', 'limit', 'offset'],
        example: {
          action: 'list',
          status: 'in_progress',
          assigned_agent: 'backend-agent',
          limit: 20
        }
      },
      move: {
        description: 'Move task to different status with validation',
        required_params: ['task_id', 'new_status'],
        valid_statuses: ['todo', 'in_progress', 'waiting_review', 'blocked', 'done', 'archived'],
        transitions: {
          todo: ['in_progress', 'blocked'],
          in_progress: ['waiting_review', 'blocked', 'done'],
          waiting_review: ['in_progress', 'todo', 'done'],
          blocked: ['todo', 'in_progress'],
          done: ['archived'],
          archived: []
        },
        example: {
          action: 'move',
          task_id: 5,
          new_status: 'in_progress'
        }
      },
      link: {
        description: 'Link task to decision/constraint/file',
        required_params: ['task_id', 'link_type', 'target_id'],
        optional_params: ['link_relation'],
        link_types: ['decision', 'constraint', 'file'],
        file_linking_behavior: '⚠️  DEPRECATED in v3.4.1: link_type="file" is deprecated. Use watch_files action or watch_files parameter instead.',
        deprecation_note: 'For file watching, use: (1) watch_files parameter in create/update, or (2) watch_files action with watch/unwatch/list',
        example: {
          action: 'link',
          task_id: 5,
          link_type: 'decision',
          target_id: 'auth_method',
          link_relation: 'implements'
        }
      },
      watch_files: {
        description: '⭐ NEW in v3.4.1: Watch/unwatch files for a task (replaces task.link(file))',
        required_params: ['task_id', 'action'],
        optional_params: ['file_paths'],
        actions: ['watch', 'unwatch', 'list'],
        behavior: {
          watch: 'Add files to watch list and activate file monitoring',
          unwatch: 'Remove files from watch list',
          list: 'List all files currently watched by this task'
        },
        examples: {
          watch: {
            task_id: 5,
            action: 'watch',
            file_paths: ['src/api/auth.ts', 'src/middleware/jwt.ts']
          },
          unwatch: {
            task_id: 5,
            action: 'unwatch',
            file_paths: ['src/middleware/jwt.ts']
          },
          list: {
            task_id: 5,
            action: 'list'
          }
        },
        note: 'Preferred over task.link(file) for better clarity and batch operations'
      },
      archive: {
        description: 'Archive completed task (must be in done status)',
        required_params: ['task_id'],
        example: {
          action: 'archive',
          task_id: 5
        }
      },
      batch_create: {
        description: 'Create multiple tasks atomically',
        required_params: ['tasks'],
        optional_params: ['atomic'],
        limits: {
          max_items: 50
        },
        example: {
          action: 'batch_create',
          tasks: [
            { title: 'Task 1', priority: 2 },
            { title: 'Task 2', priority: 3, layer: 'business' }
          ],
          atomic: true
        }
      },
      add_dependency: {
        description: 'Add blocking relationship between tasks',
        required_params: ['blocker_task_id', 'blocked_task_id'],
        validations: [
          'No self-dependencies',
          'No circular dependencies (direct or transitive)',
          'Both tasks must exist',
          'Neither task can be archived'
        ],
        example: {
          action: 'add_dependency',
          blocker_task_id: 1,
          blocked_task_id: 2
        },
        note: 'Task #1 must be completed before Task #2 can start'
      },
      remove_dependency: {
        description: 'Remove blocking relationship between tasks',
        required_params: ['blocker_task_id', 'blocked_task_id'],
        example: {
          action: 'remove_dependency',
          blocker_task_id: 1,
          blocked_task_id: 2
        },
        note: 'Silently succeeds even if dependency does not exist'
      },
      get_dependencies: {
        description: 'Query task dependencies (bidirectional)',
        required_params: ['task_id'],
        optional_params: ['include_details'],
        returns: {
          blockers: 'Array of tasks that block this task',
          blocking: 'Array of tasks this task blocks'
        },
        example: {
          action: 'get_dependencies',
          task_id: 2,
          include_details: true
        },
        note: 'Defaults to metadata-only (token-efficient). Set include_details=true for full task details.'
      },
      watcher: {
        description: 'Query file watcher status and monitored files/tasks',
        required_params: [],
        optional_params: ['subaction'],
        subactions: ['status', 'list_files', 'list_tasks', 'help'],
        default_subaction: 'status',
        examples: {
          status: {
            action: 'watcher',
            subaction: 'status'
          },
          list_files: {
            action: 'watcher',
            subaction: 'list_files'
          },
          list_tasks: {
            action: 'watcher',
            subaction: 'list_tasks'
          }
        },
        note: 'Use to monitor which files/tasks are being watched. File watching activates automatically when you link files to tasks.'
      },
      help: {
        description: 'Return this help documentation',
        example: { action: 'help' }
      }
    },
    auto_stale_detection: {
      description: 'Tasks automatically transition when abandoned',
      behavior: {
        in_progress: 'Untouched for >2 hours → waiting_review',
        waiting_review: 'Untouched for >24 hours → todo'
      },
      config_keys: {
        task_stale_hours_in_progress: 'Hours before in_progress tasks go stale (default: 2)',
        task_stale_hours_waiting_review: 'Hours before waiting_review tasks go stale (default: 24)',
        task_auto_stale_enabled: 'Enable/disable auto-stale detection (default: true)'
      }
    },
    priority_levels: {
      1: 'low',
      2: 'medium (default)',
      3: 'high',
      4: 'critical'
    },
    auto_file_tracking: {
      description: 'Automatic file watching and acceptance criteria validation - save 300 tokens per file vs manual registration',
      recommendation: '⭐ BEST PRACTICE: Except in exceptional cases, it is recommended to set up file watchers for all tasks that involve code changes. This provides automatic status tracking with zero token overhead.',
      how_it_works: [
        '1. Link files to tasks using the link action with link_type="file"',
        '2. File watcher automatically activates and monitors linked files',
        '3. When files are saved, watcher detects changes',
        '4. If task has acceptance_criteria, watcher validates criteria against changes',
        '5. Results appear in terminal output with pass/fail status'
      ],
      requirements: [
        'Task must have files linked via link action',
        'File paths must be relative to project root (e.g., "src/api/auth.ts")',
        'Watcher only monitors files explicitly linked to tasks'
      ],
      token_efficiency: 'File watching happens in background. No MCP tokens consumed until you query status. Manual file tracking would cost ~500-1000 tokens per file check.',
      documentation_reference: 'docs/AUTO_FILE_TRACKING.md - Complete guide with examples'
    },
    documentation: {
      task_overview: 'docs/TASK_OVERVIEW.md - Lifecycle, status transitions, auto-stale detection (363 lines, ~10k tokens)',
      task_actions: 'docs/TASK_ACTIONS.md - All action references with examples (854 lines, ~21k tokens)',
      task_linking: 'docs/TASK_LINKING.md - Link tasks to decisions/constraints/files (729 lines, ~18k tokens)',
      task_migration: 'docs/TASK_MIGRATION.md - Migrate from decision-based tracking (701 lines, ~18k tokens)',
      tool_selection: 'docs/TOOL_SELECTION.md - Task vs decision vs constraint comparison (236 lines, ~12k tokens)',
      workflows: 'docs/WORKFLOWS.md - Multi-agent task coordination workflows (602 lines, ~30k tokens)',
      shared_concepts: 'docs/SHARED_CONCEPTS.md - Layer definitions, enum values (status/priority), atomic mode (339 lines, ~17k tokens)'
    }
  };
}

/**
 * Query file watcher status and monitored files/tasks
 */
export async function watcherStatus(args: any, adapter?: DatabaseAdapter): Promise<any> {
  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();
  const subaction = args.subaction || 'status';
  const watcher = FileWatcher.getInstance();

  if (subaction === 'help') {
    return {
      action: 'watcher',
      description: 'Query file watcher status and monitored files/tasks',
      subactions: {
        status: {
          description: 'Get overall watcher status (running, files watched, tasks monitored)',
          example: { action: 'watcher', subaction: 'status' }
        },
        list_files: {
          description: 'List all files being watched with their associated tasks',
          example: { action: 'watcher', subaction: 'list_files' }
        },
        list_tasks: {
          description: 'List all tasks that have active file watchers',
          example: { action: 'watcher', subaction: 'list_tasks' }
        },
        help: {
          description: 'Show this help documentation',
          example: { action: 'watcher', subaction: 'help' }
        }
      },
      note: 'File watching activates automatically when you link files to tasks using the link action with link_type="file". The watcher monitors linked files for changes and validates acceptance criteria.'
    };
  }

  if (subaction === 'status') {
    const status = watcher.getStatus();
    return {
      success: true,
      watcher_status: {
        running: status.running,
        files_watched: status.filesWatched,
        tasks_monitored: status.tasksWatched
      },
      message: status.running
        ? `File watcher is running. Monitoring ${status.filesWatched} file(s) across ${status.tasksWatched} task(s).`
        : 'File watcher is not running. Link files to tasks to activate automatic file watching.'
    };
  }

  if (subaction === 'list_files') {
    const fileLinks = await knex('t_task_file_links as tfl')
      .join('t_tasks as t', 'tfl.task_id', 't.id')
      .join('m_task_statuses as ts', 't.status_id', 'ts.id')
      .join('m_files as f', 'tfl.file_id', 'f.id')
      .where('t.status_id', '!=', 6)  // Exclude archived tasks
      .select('f.path as file_path', 't.id', 't.title', 'ts.name as status_name')
      .orderBy(['f.path', 't.id']) as Array<{ file_path: string; id: number; title: string; status_name: string }>;

    // Group by file
    const fileMap = new Map<string, Array<{ task_id: number; task_title: string; status: string }>>();
    for (const link of fileLinks) {
      if (!fileMap.has(link.file_path)) {
        fileMap.set(link.file_path, []);
      }
      fileMap.get(link.file_path)!.push({
        task_id: link.id,
        task_title: link.title,
        status: link.status_name
      });
    }

    const files = Array.from(fileMap.entries()).map(([path, tasks]) => ({
      file_path: path,
      tasks: tasks
    }));

    return {
      success: true,
      files_watched: files.length,
      files: files,
      message: files.length > 0
        ? `Watching ${files.length} file(s) linked to tasks.`
        : 'No files currently linked to tasks. Use link action with link_type="file" to activate file watching.'
    };
  }

  if (subaction === 'list_tasks') {
    const taskLinks = await knex('t_tasks as t')
      .join('m_task_statuses as ts', 't.status_id', 'ts.id')
      .join('t_task_file_links as tfl', 't.id', 'tfl.task_id')
      .join('m_files as f', 'tfl.file_id', 'f.id')
      .where('t.status_id', '!=', 6)  // Exclude archived tasks
      .groupBy('t.id', 't.title', 'ts.name')
      .select(
        't.id',
        't.title',
        'ts.name as status_name',
        knex.raw('COUNT(DISTINCT tfl.file_id) as file_count'),
        knex.raw('GROUP_CONCAT(DISTINCT f.path, \', \') as files')
      )
      .orderBy('t.id') as Array<{ id: number; title: string; status_name: string; file_count: number; files: string }>;

    const tasks = taskLinks.map(task => ({
      task_id: task.id,
      task_title: task.title,
      status: task.status_name,
      files_count: task.file_count,
      files: task.files.split(', ')
    }));

    return {
      success: true,
      tasks_monitored: tasks.length,
      tasks: tasks,
      message: tasks.length > 0
        ? `Monitoring ${tasks.length} task(s) with linked files.`
        : 'No tasks currently have linked files. Use link action with link_type="file" to activate file watching.'
    };
  }

  return {
    error: `Invalid subaction: ${subaction}. Valid subactions: status, list_files, list_tasks, help`
  };
}

/**
 * Get comprehensive examples for task tool
 * @returns Examples documentation object
 */
export function taskExample(): any {
  return {
    tool: 'task',
    description: 'Comprehensive task management examples for Kanban-style workflow',
    scenarios: {
      basic_task_management: {
        title: 'Creating and Managing Tasks',
        examples: [
          {
            scenario: 'Create a new task',
            request: '{ action: "create", title: "Implement user authentication", description: "Add JWT-based auth to API", priority: 3, assigned_agent: "backend-agent", layer: "business", tags: ["authentication", "security"] }',
            explanation: 'Creates task in todo status with high priority'
          },
          {
            scenario: 'Get task details',
            request: '{ action: "get", task_id: 5 }',
            response: 'Full task details including metadata, links, and timestamps'
          },
          {
            scenario: 'List tasks by status',
            request: '{ action: "list", status: "in_progress", limit: 20 }',
            explanation: 'View all in-progress tasks'
          }
        ]
      },
      status_workflow: {
        title: 'Task Lifecycle (Status Transitions)',
        workflow: [
          {
            step: 1,
            status: 'todo',
            action: '{ action: "create", title: "...", status: "todo" }',
            description: 'Task created and waiting to be started'
          },
          {
            step: 2,
            status: 'in_progress',
            action: '{ action: "move", task_id: 1, new_status: "in_progress" }',
            description: 'Agent starts working on task'
          },
          {
            step: 3,
            status: 'waiting_review',
            action: '{ action: "move", task_id: 1, new_status: "waiting_review" }',
            description: 'Work complete, awaiting review/approval'
          },
          {
            step: 4,
            status: 'done',
            action: '{ action: "move", task_id: 1, new_status: "done" }',
            description: 'Task reviewed and completed'
          },
          {
            step: 5,
            status: 'archived',
            action: '{ action: "archive", task_id: 1 }',
            description: 'Task archived for historical record'
          }
        ],
        blocked_status: {
          description: 'Use "blocked" when task cannot proceed due to dependencies',
          example: '{ action: "move", task_id: 1, new_status: "blocked" }'
        }
      },
      auto_stale_detection: {
        title: 'Automatic Stale Task Management',
        behavior: [
          {
            rule: 'in_progress > 2 hours → waiting_review',
            explanation: 'Tasks stuck in progress auto-move to waiting_review',
            rationale: 'Prevents tasks from being forgotten while in progress'
          },
          {
            rule: 'waiting_review > 24 hours → todo',
            explanation: 'Unreviewed tasks return to todo queue',
            rationale: 'Ensures waiting tasks dont accumulate indefinitely'
          }
        ],
        configuration: {
          keys: ['task_stale_hours_in_progress', 'task_stale_hours_waiting_review', 'task_auto_stale_enabled'],
          note: 'Configure via config table in database'
        }
      },
      task_linking: {
        title: 'Linking Tasks to Context',
        examples: [
          {
            scenario: 'Link task to decision',
            request: '{ action: "link", task_id: 5, link_type: "decision", target_id: "api_auth_method", link_relation: "implements" }',
            explanation: 'Track which tasks implement specific decisions'
          },
          {
            scenario: 'Link task to constraint',
            request: '{ action: "link", task_id: 5, link_type: "constraint", target_id: 3, link_relation: "addresses" }',
            explanation: 'Show task addresses a performance/architecture/security constraint'
          },
          {
            scenario: 'Link task to file',
            request: '{ action: "link", task_id: 5, link_type: "file", target_id: "src/api/auth.ts", link_relation: "modifies" }',
            explanation: 'Activates automatic file watching for the task - saves 300 tokens per file vs manual registration',
            behavior: 'File watcher monitors linked files and validates acceptance criteria when files change'
          }
        ]
      },
      batch_operations: {
        title: 'Batch Task Creation',
        examples: [
          {
            scenario: 'Create multiple related tasks',
            request: '{ action: "batch_create", tasks: [{"title": "Design API", "priority": 3}, {"title": "Implement API", "priority": 3}, {"title": "Write tests", "priority": 2}], atomic: false }',
            explanation: 'Create task breakdown - use atomic:false for best-effort'
          }
        ]
      },
      filtering_queries: {
        title: 'Advanced Task Queries',
        examples: [
          {
            scenario: 'Find high-priority tasks for agent',
            request: '{ action: "list", assigned_agent: "backend-agent", priority: 3, status: "todo" }',
            note: 'Priority is numeric: 1=low, 2=medium, 3=high, 4=critical'
          },
          {
            scenario: 'Get all security-related tasks',
            request: '{ action: "list", tags: ["security"], limit: 50 }',
            explanation: 'Filter by tags for topic-based views'
          },
          {
            scenario: 'View infrastructure layer tasks',
            request: '{ action: "list", layer: "infrastructure" }',
            explanation: 'See all DevOps/config related tasks'
          }
        ]
      },
      file_watcher_status: {
        title: 'File Watcher Status Queries',
        examples: [
          {
            scenario: 'Check if file watcher is running',
            request: '{ action: "watcher", subaction: "status" }',
            explanation: 'Returns running status, files watched count, tasks monitored count',
            response: '{ running: true, files_watched: 5, tasks_monitored: 3 }'
          },
          {
            scenario: 'List all files being watched',
            request: '{ action: "watcher", subaction: "list_files" }',
            explanation: 'Shows file paths and which tasks are watching them',
            response: '{ files: [{ file_path: "src/api/auth.ts", tasks: [{ task_id: 5, title: "...", status: "in_progress" }] }] }'
          },
          {
            scenario: 'List tasks with active file watchers',
            request: '{ action: "watcher", subaction: "list_tasks" }',
            explanation: 'Shows tasks and which files they are watching',
            response: '{ tasks: [{ task_id: 5, title: "...", files: ["src/api/auth.ts", "src/api/middleware.ts"] }] }'
          }
        ]
      }
    },
    valid_transitions: {
      from_todo: ['in_progress', 'blocked', 'done', 'archived'],
      from_in_progress: ['waiting_review', 'blocked', 'todo'],
      from_waiting_review: ['done', 'in_progress', 'todo'],
      from_blocked: ['todo', 'in_progress'],
      from_done: ['archived', 'todo'],
      from_archived: []
    },
    best_practices: {
      task_creation: [
        'Use descriptive titles (200 char max)',
        'Set appropriate priority: 1=low, 2=medium (default), 3=high, 4=critical',
        'Assign to layer where work will be done',
        'Tag comprehensively for easy filtering',
        'Include acceptance_criteria for complex tasks'
      ],
      status_management: [
        'Move to in_progress when starting work',
        'Use waiting_review for completed but unverified work',
        'Set to blocked with notes explaining dependency',
        'Archive done tasks periodically for cleaner views'
      ],
      linking: [
        '⭐ RECOMMENDED: Set up file watchers for all tasks involving code changes (except exceptional cases)',
        'Link tasks to decisions they implement',
        'Link to constraints they address',
        'Link files to activate automatic file watching (save 300 tokens per file vs manual registration)',
        'Use descriptive link_relation values'
      ],
      coordination: [
        'Use assigned_agent for clear ownership',
        'Filter by status for Kanban board views',
        'Monitor auto-stale transitions for stuck work',
        'Use tags for cross-cutting concerns (security, performance, etc.)'
      ]
    }
  };
}


