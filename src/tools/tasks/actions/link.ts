/**
 * Task link action (link to decisions/constraints/files)
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter, getOrCreateContextKey, getOrCreateFile } from '../../../database.js';
import { getProjectContext } from '../../../utils/project-context.js';
import { FileWatcher } from '../../../watcher/index.js';
import { validateActionParams } from '../../../utils/parameter-validator.js';
import { debugLog } from '../../../utils/debug-logger.js';
import connectionManager from '../../../utils/connection-manager.js';

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

  // Get project context (v3.7.3)
  const projectId = getProjectContext().getProjectId();

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
    return await connectionManager.executeWithRetry(async () => {
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
          const fileId = await getOrCreateFile(actualAdapter, projectId, filePath, trx);

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
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to link task: ${message}`);
  }
}
