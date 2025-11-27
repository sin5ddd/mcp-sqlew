/**
 * Task get action
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter } from '../../../database.js';
import { getProjectContext } from '../../../utils/project-context.js';
import { validateActionParams } from '../../../utils/parameter-validator.js';
import { queryTaskDependencies } from '../internal/task-queries.js';

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

  // Fail-fast project_id validation (Constraint #29)
  const projectId = getProjectContext().getProjectId();

  try {
    // Get task with details (with project_id isolation)
    // Note: Agent tracking removed in v4.0 - assigned_to and created_by fields removed
    const task = await knex('v4_tasks as t')
      .leftJoin('v4_task_statuses as s', 't.status_id', 's.id')
      .leftJoin('v4_layers as l', 't.layer_id', 'l.id')
      .leftJoin('v4_task_details as td', function() {
        this.on('t.id', '=', 'td.task_id')
            .andOn('t.project_id', '=', 'td.project_id');
      })
      .where({ 't.id': params.task_id, 't.project_id': projectId })
      .select(
        't.id',
        't.title',
        's.name as status',
        't.priority',
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
    const tags = await knex('v4_task_tags as tt')
      .join('v4_tags as tg', 'tt.tag_id', 'tg.id')
      .where('tt.task_id', params.task_id)
      .select('tg.name')
      .then(rows => rows.map((row: any) => row.name));

    // Get decision links
    const decisions = await knex('v4_task_decision_links as tdl')
      .join('v4_context_keys as ck', 'tdl.decision_key_id', 'ck.id')
      .where('tdl.task_id', params.task_id)
      .select('ck.key_name as key', 'tdl.link_type');

    // Get constraint links
    const constraints = await knex('v4_task_constraint_links as tcl')
      .join('v4_constraints as c', 'tcl.constraint_id', 'c.id')
      .where('tcl.task_id', params.task_id)
      .select('c.id', 'c.constraint_text');

    // Get file links
    const files = await knex('v4_task_file_links as tfl')
      .join('v4_files as f', 'tfl.file_id', 'f.id')
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
