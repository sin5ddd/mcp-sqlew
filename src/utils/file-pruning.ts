/**
 * File pruning utilities for v3.5.0 Auto-Pruning feature
 * Automatically removes non-existent watched files with audit trail
 *
 * UPDATED v3.7.0: Added project_id support for multi-project compatibility
 */

import { Database } from '../types.js';
import type { Knex } from 'knex';
import { existsSync } from 'fs';
import { join } from 'path';
import { getProjectContext } from './project-context.js';

/**
 * Prune non-existent files from a task's watch list
 * Records pruned files to audit table for project archaeology
 *
 * Quality gate enforcement:
 * - If ALL watched files are non-existent → throw error (prevents zero-work completion)
 * - If SOME watched files are non-existent → prune them and continue
 *
 * @param db - Database instance
 * @param taskId - Task ID to prune files for
 * @param projectRoot - Project root directory (default: process.cwd())
 * @returns Object with pruned count and remaining count
 * @throws Error if ALL files are non-existent (safety check)
 */
export function pruneNonExistentFiles(
  db: Database,
  taskId: number,
  projectRoot: string = process.cwd()
): { prunedCount: number; remainingCount: number; prunedPaths: string[] } {
  // 1. Get all watched files for this task
  const watchedFiles = db.prepare(`
    SELECT f.id as file_id, f.path
    FROM t_task_file_links tfl
    JOIN m_files f ON tfl.file_id = f.id
    WHERE tfl.task_id = ?
  `).all(taskId) as Array<{ file_id: number; path: string }>;

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

  // 5. Prune non-existent files in a transaction
  db.transaction(() => {
    // Get project_id (required after v3.7.0 multi-project support)
    const projectId = getProjectContext().getProjectId();

    const insertPruned = db.prepare(`
      INSERT INTO t_task_pruned_files (task_id, file_path, pruned_ts, project_id)
      VALUES (?, ?, unixepoch(), ?)
    `);

    const deleteLink = db.prepare(`
      DELETE FROM t_task_file_links
      WHERE task_id = ? AND file_id = ?
    `);

    // Record each pruned file to audit table and remove link
    for (const file of nonExistentFiles) {
      insertPruned.run(taskId, file.path, projectId);
      deleteLink.run(taskId, file.file_id);
    }
  })();

  return {
    prunedCount: nonExistentFiles.length,
    remainingCount: existingFiles.length,
    prunedPaths: nonExistentFiles.map(f => f.path),
  };
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
 * @param db - Database instance
 * @param taskId - Task ID
 * @param limit - Maximum number of records (default: 100)
 * @returns Array of pruned file records
 */
export function getPrunedFiles(
  db: Database,
  taskId: number,
  limit: number = 100
): Array<{
  id: number;
  file_path: string;
  pruned_at: string;
  linked_decision: string | null;
}> {
  const rows = db.prepare(`
    SELECT
      tpf.id,
      tpf.file_path,
      datetime(tpf.pruned_ts, 'unixepoch') as pruned_at,
      k.key as linked_decision
    FROM t_task_pruned_files tpf
    LEFT JOIN m_context_keys k ON tpf.linked_decision_key_id = k.id
    WHERE tpf.task_id = ?
    ORDER BY tpf.pruned_ts DESC
    LIMIT ?
  `).all(taskId, limit) as Array<{
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
 * @param db - Database instance
 * @param prunedFileId - Pruned file record ID
 * @param decisionKey - Decision key to link
 * @throws Error if pruned file or decision not found
 */
export function linkPrunedFileToDecision(
  db: Database,
  prunedFileId: number,
  decisionKey: string
): void {
  // 1. Get decision key_id
  const decision = db.prepare(`
    SELECT k.id as key_id
    FROM m_context_keys k
    WHERE k.key = ? AND EXISTS (
      SELECT 1 FROM t_decisions d WHERE d.key_id = k.id
    )
  `).get(decisionKey) as { key_id: number } | undefined;

  if (!decision) {
    throw new Error(`Decision not found: ${decisionKey}`);
  }

  // 2. Check if pruned file exists
  const prunedFile = db.prepare(`
    SELECT id FROM t_task_pruned_files WHERE id = ?
  `).get(prunedFileId) as { id: number } | undefined;

  if (!prunedFile) {
    throw new Error(`Pruned file record not found: ${prunedFileId}`);
  }

  // 3. Update the link
  const result = db.prepare(`
    UPDATE t_task_pruned_files
    SET linked_decision_key_id = ?
    WHERE id = ?
  `).run(decision.key_id, prunedFileId);

  if (result.changes === 0) {
    throw new Error(`Failed to link pruned file #${prunedFileId} to decision ${decisionKey}`);
  }
}

/**
 * Get all pruned files across all tasks (for audit purposes)
 *
 * @param db - Database instance
 * @param filters - Optional filters
 * @returns Array of pruned file records with task info
 */
export function getAllPrunedFiles(
  db: Database,
  filters?: {
    taskId?: number;
    linkedDecision?: string;
    since?: number; // Unix timestamp
    limit?: number;
    offset?: number;
  }
): Array<{
  id: number;
  task_id: number;
  task_title: string;
  file_path: string;
  pruned_at: string;
  linked_decision: string | null;
}> {
  let query = `
    SELECT
      tpf.id,
      tpf.task_id,
      t.title as task_title,
      tpf.file_path,
      datetime(tpf.pruned_ts, 'unixepoch') as pruned_at,
      k.key as linked_decision
    FROM t_task_pruned_files tpf
    JOIN t_tasks t ON tpf.task_id = t.id
    LEFT JOIN m_context_keys k ON tpf.linked_decision_key_id = k.id
    WHERE 1=1
  `;

  const params: any[] = [];

  if (filters?.taskId !== undefined) {
    query += ' AND tpf.task_id = ?';
    params.push(filters.taskId);
  }

  if (filters?.linkedDecision) {
    query += ' AND k.key = ?';
    params.push(filters.linkedDecision);
  }

  if (filters?.since !== undefined) {
    query += ' AND tpf.pruned_ts >= ?';
    params.push(filters.since);
  }

  query += ' ORDER BY tpf.pruned_ts DESC';

  if (filters?.limit) {
    query += ' LIMIT ?';
    params.push(filters.limit);
  }

  if (filters?.offset) {
    query += ' OFFSET ?';
    params.push(filters.offset);
  }

  return db.prepare(query).all(...params) as Array<{
    id: number;
    task_id: number;
    task_title: string;
    file_path: string;
    pruned_at: string;
    linked_decision: string | null;
  }>;
}
