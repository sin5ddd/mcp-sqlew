/**
 * Task create action
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter, getOrCreateAgent, getOrCreateTag, getLayerId, getOrCreateFile } from '../../../database.js';
import { getProjectContext } from '../../../utils/project-context.js';
import { FileWatcher } from '../../../watcher/index.js';
import { Knex } from 'knex';
import { logTaskCreate } from '../../../utils/activity-logging.js';
import { validateActionParams } from '../../../utils/parameter-validator.js';
import { debugLog } from '../../../utils/debug-logger.js';
import connectionManager from '../../../utils/connection-manager.js';
import { TaskCreateParams, STATUS_TO_ID } from '../types.js';
import { validateTaskCreateParams, parseArrayParam, processAcceptanceCriteria, validateFileActions, convertWatchFilesToFileActions } from '../internal/validation.js';

/**
 * Internal helper: Create task without wrapping in transaction
 * Used by createTask (with transaction) and batchCreateTasks (manages its own transaction)
 */
export async function createTaskInternal(
  params: TaskCreateParams,
  adapter: DatabaseAdapter,
  trx?: Knex.Transaction
): Promise<any> {
  const knex = trx || adapter.getKnex();

  // Fail-fast project_id validation (Constraint #29)
  const projectId = getProjectContext().getProjectId();

  // Validate parameters
  validateTaskCreateParams(params);

  // Handle backward compatibility: convert watch_files to file_actions (v3.8.0)
  let file_actions = params.file_actions;

  // Parse file_actions if it's a string (MCP SDK may send JSON as string)
  if (file_actions && typeof file_actions === 'string') {
    try {
      file_actions = JSON.parse(file_actions);
    } catch (error) {
      throw new Error('Invalid file_actions format. Expected JSON array of {action, path} objects.');
    }
  }

  // Backward compatibility: convert watch_files to file_actions
  if (!file_actions && params.watch_files) {
    const watchFilesParsed = parseArrayParam(params.watch_files, 'watch_files');
    file_actions = convertWatchFilesToFileActions(watchFilesParsed);
  }

  // Validate file_actions is an array if provided
  if (file_actions !== undefined && !Array.isArray(file_actions)) {
    throw new Error('file_actions must be an array of {action, path} objects');
  }

  // Validate file_actions based on layer (v3.8.0)
  validateFileActions(params.layer, file_actions);

  // Get priority
  const priority = params.priority !== undefined ? params.priority : 2;

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
      throw new Error(
        `Invalid layer: '${params.layer}'. Must be one of 9 layers (v3.8.0):\n` +
        `\n` +
        `FILE_REQUIRED (6): presentation, business, data, infrastructure, cross-cutting, documentation\n` +
        `  → Must provide file_actions parameter (or [] for non-file tasks)\n` +
        `  → Documentation IS files (README, CHANGELOG, docs/)\n` +
        `\n` +
        `FILE_OPTIONAL (3): planning, coordination, review\n` +
        `  → file_actions parameter is optional\n` +
        `  → Planning: research, surveys, investigation\n` +
        `  → Coordination: multi-agent orchestration\n` +
        `  → Review: code review, verification\n` +
        `\n` +
        `Example: { layer: 'business', file_actions: [{ action: 'edit', path: 'src/model/user.ts' }] }`
      );
    }
  }

  // Get or create agents
  let assignedAgentId: number | null = null;
  if (params.assigned_agent) {
    assignedAgentId = await getOrCreateAgent(adapter, params.assigned_agent, trx);
  }

  // Default to generic agent pool if no created_by_agent provided
  const createdBy = params.created_by_agent || '';
  const createdByAgentId = await getOrCreateAgent(adapter, createdBy, trx);

  // Insert task
  const now = Math.floor(Date.now() / 1000);
  const [taskId] = await knex('t_tasks').insert({
    project_id: projectId,
    title: params.title,
    status_id: statusId,
    priority: priority,
    assigned_agent_id: assignedAgentId,
    created_by_agent_id: createdByAgentId,
    layer_id: layerId,
    created_ts: now,
    updated_ts: now
  });

  // Process acceptance_criteria
  const { acceptanceCriteriaString, acceptanceCriteriaJson } = processAcceptanceCriteria(params.acceptance_criteria);

  // Insert task details if provided
  if (params.description || acceptanceCriteriaString || acceptanceCriteriaJson || params.notes) {
    await knex('t_task_details').insert({
      project_id: projectId,
      task_id: Number(taskId),
      description: params.description || null,
      acceptance_criteria: acceptanceCriteriaString,
      acceptance_criteria_json: acceptanceCriteriaJson,
      notes: params.notes || null
    });
  }

  // Insert tags if provided
  if (params.tags && params.tags.length > 0) {
    const tagsParsed = parseArrayParam(params.tags, 'tags');

    for (const tagName of tagsParsed) {
      const tagId = await getOrCreateTag(adapter, projectId, tagName, trx);
      await knex('t_task_tags').insert({
        project_id: projectId,
        task_id: Number(taskId),
        tag_id: tagId
      }).onConflict(['project_id', 'task_id', 'tag_id']).ignore();
    }
  }

  // Activity logging (replaces triggers)
  await logTaskCreate(knex, {
    task_id: Number(taskId),
    title: params.title,
    agent_id: createdByAgentId,
    layer_id: layerId || undefined
  });

  // Link files and register with watcher if file_actions provided (v3.8.0)
  // Also supports legacy watch_files via auto-conversion above
  if (file_actions && file_actions.length > 0) {
    for (const fileAction of file_actions) {
      const fileId = await getOrCreateFile(adapter, projectId, fileAction.path, trx);
      await knex('t_task_file_links').insert({
        project_id: projectId,
        task_id: Number(taskId),
        file_id: fileId,
        linked_ts: Math.floor(Date.now() / 1000)
      }).onConflict(['project_id', 'task_id', 'file_id']).ignore();
    }

    // Register files with watcher for auto-tracking
    try {
      const watcher = FileWatcher.getInstance();
      for (const fileAction of file_actions) {
        watcher.registerFile(fileAction.path, Number(taskId), params.title, status);
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
export async function createTask(params: TaskCreateParams, adapter?: DatabaseAdapter): Promise<any> {
  validateActionParams('task', 'create', params);

  const actualAdapter = adapter ?? getAdapter();

  try {
    return await connectionManager.executeWithRetry(async () => {
      return await actualAdapter.transaction(async (trx) => {
        return await createTaskInternal(params, actualAdapter, trx);
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Preserve validation errors (they already contain helpful information)
    if (message.startsWith('{') && message.includes('"error"')) {
      throw error;
    }

    throw new Error(`Failed to create task: ${message}`);
  }
}
