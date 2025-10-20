/**
 * Task management tools for Kanban Task Watcher
 * Implements create, update, get, list, move, link, archive, batch_create actions
 */

import {
  getDatabase,
  getOrCreateAgent,
  getOrCreateTag,
  getOrCreateContextKey,
  getLayerId,
  getOrCreateFile,
  transaction
} from '../database.js';
import { detectAndTransitionStaleTasks } from '../utils/task-stale-detection.js';
import { processBatch } from '../utils/batch.js';
import { FileWatcher } from '../watcher/index.js';
import {
  validatePriorityRange,
  validateLength,
  validateRange
} from '../utils/validators.js';
import type { Database } from '../types.js';

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
 * @param db - Database instance
 * @returns Response with success status and task metadata
 */
function createTaskInternal(params: {
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
}, db: Database): any {
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
    layerId = getLayerId(db, params.layer);
    if (layerId === null) {
      throw new Error(`Invalid layer: ${params.layer}. Must be one of: presentation, business, data, infrastructure, cross-cutting`);
    }
  }

  // Get or create agents
  let assignedAgentId: number | null = null;
  if (params.assigned_agent) {
    assignedAgentId = getOrCreateAgent(db, params.assigned_agent);
  }

  let createdByAgentId: number | null = null;
  if (params.created_by_agent) {
    createdByAgentId = getOrCreateAgent(db, params.created_by_agent);
  }

  // Insert task
  const insertTaskStmt = db.prepare(`
    INSERT INTO t_tasks (title, status_id, priority, assigned_agent_id, created_by_agent_id, layer_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const taskResult = insertTaskStmt.run(
    params.title,
    statusId,
    priority,
    assignedAgentId,
    createdByAgentId,
    layerId
  );

  const taskId = taskResult.lastInsertRowid as number;

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
    const insertDetailsStmt = db.prepare(`
      INSERT INTO t_task_details (task_id, description, acceptance_criteria, acceptance_criteria_json, notes)
      VALUES (?, ?, ?, ?, ?)
    `);

    insertDetailsStmt.run(
      taskId,
      params.description || null,
      acceptanceCriteriaString,
      acceptanceCriteriaJson,
      params.notes || null
    );
  }

  // Insert tags if provided
  if (params.tags && params.tags.length > 0) {
    const insertTagStmt = db.prepare(`
      INSERT INTO t_task_tags (task_id, tag_id)
      VALUES (?, ?)
    `);

    for (const tagName of params.tags) {
      const tagId = getOrCreateTag(db, tagName);
      insertTagStmt.run(taskId, tagId);
    }
  }

  return {
    success: true,
    task_id: taskId,
    title: params.title,
    status: status,
    message: `Task "${params.title}" created successfully`
  };
}

/**
 * Create a new task
 */
export function createTask(params: {
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
}): any {
  const db = getDatabase();

  // Validate required parameters
  if (!params.title || params.title.trim() === '') {
    throw new Error('Parameter "title" is required and cannot be empty');
  }

  validateLength(params.title, 'Parameter "title"', 200);

  try {
    return transaction(db, () => {
      return createTaskInternal(params, db);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to create task: ${message}`);
  }
}

/**
 * Update task metadata
 */
