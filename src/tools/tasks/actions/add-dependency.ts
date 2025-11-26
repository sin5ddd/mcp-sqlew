/**
 * Task add dependency action
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter } from '../../../database.js';
import { validateActionParams } from '../../../utils/parameter-validator.js';
import connectionManager from '../../../utils/connection-manager.js';
import { TASK_STATUS } from '../types.js';

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
    return await connectionManager.executeWithRetry(async () => {
      return await actualAdapter.transaction(async (trx) => {
        // Validation 1: No self-dependencies
        if (params.blocker_task_id === params.blocked_task_id) {
          throw new Error('Self-dependency not allowed');
        }

        // Validation 2: Both tasks must exist and check if archived
        const blockerTask = await trx('v4_tasks')
          .where({ id: params.blocker_task_id })
          .select('id', 'status_id')
          .first() as { id: number; status_id: number } | undefined;

        const blockedTask = await trx('v4_tasks')
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
        const reverseExists = await trx('v4_task_dependencies')
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
            FROM v4_task_dependencies
            WHERE blocker_task_id = ?

            UNION ALL

            -- Follow the chain of dependencies
            SELECT d.blocked_task_id, dc.depth + 1
            FROM v4_task_dependencies d
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
              FROM v4_task_dependencies
              WHERE blocker_task_id = ?

              UNION ALL

              SELECT d.blocked_task_id, dc.depth + 1,
                     dc.path || ' → ' || d.blocked_task_id
              FROM v4_task_dependencies d
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
        await trx('v4_task_dependencies').insert({
          blocker_task_id: params.blocker_task_id,
          blocked_task_id: params.blocked_task_id,
          created_ts: Math.floor(Date.now() / 1000)
        });

        return {
          success: true,
          message: `Dependency added: Task #${params.blocker_task_id} blocks Task #${params.blocked_task_id}`
        };
      });
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
