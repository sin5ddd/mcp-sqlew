/**
 * File pruning utilities for v3.5.0 Auto-Pruning feature
 * Automatically removes non-existent watched files with audit trail
 *
 * UPDATED v3.7.0: Added project_id support for multi-project compatibility
 */

import type { Knex } from 'knex';
import type { DatabaseAdapter } from '../adapters/index.js';
import { existsSync } from 'fs';
import { join } from 'path';
import { getProjectContext } from './project-context.js';

/**
 * Prune non-existent files from a task's watch list
 * Records pruned files to audit table for project archaeology
 *
 * @deprecated Use pruneNonExistentFilesKnex instead
 *
 * Quality gate enforcement:
 * - If ALL watched files are non-existent → throw error (prevents zero-work completion)
 * - If SOME watched files are non-existent → prune them and continue
 *
 * @param adapter - Database adapter
 * @param taskId - Task ID to prune files for
 * @param projectRoot - Project root directory (default: process.cwd())
 * @returns Object with pruned count and remaining count
 * @throws Error if ALL files are non-existent (safety check)
 */
export async function pruneNonExistentFiles(
  adapter: DatabaseAdapter,
  taskId: number,
  projectRoot: string = process.cwd()
): Promise<{ prunedCount: number; remainingCount: number; prunedPaths: string[] }> {
  const knex = adapter.getKnex();

  // Delegate to Knex version within a transaction
  return await knex.transaction(async (trx) => {
    return await pruneNonExistentFilesKnex(trx, taskId, projectRoot);
  });
}

/**
 * Prune non-existent files from a task's watch list (Knex.js version)
 * Records pruned files to audit table for project archaeology
 *
 * Quality gate enforcement:
 * - If ALL watched files are non-existent → throw error (prevents zero-work completion)
 * - If SOME watched files are non-existent → prune them and continue
 *
 * @param trx - Knex transaction instance
 * @param taskId - Task ID to prune files for
 * @param projectRoot - Project root directory (default: process.cwd())
 * @returns Object with pruned count, remaining count, and pruned paths
 * @throws Error if ALL files are non-existent (safety check)
 */
export async function pruneNonExistentFilesKnex(
  trx: Knex.Transaction,
  taskId: number,
  projectRoot: string = process.cwd()
): Promise<{ prunedCount: number; remainingCount: number; prunedPaths: string[] }> {
  // 1. Get all watched files for this task
  const watchedFiles = await trx('t_task_file_links as tfl')
    .join('m_files as f', 'tfl.file_id', 'f.id')
    .where('tfl.task_id', taskId)
    .select('f.id as file_id', 'f.path');

  if (watchedFiles.length === 0) {
    // No watched files - nothing to prune
    return { prunedCount: 0, remainingCount: 0, prunedPaths: [] };
  }

  // 2. Check which files exist on filesystem
  const existingFiles: Array<{ file_id: number; path: string }> = [];
  const nonExistentFiles: Array<{ file_id: number; path: string }> = [];

  for (const file of watchedFiles) {
    const fullPath = join(projectRoot, file.path);
    if (existsSync(fullPath)) {
      existingFiles.push(file);
    } else {
      nonExistentFiles.push(file);
    }
  }

  // 3. Safety check: If ALL files are non-existent, block the operation
  if (nonExistentFiles.length === watchedFiles.length) {
    throw new Error(
      `Cannot prune files for task #${taskId}: ALL ${watchedFiles.length} watched files are non-existent. ` +
      `This indicates no work was done. Please verify watched files or mark task as invalid.`
    );
  }

  // 4. If no files need pruning, return early
  if (nonExistentFiles.length === 0) {
    return {
      prunedCount: 0,
      remainingCount: watchedFiles.length,
      prunedPaths: [],
    };
  }

  // 5. Prune non-existent files (transaction already provided)
  // Get project_id (required after v3.7.0 multi-project support)
  const projectId = getProjectContext().getProjectId();
  const currentTs = Math.floor(Date.now() / 1000);

  // Record each pruned file to audit table and remove link
  for (const file of nonExistentFiles) {
    // Insert audit record
    await trx('t_task_pruned_files').insert({
      task_id: taskId,
      file_path: file.path,
      pruned_ts: currentTs,
      project_id: projectId,
    });

    // Remove link
    await trx('t_task_file_links')
      .where({ task_id: taskId, file_id: file.file_id })
      .delete();
  }

  return {
    prunedCount: nonExistentFiles.length,
    remainingCount: existingFiles.length,
    prunedPaths: nonExistentFiles.map(f => f.path),
  };
}

