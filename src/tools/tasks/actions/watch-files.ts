/**
 * Task watch files action (v3.4.1)
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter, getOrCreateFile } from '../../../database.js';
import { getProjectContext } from '../../../utils/project-context.js';
import { FileWatcher } from '../../../watcher/index.js';
import { validateActionParams } from '../../../utils/parameter-validator.js';
import { debugLog } from '../../../utils/debug-logger.js';
import connectionManager from '../../../utils/connection-manager.js';

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
  const projectId = getProjectContext().getProjectId();

  if (!params.task_id) {
    throw new Error('Parameter "task_id" is required');
  }

  if (!params.action) {
    throw new Error('Parameter "action" is required (watch, unwatch, or list)');
  }

  try {
    return await connectionManager.executeWithRetry(async () => {
      return await actualAdapter.transaction(async (trx) => {
        // Check if task exists (project-scoped)
        const taskData = await trx('t_tasks as t')
          .join('m_task_statuses as s', 't.status_id', 's.id')
          .where({ 't.id': params.task_id, 't.project_id': projectId })
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
            const fileId = await getOrCreateFile(actualAdapter, projectId, filePath, trx);

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
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to ${params.action} files: ${message}`);
  }
}
