/**
 * Task update action
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter, getLayerId, getOrCreateFile } from '../../../database.js';
import { getProjectContext } from '../../../utils/project-context.js';
import { FileWatcher } from '../../../watcher/index.js';
import { validateActionParams } from '../../../utils/parameter-validator.js';
import { debugLog } from '../../../utils/debug-logger.js';
import connectionManager from '../../../utils/connection-manager.js';
import { TaskUpdateParams } from '../types.js';
import { validateTaskUpdateParams, parseArrayParam, processAcceptanceCriteria, validateFileActions, convertWatchFilesToFileActions } from '../internal/validation.js';

/**
 * Update task metadata
 */
export async function updateTask(params: TaskUpdateParams, adapter?: DatabaseAdapter): Promise<any> {
  validateActionParams('task', 'update', params);

  const actualAdapter = adapter ?? getAdapter();

  // Validate parameters
  validateTaskUpdateParams(params);

  // Fail-fast project_id validation (Constraint #29)
  const projectId = getProjectContext().getProjectId();

  try {
    return await connectionManager.executeWithRetry(async () => {
      return await actualAdapter.transaction(async (trx) => {
        const knex = actualAdapter.getKnex();

        // Check if task exists with project_id isolation
        const taskExists = await trx('v4_tasks')
          .where({ id: params.task_id, project_id: projectId })
          .first();
        if (!taskExists) {
          throw new Error(`Task with id ${params.task_id} not found`);
        }

        // Build update data dynamically
        const updateData: any = {};

        if (params.title !== undefined) {
          updateData.title = params.title;
        }

        if (params.priority !== undefined) {
          updateData.priority = params.priority;
        }

        // Note: Agent tracking removed in v4.0 (assigned_agent param kept for API compatibility but not stored)

        if (params.layer !== undefined) {
          const layerId = await getLayerId(actualAdapter, params.layer, trx);
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
          updateData.layer_id = layerId;
        }

        // Update v4_tasks if any updates (with project_id isolation)
        if (Object.keys(updateData).length > 0) {
          await trx('v4_tasks')
            .where({ id: params.task_id, project_id: projectId })
            .update(updateData);
        }

        // Update v4_task_details if any detail fields provided
        if (params.description !== undefined || params.acceptance_criteria !== undefined || params.notes !== undefined) {
          // Process acceptance_criteria (can be string or array)
          let acceptanceCriteriaString: string | null | undefined = undefined;
          let acceptanceCriteriaJson: string | null | undefined = undefined;

          if (params.acceptance_criteria !== undefined) {
            const processed = processAcceptanceCriteria(params.acceptance_criteria);
            acceptanceCriteriaString = processed.acceptanceCriteriaString;
            acceptanceCriteriaJson = processed.acceptanceCriteriaJson;
          }

          // Check if details exist (with project_id isolation)
          const detailsExist = await trx('v4_task_details')
            .where({ task_id: params.task_id, project_id: projectId })
            .first();

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
            // Update existing details (with project_id isolation)
            await trx('v4_task_details')
              .where({ task_id: params.task_id, project_id: projectId })
              .update(detailsUpdate);
          } else if (!detailsExist) {
            // Insert new details
            await trx('v4_task_details').insert({
              project_id: projectId,
              task_id: params.task_id,
              description: params.description || null,
              acceptance_criteria: acceptanceCriteriaString !== undefined ? acceptanceCriteriaString : null,
              acceptance_criteria_json: acceptanceCriteriaJson !== undefined ? acceptanceCriteriaJson : null,
              notes: params.notes || null
            });
          }
        }

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

        // Validate file_actions based on layer if both are provided (v3.8.0)
        if (params.layer && file_actions) {
          validateFileActions(params.layer, file_actions);
        }

        // Handle file_actions if provided (v3.8.0)
        // Also supports legacy watch_files via auto-conversion above
        if (file_actions && file_actions.length > 0) {
          for (const fileAction of file_actions) {
            const fileId = await getOrCreateFile(actualAdapter, projectId, fileAction.path, trx);
            await trx('v4_task_file_links').insert({
              project_id: projectId,
              task_id: params.task_id,
              file_id: fileId,
              linked_ts: Math.floor(Date.now() / 1000)
            }).onConflict(['project_id', 'task_id', 'file_id']).ignore();
          }

          // Register files with watcher for auto-tracking
          try {
            const taskData = await trx('v4_tasks as t')
              .join('v4_task_statuses as s', 't.status_id', 's.id')
              .where({ 't.id': params.task_id, 't.project_id': projectId })
              .select('t.title', 's.name as status')
              .first() as { title: string; status: string } | undefined;

            if (taskData) {
              const watcher = FileWatcher.getInstance();
              for (const fileAction of file_actions) {
                watcher.registerFile(fileAction.path, params.task_id, taskData.title, taskData.status);
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
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Preserve validation errors (they already contain helpful information)
    if (message.startsWith('{') && message.includes('"error"')) {
      throw error;
    }

    throw new Error(`Failed to update task: ${message}`);
  }
}