export function updateTask(params: {
  task_id: number;
  title?: string;
  priority?: number;
  assigned_agent?: string;
  layer?: string;
  description?: string;
  acceptance_criteria?: string | any[];  // Can be string or array of AcceptanceCheck objects
  notes?: string;
}): any {
  const db = getDatabase();

  // Validate required parameters
  if (!params.task_id) {
    throw new Error('Parameter "task_id" is required');
  }

  try {
    return transaction(db, () => {
      // Check if task exists
      const taskExists = db.prepare('SELECT id FROM t_tasks WHERE id = ?').get(params.task_id);
      if (!taskExists) {
        throw new Error(`Task with id ${params.task_id} not found`);
      }

      // Build update query dynamically
      const updates: string[] = [];
      const updateParams: any[] = [];

      if (params.title !== undefined) {
        if (params.title.trim() === '') {
          throw new Error('Parameter "title" cannot be empty');
        }
        validateLength(params.title, 'Parameter "title"', 200);
        updates.push('title = ?');
        updateParams.push(params.title);
      }

      if (params.priority !== undefined) {
        validatePriorityRange(params.priority);
        updates.push('priority = ?');
        updateParams.push(params.priority);
      }

      if (params.assigned_agent !== undefined) {
        const agentId = getOrCreateAgent(db, params.assigned_agent);
        updates.push('assigned_agent_id = ?');
        updateParams.push(agentId);
      }

      if (params.layer !== undefined) {
        const layerId = getLayerId(db, params.layer);
        if (layerId === null) {
          throw new Error(`Invalid layer: ${params.layer}. Must be one of: presentation, business, data, infrastructure, cross-cutting`);
        }
        updates.push('layer_id = ?');
        updateParams.push(layerId);
      }

      // Update t_tasks if any updates
      if (updates.length > 0) {
        const updateStmt = db.prepare(`
          UPDATE t_tasks
          SET ${updates.join(', ')}
          WHERE id = ?
        `);
        updateStmt.run(...updateParams, params.task_id);
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
        const detailsExist = db.prepare('SELECT task_id FROM t_task_details WHERE task_id = ?').get(params.task_id);

        if (detailsExist) {
          // Update existing details
          const detailUpdates: string[] = [];
          const detailParams: any[] = [];

          if (params.description !== undefined) {
            detailUpdates.push('description = ?');
            detailParams.push(params.description || null);
          }
          if (acceptanceCriteriaString !== undefined) {
            detailUpdates.push('acceptance_criteria = ?');
            detailParams.push(acceptanceCriteriaString);
          }
          if (acceptanceCriteriaJson !== undefined) {
            detailUpdates.push('acceptance_criteria_json = ?');
            detailParams.push(acceptanceCriteriaJson);
          }
          if (params.notes !== undefined) {
            detailUpdates.push('notes = ?');
            detailParams.push(params.notes || null);
          }

          if (detailUpdates.length > 0) {
            const updateDetailsStmt = db.prepare(`
              UPDATE t_task_details
              SET ${detailUpdates.join(', ')}
              WHERE task_id = ?
            `);
            updateDetailsStmt.run(...detailParams, params.task_id);
          }
        } else {
          // Insert new details
          const insertDetailsStmt = db.prepare(`
            INSERT INTO t_task_details (task_id, description, acceptance_criteria, acceptance_criteria_json, notes)
            VALUES (?, ?, ?, ?, ?)
          `);
          insertDetailsStmt.run(
            params.task_id,
            params.description || null,
            acceptanceCriteriaString !== undefined ? acceptanceCriteriaString : null,
            acceptanceCriteriaJson !== undefined ? acceptanceCriteriaJson : null,
            params.notes || null
          );
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
function queryTaskDependencies(db: Database, taskId: number, includeDetails: boolean = false): { blockers: any[], blocking: any[] } {
  // Build query based on include_details flag
  let selectFields: string;
  if (includeDetails) {
    // Include description from t_task_details
    selectFields = `
      t.id,
      t.title,
      s.name as status,
      t.priority,
      aa.name as assigned_to,
      t.created_ts,
      t.updated_ts,
      td.description
    `;
  } else {
    // Metadata only (token-efficient)
    selectFields = `
      t.id,
      t.title,
      s.name as status,
      t.priority
    `;
  }

  // Get blockers (tasks that block this task)
  const blockersQuery = `
    SELECT ${selectFields}
    FROM t_tasks t
    JOIN t_task_dependencies d ON t.id = d.blocker_task_id
    LEFT JOIN m_task_statuses s ON t.status_id = s.id
    LEFT JOIN m_agents aa ON t.assigned_agent_id = aa.id
    ${includeDetails ? 'LEFT JOIN t_task_details td ON t.id = td.task_id' : ''}
    WHERE d.blocked_task_id = ?
  `;

  const blockers = db.prepare(blockersQuery).all(taskId);

  // Get blocking (tasks this task blocks)
  const blockingQuery = `
    SELECT ${selectFields}
    FROM t_tasks t
    JOIN t_task_dependencies d ON t.id = d.blocked_task_id
    LEFT JOIN m_task_statuses s ON t.status_id = s.id
    LEFT JOIN m_agents aa ON t.assigned_agent_id = aa.id
    ${includeDetails ? 'LEFT JOIN t_task_details td ON t.id = td.task_id' : ''}
    WHERE d.blocker_task_id = ?
  `;

  const blocking = db.prepare(blockingQuery).all(taskId);

  return { blockers, blocking };
}

/**
 * Get full task details
 */
export function getTask(params: {
  task_id: number;
  include_dependencies?: boolean;
}): any {
  const db = getDatabase();

  if (!params.task_id) {
    throw new Error('Parameter "task_id" is required');
  }

  try {
    // Get task with details
    const stmt = db.prepare(`
      SELECT
        t.id,
        t.title,
        s.name as status,
        t.priority,
        aa.name as assigned_to,
        ca.name as created_by,
        l.name as layer,
        t.created_ts,
        t.updated_ts,
        t.completed_ts,
        td.description,
        td.acceptance_criteria,
        td.notes
      FROM t_tasks t
      LEFT JOIN m_task_statuses s ON t.status_id = s.id
      LEFT JOIN m_agents aa ON t.assigned_agent_id = aa.id
      LEFT JOIN m_agents ca ON t.created_by_agent_id = ca.id
      LEFT JOIN m_layers l ON t.layer_id = l.id
      LEFT JOIN t_task_details td ON t.id = td.task_id
      WHERE t.id = ?
    `);

    const task = stmt.get(params.task_id) as any;

    if (!task) {
      return {
        found: false,
        task_id: params.task_id
      };
    }

    // Get tags
    const tagsStmt = db.prepare(`
      SELECT tg.name
      FROM t_task_tags tt
      JOIN m_tags tg ON tt.tag_id = tg.id
      WHERE tt.task_id = ?
    `);
    const tags = tagsStmt.all(params.task_id).map((row: any) => row.name);

    // Get decision links
    const decisionsStmt = db.prepare(`
      SELECT ck.key, tdl.link_type
      FROM t_task_decision_links tdl
      JOIN m_context_keys ck ON tdl.decision_key_id = ck.id
      WHERE tdl.task_id = ?
    `);
    const decisions = decisionsStmt.all(params.task_id);

    // Get constraint links
    const constraintsStmt = db.prepare(`
      SELECT c.id, c.constraint_text
      FROM t_task_constraint_links tcl
      JOIN t_constraints c ON tcl.constraint_id = c.id
      WHERE tcl.task_id = ?
    `);
    const constraints = constraintsStmt.all(params.task_id);

    // Get file links
    const filesStmt = db.prepare(`
      SELECT f.path
      FROM t_task_file_links tfl
      JOIN m_files f ON tfl.file_id = f.id
      WHERE tfl.task_id = ?
    `);
    const files = filesStmt.all(params.task_id).map((row: any) => row.path);

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
      const deps = queryTaskDependencies(db, params.task_id, false);
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
export function listTasks(params: {
  status?: string;
  assigned_agent?: string;
  layer?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
  include_dependency_counts?: boolean;
} = {}): any {
  const db = getDatabase();

  try {
    // Run auto-stale detection before listing
    const transitionCount = detectAndTransitionStaleTasks(db);

    // Build query with optional dependency counts
    let query: string;
    if (params.include_dependency_counts) {
      // Include dependency counts with LEFT JOINs
      query = `
        SELECT
          vt.*,
          COALESCE(blockers.blocked_by_count, 0) as blocked_by_count,
          COALESCE(blocking.blocking_count, 0) as blocking_count
        FROM v_task_board vt
        LEFT JOIN (
          SELECT blocked_task_id, COUNT(*) as blocked_by_count
          FROM t_task_dependencies
          GROUP BY blocked_task_id
        ) blockers ON vt.id = blockers.blocked_task_id
        LEFT JOIN (
          SELECT blocker_task_id, COUNT(*) as blocking_count
          FROM t_task_dependencies
          GROUP BY blocker_task_id
        ) blocking ON vt.id = blocking.blocker_task_id
        WHERE 1=1
      `;
    } else {
      // Standard query without dependency counts
      query = 'SELECT * FROM v_task_board WHERE 1=1';
    }

    const queryParams: any[] = [];

    // Filter by status
    if (params.status) {
      if (!STATUS_TO_ID[params.status]) {
        throw new Error(`Invalid status: ${params.status}. Must be one of: todo, in_progress, waiting_review, blocked, done, archived`);
      }
      query += params.include_dependency_counts ? ' AND vt.status = ?' : ' AND status = ?';
      queryParams.push(params.status);
    }

    // Filter by assigned agent
    if (params.assigned_agent) {
      query += params.include_dependency_counts ? ' AND vt.assigned_to = ?' : ' AND assigned_to = ?';
      queryParams.push(params.assigned_agent);
    }

    // Filter by layer
    if (params.layer) {
      query += params.include_dependency_counts ? ' AND vt.layer = ?' : ' AND layer = ?';
      queryParams.push(params.layer);
    }

    // Filter by tags
    if (params.tags && params.tags.length > 0) {
      for (const tag of params.tags) {
        query += params.include_dependency_counts ? ' AND vt.tags LIKE ?' : ' AND tags LIKE ?';
        queryParams.push(`%${tag}%`);
      }
    }

    // Order by updated timestamp (most recent first)
    query += params.include_dependency_counts ? ' ORDER BY vt.updated_ts DESC' : ' ORDER BY updated_ts DESC';

    // Pagination
    const limit = params.limit !== undefined ? params.limit : 50;
    const offset = params.offset || 0;

    validateRange(limit, 'Parameter "limit"', 0, 100);
    validateRange(offset, 'Parameter "offset"', 0, Number.MAX_SAFE_INTEGER);

    query += ' LIMIT ? OFFSET ?';
    queryParams.push(limit, offset);

    // Execute query
    const stmt = db.prepare(query);
    const rows = stmt.all(...queryParams);

    return {
      tasks: rows,
      count: rows.length,
      stale_tasks_transitioned: transitionCount
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to list tasks: ${message}`);
  }
}

/**
 * Move task to different status
 */
export function moveTask(params: {
  task_id: number;
  new_status: string;
}): any {
  const db = getDatabase();

  if (!params.task_id) {
    throw new Error('Parameter "task_id" is required');
  }

  if (!params.new_status) {
    throw new Error('Parameter "new_status" is required');
  }

  try {
    // Run auto-stale detection before move
    detectAndTransitionStaleTasks(db);

    return transaction(db, () => {
      // Get current status
      const taskRow = db.prepare('SELECT status_id FROM t_tasks WHERE id = ?').get(params.task_id) as { status_id: number } | undefined;

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
      const updateStmt = db.prepare(`
        UPDATE t_tasks
        SET status_id = ?,
            completed_ts = CASE WHEN ? = 5 THEN unixepoch() ELSE completed_ts END
        WHERE id = ?
      `);

      updateStmt.run(newStatusId, newStatusId, params.task_id);

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
export function linkTask(params: {
  task_id: number;
  link_type: 'decision' | 'constraint' | 'file';
  target_id: string | number;
  link_relation?: string;
}): any {
  const db = getDatabase();

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
    return transaction(db, () => {
      // Check if task exists
      const taskExists = db.prepare('SELECT id FROM t_tasks WHERE id = ?').get(params.task_id);
      if (!taskExists) {
        throw new Error(`Task with id ${params.task_id} not found`);
      }

      if (params.link_type === 'decision') {
        const decisionKey = String(params.target_id);
        const keyId = getOrCreateContextKey(db, decisionKey);
        const linkRelation = params.link_relation || 'implements';

        const stmt = db.prepare(`
          INSERT OR REPLACE INTO t_task_decision_links (task_id, decision_key_id, link_type)
          VALUES (?, ?, ?)
        `);
        stmt.run(params.task_id, keyId, linkRelation);

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
        const constraintExists = db.prepare('SELECT id FROM t_constraints WHERE id = ?').get(constraintId);
        if (!constraintExists) {
          throw new Error(`Constraint with id ${constraintId} not found`);
        }

        const stmt = db.prepare(`
          INSERT OR IGNORE INTO t_task_constraint_links (task_id, constraint_id)
          VALUES (?, ?)
        `);
        stmt.run(params.task_id, constraintId);

        return {
          success: true,
          task_id: params.task_id,
          linked_to: 'constraint',
          target: constraintId,
          message: `Task ${params.task_id} linked to constraint ${constraintId}`
        };

      } else if (params.link_type === 'file') {
        const filePath = String(params.target_id);
        const fileId = getOrCreateFile(db, filePath);

        const stmt = db.prepare(`
          INSERT OR IGNORE INTO t_task_file_links (task_id, file_id)
          VALUES (?, ?)
        `);
        stmt.run(params.task_id, fileId);

        // Register file with watcher for auto-tracking
        try {
          const taskData = db.prepare(`
            SELECT t.title, s.name as status
            FROM t_tasks t
            JOIN m_task_statuses s ON t.status_id = s.id
            WHERE t.id = ?
          `).get(params.task_id) as { title: string; status: string } | undefined;

          if (taskData) {
            const watcher = FileWatcher.getInstance();
            watcher.registerFile(filePath, params.task_id, taskData.title, taskData.status);
          }
        } catch (error) {
          // Watcher may not be initialized yet, ignore
          console.error('Warning: Could not register file with watcher:', error);
        }

        return {
          success: true,
          task_id: params.task_id,
          linked_to: 'file',
          target: filePath,
          message: `Task ${params.task_id} linked to file "${filePath}"`
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
export function archiveTask(params: { task_id: number }): any {
  const db = getDatabase();

  if (!params.task_id) {
    throw new Error('Parameter "task_id" is required');
  }

  try {
    return transaction(db, () => {
      // Check if task is in 'done' status
      const taskRow = db.prepare('SELECT status_id FROM t_tasks WHERE id = ?').get(params.task_id) as { status_id: number } | undefined;

      if (!taskRow) {
        throw new Error(`Task with id ${params.task_id} not found`);
      }

      if (taskRow.status_id !== TASK_STATUS.DONE) {
        throw new Error(`Task ${params.task_id} must be in 'done' status to archive (current: ${ID_TO_STATUS[taskRow.status_id]})`);
      }

      // Update to archived
      const updateStmt = db.prepare('UPDATE t_tasks SET status_id = ? WHERE id = ?');
      updateStmt.run(TASK_STATUS.ARCHIVED, params.task_id);

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
export function addDependency(params: {
  blocker_task_id: number;
  blocked_task_id: number;
}): any {
  const db = getDatabase();

  if (!params.blocker_task_id) {
    throw new Error('Parameter "blocker_task_id" is required');
  }

  if (!params.blocked_task_id) {
    throw new Error('Parameter "blocked_task_id" is required');
  }

  try {
    return transaction(db, () => {
      // Validation 1: No self-dependencies
      if (params.blocker_task_id === params.blocked_task_id) {
        throw new Error('Self-dependency not allowed');
      }

      // Validation 2: Both tasks must exist and check if archived
      const blockerTask = db.prepare('SELECT id, status_id FROM t_tasks WHERE id = ?').get(params.blocker_task_id) as { id: number; status_id: number } | undefined;
      const blockedTask = db.prepare('SELECT id, status_id FROM t_tasks WHERE id = ?').get(params.blocked_task_id) as { id: number; status_id: number } | undefined;

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
      const reverseExists = db.prepare(`
        SELECT 1 FROM t_task_dependencies
        WHERE blocker_task_id = ? AND blocked_task_id = ?
      `).get(params.blocked_task_id, params.blocker_task_id);

      if (reverseExists) {
        throw new Error(`Circular dependency detected: Task #${params.blocked_task_id} already blocks Task #${params.blocker_task_id}`);
      }

      // Validation 5: No transitive circular (check if adding this would create a cycle)
      const cycleCheck = db.prepare(`
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
      `).get(params.blocked_task_id, params.blocker_task_id) as { task_id: number } | undefined;

      if (cycleCheck) {
        // Build cycle path for error message
        const cyclePathResult = db.prepare(`
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
        `).get(params.blocked_task_id, params.blocker_task_id) as { path: string } | undefined;

        const cyclePath = cyclePathResult?.path || `#${params.blocked_task_id} → ... → #${params.blocker_task_id}`;
        throw new Error(`Circular dependency detected: Task #${params.blocker_task_id} → #${cyclePath} → #${params.blocker_task_id}`);
      }

      // All validations passed - insert dependency
      const insertStmt = db.prepare(`
        INSERT INTO t_task_dependencies (blocker_task_id, blocked_task_id)
        VALUES (?, ?)
      `);

      insertStmt.run(params.blocker_task_id, params.blocked_task_id);

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
export function removeDependency(params: {
  blocker_task_id: number;
  blocked_task_id: number;
}): any {
  const db = getDatabase();

  if (!params.blocker_task_id) {
    throw new Error('Parameter "blocker_task_id" is required');
  }

  if (!params.blocked_task_id) {
    throw new Error('Parameter "blocked_task_id" is required');
  }

  try {
    const deleteStmt = db.prepare(`
      DELETE FROM t_task_dependencies
      WHERE blocker_task_id = ? AND blocked_task_id = ?
    `);

    deleteStmt.run(params.blocker_task_id, params.blocked_task_id);

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
export function getDependencies(params: {
  task_id: number;
  include_details?: boolean;
}): any {
  const db = getDatabase();

  if (!params.task_id) {
    throw new Error('Parameter "task_id" is required');
  }

  const includeDetails = params.include_details || false;

  try {
    // Check if task exists
    const taskExists = db.prepare('SELECT id FROM t_tasks WHERE id = ?').get(params.task_id);
    if (!taskExists) {
      throw new Error(`Task with id ${params.task_id} not found`);
    }

    // Use the shared helper function
    const deps = queryTaskDependencies(db, params.task_id, includeDetails);

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
export function batchCreateTasks(params: {
  tasks: Array<{
    title: string;
    description?: string;
    priority?: number;
    assigned_agent?: string;
    layer?: string;
    tags?: string[];
  }>;
  atomic?: boolean;
}): any {
  const db = getDatabase();

  if (!params.tasks || !Array.isArray(params.tasks)) {
    throw new Error('Parameter "tasks" is required and must be an array');
  }

  const atomic = params.atomic !== undefined ? params.atomic : true;

  // Use processBatch utility
  const batchResult = processBatch(
    db,
    params.tasks,
    (task, db) => {
      const result = createTaskInternal(task, db);
      return {
        title: task.title,
        task_id: result.task_id
      };
    },
    atomic,
    50
  );

  // Map batch results to task batch response format
  return {
    success: batchResult.success,
    created: batchResult.processed,
    failed: batchResult.failed,
    results: batchResult.results.map(r => ({
      title: (r.data as any)?.title || '',
      task_id: r.data?.task_id,
      success: r.success,
      error: r.error
    }))
  };
}

/**
 * Return comprehensive help documentation
 */
export function taskHelp(): any {
  return {
    tool: 'task',
    description: 'Kanban Task Watcher for managing tasks with AI-optimized lifecycle states',
    note: '💡 TIP: Use action: "example" to see comprehensive usage scenarios and real-world examples for all task actions.',
    important: '🚨 AUTOMATIC FILE WATCHING: Linking files to tasks activates automatic file change monitoring and acceptance criteria validation. This provides 97% token reduction vs manual tracking. See auto_file_tracking section below.',
    actions: {
      create: {
        description: 'Create a new task',
        required_params: ['title'],
        optional_params: ['description', 'acceptance_criteria', 'notes', 'priority', 'assigned_agent', 'created_by_agent', 'layer', 'tags', 'status'],
        example: {
          action: 'create',
          title: 'Implement authentication endpoint',
          description: 'Add JWT-based authentication to /api/login',
          priority: 3,
          assigned_agent: 'backend-agent',
          layer: 'presentation',
          tags: ['api', 'authentication']
        }
      },
      update: {
        description: 'Update task metadata',
        required_params: ['task_id'],
        optional_params: ['title', 'priority', 'assigned_agent', 'layer', 'description', 'acceptance_criteria', 'notes'],
        example: {
          action: 'update',
          task_id: 5,
          priority: 4,
          assigned_agent: 'senior-backend-agent'
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
        file_linking_behavior: '⚠️  IMPORTANT: When link_type="file", this action ACTIVATES AUTOMATIC FILE WATCHING. The file watcher monitors linked files for changes and validates acceptance criteria when files are saved. This provides 97% token reduction compared to manual file change tracking.',
        example: {
          action: 'link',
          task_id: 5,
          link_type: 'decision',
          target_id: 'auth_method',
          link_relation: 'implements'
        }
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
      description: 'Automatic file watching and acceptance criteria validation (97% token reduction)',
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
export function watcherStatus(args: any): any {
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
    const db = getDatabase();
    const fileLinks = db.prepare(`
      SELECT DISTINCT tfl.file_path, t.id, t.title, ts.status_name
      FROM t_task_file_links tfl
      JOIN t_tasks t ON tfl.task_id = t.id
      JOIN m_task_statuses ts ON t.status_id = ts.id
      WHERE t.status_id != 6  -- Exclude archived tasks
      ORDER BY tfl.file_path, t.id
    `).all() as Array<{ file_path: string; id: number; title: string; status_name: string }>;

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
    const db = getDatabase();
    const taskLinks = db.prepare(`
      SELECT t.id, t.title, ts.status_name, COUNT(DISTINCT tfl.file_path) as file_count,
             GROUP_CONCAT(DISTINCT tfl.file_path, ', ') as files
      FROM t_tasks t
      JOIN m_task_statuses ts ON t.status_id = ts.id
      JOIN t_task_file_links tfl ON t.id = tfl.task_id
      WHERE t.status_id != 6  -- Exclude archived tasks
      GROUP BY t.id, t.title, ts.status_name
      ORDER BY t.id
    `).all() as Array<{ id: number; title: string; status_name: string; file_count: number; files: string }>;

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