/**
 * Get pruned files for a task
 *
 * @param adapter - Database adapter
 * @param taskId - Task ID
 * @param limit - Maximum number of records (default: 100)
 * @returns Array of pruned file records
 */
export async function getPrunedFiles(
  adapter: DatabaseAdapter,
  taskId: number,
  limit: number = 100
): Promise<Array<{
  id: number;
  file_path: string;
  pruned_at: string;
  linked_decision: string | null;
}>> {
  const knex = adapter.getKnex();

  const rows = await knex('t_task_pruned_files as tpf')
    .leftJoin('m_context_keys as k', 'tpf.linked_decision_key_id', 'k.id')
    .where('tpf.task_id', taskId)
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

  return rows;
}

/**
 * Link a pruned file to a decision (for WHY reasoning)
 *
 * @param adapter - Database adapter
 * @param prunedFileId - Pruned file record ID
 * @param decisionKey - Decision key to link
 * @throws Error if pruned file or decision not found
 */
export async function linkPrunedFileToDecision(
  adapter: DatabaseAdapter,
  prunedFileId: number,
  decisionKey: string
): Promise<void> {
  const knex = adapter.getKnex();

  // 1. Get decision key_id
  const decision = await knex('m_context_keys as k')
    .whereExists(function() {
      this.select('*')
        .from('t_decisions as d')
        .whereRaw('d.key_id = k.id');
    })
    .where('k.key', decisionKey)
    .select('k.id as key_id')
    .first() as { key_id: number } | undefined;

  if (!decision) {
    throw new Error(`Decision not found: ${decisionKey}`);
  }

  // 2. Check if pruned file exists
  const prunedFile = await knex('t_task_pruned_files')
    .where({ id: prunedFileId })
    .select('id')
    .first() as { id: number } | undefined;

  if (!prunedFile) {
    throw new Error(`Pruned file record not found: ${prunedFileId}`);
  }

  // 3. Update the link
  const result = await knex('t_task_pruned_files')
    .where({ id: prunedFileId })
    .update({ linked_decision_key_id: decision.key_id });

  if (result === 0) {
    throw new Error(`Failed to link pruned file #${prunedFileId} to decision ${decisionKey}`);
  }
}

/**
 * Get all pruned files across all tasks (for audit purposes)
 *
 * @param adapter - Database adapter
 * @param filters - Optional filters
 * @returns Array of pruned file records with task info
 */
export async function getAllPrunedFiles(
  adapter: DatabaseAdapter,
  filters?: {
    taskId?: number;
    linkedDecision?: string;
    since?: number; // Unix timestamp
    limit?: number;
    offset?: number;
  }
): Promise<Array<{
  id: number;
  task_id: number;
  task_title: string;
  file_path: string;
  pruned_at: string;
  linked_decision: string | null;
}>> {
  const knex = adapter.getKnex();

  let query = knex('t_task_pruned_files as tpf')
    .join('t_tasks as t', 'tpf.task_id', 't.id')
    .leftJoin('m_context_keys as k', 'tpf.linked_decision_key_id', 'k.id')
    .select(
      'tpf.id',
      'tpf.task_id',
      't.title as task_title',
      'tpf.file_path',
      knex.raw(`datetime(tpf.pruned_ts, 'unixepoch') as pruned_at`),
      'k.key as linked_decision'
    );

  if (filters?.taskId !== undefined) {
    query = query.where('tpf.task_id', filters.taskId);
  }

  if (filters?.linkedDecision) {
    query = query.where('k.key', filters.linkedDecision);
  }

  if (filters?.since !== undefined) {
    query = query.where('tpf.pruned_ts', '>=', filters.since);
  }

  query = query.orderBy('tpf.pruned_ts', 'desc');

  if (filters?.limit) {
    query = query.limit(filters.limit);
  }

  if (filters?.offset) {
    query = query.offset(filters.offset);
  }

  return await query as Array<{
    id: number;
    task_id: number;
    task_title: string;
    file_path: string;
    pruned_at: string;
    linked_decision: string | null;
  }>;
}
