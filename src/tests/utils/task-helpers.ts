/**
 * Test Helpers - Task Utilities
 *
 * Task creation and file link utilities for testing.
 * v3.8.0+ schema compatible with created_ts, updated_ts, and UNIQUE constraints.
 */

import type { Knex } from 'knex';

// ============================================================================
// Task and File Link Test Helpers (v3.9.0)
// ============================================================================

/**
 * Options for creating a test task
 */
export interface CreateTestTaskOptions {
  title: string;
  description?: string;
  status_id?: number;
  priority?: number;
  projectId?: number;
  agentName?: string;
  acceptance_criteria?: string;
}

/**
 * Create a test task with all required fields including timestamps
 *
 * **v3.8.0+ Compatible**: Includes created_ts and updated_ts (NOT NULL fields)
 * **v3.7.0+ Compatible**: Uses provided projectId (required for multi-project support)
 *
 * @param db - Knex database connection
 * @param options - Task creation options
 * @returns Task ID
 */
export async function createTestTask(
  db: Knex,
  options: CreateTestTaskOptions
): Promise<number> {
  const currentTs = Math.floor(Date.now() / 1000);

  // Get or create agent
  let agentId: number;
  const agentName = options.agentName || 'test-agent';

  // Try to get existing agent
  const existingAgent = await db('m_agents')
    .where({ name: agentName })
    .first('id');

  if (existingAgent) {
    agentId = existingAgent.id;
  } else {
    // Create new agent
    const [newAgentId] = await db('m_agents')
      .insert({ name: agentName })
      .returning('id');
    agentId = newAgentId?.id || newAgentId;
  }

  // Create task with all required fields
  const [taskId] = await db('t_tasks')
    .insert({
      title: options.title,
      status_id: options.status_id || 1, // Default to 'todo' (status_id=1)
      priority: options.priority || 2,
      project_id: options.projectId || 1, // Default to project 1 if not specified
      created_by_agent_id: agentId,
      assigned_agent_id: agentId,
      created_ts: currentTs,  // Required NOT NULL field (v3.8.0+)
      updated_ts: currentTs   // Required NOT NULL field (v3.8.0+)
    })
    .returning('id');

  const actualTaskId = taskId?.id || taskId;

  // Add task details if description or acceptance_criteria provided
  if (options.description || options.acceptance_criteria) {
    await db('t_task_details').insert({
      task_id: actualTaskId,
      description: options.description || null,
      acceptance_criteria: options.acceptance_criteria || null
    });
  }

  return actualTaskId;
}

/**
 * Add watched files to a task with v3.8.0+ schema compatibility
 *
 * **v3.8.0+ Schema Requirements**:
 * - `project_id` (NOT NULL, part of UNIQUE constraint)
 * - `linked_ts` (NOT NULL, timestamp when file was linked)
 * - UNIQUE constraint: `(project_id, task_id, file_id)`
 *
 * @param db - Knex database connection
 * @param taskId - Task ID to link files to
 * @param filePaths - Array of file paths to watch
 * @param projectId - Project ID (required for v3.7.0+ multi-project support)
 * @returns Array of successfully added file paths
 */
export async function addWatchedFiles(
  db: Knex,
  taskId: number,
  filePaths: string[],
  projectId: number = 1
): Promise<string[]> {
  const currentTs = Math.floor(Date.now() / 1000);
  const addedFiles: string[] = [];

  for (const filePath of filePaths) {
    try {
      // Get or create file
      let fileId: number;

      const existingFile = await db('m_files')
        .where({ path: filePath })
        .first('id');

      if (existingFile) {
        fileId = existingFile.id;
      } else {
        const [newFileId] = await db('m_files')
          .insert({ path: filePath })
          .returning('id');
        fileId = newFileId?.id || newFileId;
      }

      // Add file link with v3.8.0+ schema fields
      await db('t_task_file_links')
        .insert({
          task_id: taskId,
          file_id: fileId,
          project_id: projectId,    // Required v3.7.0+
          linked_ts: currentTs       // Required v3.8.0+
        })
        .onConflict(['project_id', 'task_id', 'file_id'])  // v3.8.0+ UNIQUE constraint
        .ignore();

      addedFiles.push(filePath);
    } catch (error) {
      console.error(`Error adding file ${filePath}:`, error);
      // Continue with next file
    }
  }

  return addedFiles;
}

/**
 * Create a pruned file record in the audit table
 *
 * **v3.7.0+ Compatible**: Includes project_id (required for multi-project support)
 * **v3.5.0+ Feature**: Auto-pruning audit trail
 *
 * @param db - Knex database connection
 * @param taskId - Task ID
 * @param filePath - File path that was pruned
 * @param projectId - Project ID (required for v3.7.0+)
 * @returns Pruned file record ID
 */
export async function createPrunedFileRecord(
  db: Knex,
  taskId: number,
  filePath: string,
  projectId: number = 1
): Promise<number> {
  const currentTs = Math.floor(Date.now() / 1000);

  const [id] = await db('t_task_pruned_files')
    .insert({
      task_id: taskId,
      file_path: filePath,
      pruned_ts: currentTs,
      project_id: projectId  // Required v3.7.0+
    })
    .returning('id');

  return id?.id || id;
}

/**
 * Get watched files for a task
 *
 * @param db - Knex database connection
 * @param taskId - Task ID
 * @returns Array of file paths
 */
export async function getWatchedFiles(
  db: Knex,
  taskId: number
): Promise<string[]> {
  const files = await db('t_task_file_links as tfl')
    .join('m_files as f', 'tfl.file_id', 'f.id')
    .where('tfl.task_id', taskId)
    .select('f.path')
    .orderBy('f.path');

  return files.map(f => f.path);
}
