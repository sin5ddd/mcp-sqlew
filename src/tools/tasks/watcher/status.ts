/**
 * File watcher status query
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter } from '../../../database.js';
import { getProjectContext } from '../../../utils/project-context.js';
import { FileWatcher } from '../../../watcher/index.js';
import { STATUS_TO_ID } from '../types.js';

/**
 * Query file watcher status and monitored files/tasks
 */
export async function watcherStatus(args: any, adapter?: DatabaseAdapter): Promise<any> {
  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();
  const projectId = getProjectContext().getProjectId();
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
    const fileLinks = await knex('v4_task_file_links as tfl')
      .join('v4_tasks as t', function() {
        this.on('tfl.task_id', '=', 't.id')
            .andOn('tfl.project_id', '=', 't.project_id');
      })
      .join('v4_task_statuses as ts', 't.status_id', 'ts.id')
      .join('v4_files as f', 'tfl.file_id', 'f.id')
      .where('t.project_id', projectId)
      .whereNot('t.status_id', STATUS_TO_ID['archived'])  // Exclude archived tasks
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
    const taskLinks = await knex('v4_tasks as t')
      .join('v4_task_statuses as ts', 't.status_id', 'ts.id')
      .join('v4_task_file_links as tfl', function() {
        this.on('t.id', '=', 'tfl.task_id')
            .andOn('t.project_id', '=', 'tfl.project_id');
      })
      .join('v4_files as f', 'tfl.file_id', 'f.id')
      .where('t.project_id', projectId)
      .whereNot('t.status_id', STATUS_TO_ID['archived'])  // Exclude archived tasks
      .groupBy('t.id', 't.title', 'ts.name')
      .select(
        't.id',
        't.title',
        'ts.name as status_name',
        knex.raw('COUNT(DISTINCT tfl.file_id) as file_count'),
        // PostgreSQL uses string_agg, others use GROUP_CONCAT
        ((knex.client as any)?.config?.client === 'pg' || (knex.client as any)?.config?.client === 'postgresql')
          ? knex.raw("string_agg(DISTINCT f.path, ', ') as files")
          : knex.raw("GROUP_CONCAT(DISTINCT f.path, ', ') as files")
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
