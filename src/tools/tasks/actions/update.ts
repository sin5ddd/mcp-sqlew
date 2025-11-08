/**
 * Task update action
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter, getOrCreateAgent, getLayerId, getOrCreateFile } from '../../../database.js';
import { getProjectContext } from '../../../utils/project-context.js';
import { FileWatcher } from '../../../watcher/index.js';
import { validateActionParams } from '../../../utils/parameter-validator.js';
import { debugLog } from '../../../utils/debug-logger.js';
import connectionManager from '../../../utils/connection-manager.js';
import { TaskUpdateParams } from '../types.js';
import { validateTaskUpdateParams, parseArrayParam, processAcceptanceCriteria } from '../internal/validation.js';

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
        const taskExists = await trx('t_tasks')
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

        // Update t_tasks if any updates (with project_id isolation)
        if (Object.keys(updateData).length > 0) {
          await trx('t_tasks')
            .where({ id: params.task_id, project_id: projectId })
            .update(updateData);
        }

        // Update t_task_details if any detail fields provided
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
          const detailsExist = await trx('t_task_details')
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
            await trx('t_task_details')
              .where({ task_id: params.task_id, project_id: projectId })
              .update(detailsUpdate);
          } else if (!detailsExist) {
            // Insert new details
            await trx('t_task_details').insert({
              project_id: projectId,
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
          const watchFilesParsed = parseArrayParam(params.watch_files, 'watch_files');

          for (const filePath of watchFilesParsed) {
            const fileId = await getOrCreateFile(actualAdapter, projectId, filePath, trx);
            await trx('t_task_file_links').insert({
              project_id: projectId,
              task_id: params.task_id,
              file_id: fileId
            }).onConflict(['project_id', 'task_id', 'file_id']).ignore();
          }

          // Register files with watcher for auto-tracking
          try {
            const taskData = await trx('t_tasks as t')
              .join('m_task_statuses as s', 't.status_id', 's.id')
              .where({ 't.id': params.task_id, 't.project_id': projectId })
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
