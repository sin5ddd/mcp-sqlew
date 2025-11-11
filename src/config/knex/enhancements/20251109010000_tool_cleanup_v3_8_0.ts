/**
 * Migration: Tool Cleanup for v3.8.0
 *
 * Updates the help system metadata to reflect the new tool structure:
 *
 * Removed Tools:
 * - stats (help queries moved to dedicated tools)
 * - message (deprecated in v3.6.5)
 * - config (removed from public API)
 *
 * Added Tools:
 * - help (query action documentation, parameters, workflows)
 * - example (browse and search code examples)
 * - use_case (browse complete workflow scenarios)
 *
 * Updated Actions:
 * - task: batch_create → create_batch (naming consistency)
 * - file: added sqlite_flush action
 *
 * Idempotency:
 * - Checks if changes already applied before executing
 * - Safe to run multiple times
 */

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  console.log('🔧 Updating help system for v3.8.0 tool cleanup...');

  // =========================================================================
  // 1. Remove deprecated tools from m_help_tools
  // =========================================================================

  const toolsToRemove = ['stats', 'message', 'config'];
  for (const toolName of toolsToRemove) {
    const exists = await knex('m_help_tools')
      .where('tool_name', toolName)
      .first();

    if (exists) {
      await knex('m_help_tools').where('tool_name', toolName).del();
      console.log(`  ✓ Removed ${toolName} tool`);
    } else {
      console.log(`  ✓ ${toolName} tool already removed`);
    }
  }

  // =========================================================================
  // 2. Add new tools to m_help_tools
  // =========================================================================

  const newTools = [
    {
      tool_name: 'help',
      description: 'Help System - Query action documentation, parameters, and workflow guidance. Returns only requested information (80-95% token reduction vs legacy help).',
    },
    {
      tool_name: 'example',
      description: 'Example System - Browse and search code examples for sqlew tools. Returns working code snippets with explanations (token-efficient).',
    },
    {
      tool_name: 'use_case',
      description: 'Use Case Catalog - Browse and search complete workflow scenarios. Returns end-to-end workflows with executable code examples and step-by-step guidance.',
    },
  ];

  for (const tool of newTools) {
    const exists = await knex('m_help_tools')
      .where('tool_name', tool.tool_name)
      .first();

    if (!exists) {
      await knex('m_help_tools').insert(tool);
      console.log(`  ✓ Added ${tool.tool_name} tool`);
    } else {
      console.log(`  ✓ ${tool.tool_name} tool already exists`);
    }
  }

  // =========================================================================
  // 3. Update file tool description (add sqlite_flush)
  // =========================================================================

  const fileToolExists = await knex('m_help_tools')
    .where('tool_name', 'file')
    .first();

  if (fileToolExists) {
    await knex('m_help_tools')
      .where('tool_name', 'file')
      .update({
        description: 'File Change Tracking - Track file modifications and database operations (SQLite only). Supports file change recording, history retrieval, lock detection, and WAL flushing for persistence.',
      });
    console.log('  ✓ Updated file tool description');
  } else {
    console.log('  ⚠ file tool not found, skipping description update');
  }

  // =========================================================================
  // 4. Update task tool description (batch_create → create_batch)
  // =========================================================================

  const taskToolExists = await knex('m_help_tools')
    .where('tool_name', 'task')
    .first();

  if (taskToolExists) {
    await knex('m_help_tools')
      .where('tool_name', 'task')
      .update({
        description: 'Task Management - Create, track, and manage tasks with kanban workflow, layers, and file tracking. Supports batch operations (create_batch), dependencies, file watching, and automatic stale detection.',
      });
    console.log('  ✓ Updated task tool description');
  } else {
    console.log('  ⚠ task tool not found, skipping description update');
  }

  // =========================================================================
  // 5. Rename task action: batch_create → create_batch in m_help_actions
  // =========================================================================

  const batchCreateAction = await knex('m_help_actions')
    .where({ tool_name: 'task', action_name: 'batch_create' })
    .first();

  const createBatchAction = await knex('m_help_actions')
    .where({ tool_name: 'task', action_name: 'create_batch' })
    .first();

  if (batchCreateAction && !createBatchAction) {
    // Rename batch_create to create_batch
    await knex('m_help_actions')
      .where({ tool_name: 'task', action_name: 'batch_create' })
      .update({ action_name: 'create_batch' });
    console.log('  ✓ Renamed task.batch_create → task.create_batch');
  } else if (createBatchAction) {
    console.log('  ✓ task.create_batch already exists');

    // Clean up old batch_create if it still exists
    if (batchCreateAction) {
      await knex('m_help_actions')
        .where({ tool_name: 'task', action_name: 'batch_create' })
        .del();
      console.log('  ✓ Removed duplicate task.batch_create');
    }
  } else {
    console.log('  ⚠ Neither task.batch_create nor task.create_batch found');
  }

  // =========================================================================
  // 6. Add file.sqlite_flush action if missing
  // =========================================================================

  const sqliteFlushAction = await knex('m_help_actions')
    .where({ tool_name: 'file', action_name: 'sqlite_flush' })
    .first();

  if (!sqliteFlushAction) {
    await knex('m_help_actions').insert({
      tool_name: 'file',
      action_name: 'sqlite_flush',
      description: 'Flush WAL (Write-Ahead Log) to database file for immediate persistence. SQLite-specific operation ensuring all pending writes are committed to disk. Returns flush status and checkpoint info.',
    });
    console.log('  ✓ Added file.sqlite_flush action');
  } else {
    console.log('  ✓ file.sqlite_flush action already exists');
  }

  // =========================================================================
  // 7. Update references in t_help_action_examples (batch_create → create_batch)
  // =========================================================================

  // Get action_id for the renamed action (if it exists)
  const renamedAction = await knex('m_help_actions')
    .where({ tool_name: 'task', action_name: 'create_batch' })
    .first();

  if (renamedAction) {
    // Update example_code that mentions batch_create
    const examplesWithBatchCreate = await knex('t_help_action_examples')
      .where('example_code', 'like', '%batch_create%')
      .orWhere('example_title', 'like', '%batch_create%')
      .orWhere('explanation', 'like', '%batch_create%');

    if (examplesWithBatchCreate.length > 0) {
      for (const example of examplesWithBatchCreate) {
        await knex('t_help_action_examples')
          .where('example_id', example.example_id)
          .update({
            example_code: example.example_code?.replace(/batch_create/g, 'create_batch'),
            example_title: example.example_title?.replace(/batch_create/g, 'create_batch'),
            explanation: example.explanation?.replace(/batch_create/g, 'create_batch'),
          });
      }
      console.log(`  ✓ Updated ${examplesWithBatchCreate.length} examples (batch_create → create_batch)`);
    } else {
      console.log('  ✓ No examples referencing batch_create found');
    }
  }

  // =========================================================================
  // 8. Update references in t_help_use_cases (batch_create → create_batch)
  // =========================================================================

  const useCasesWithBatchCreate = await knex('t_help_use_cases')
    .where('description', 'like', '%batch_create%')
    .orWhere('full_example', 'like', '%batch_create%')
    .orWhere('action_sequence', 'like', '%batch_create%')
    .orWhere('title', 'like', '%batch_create%');

  if (useCasesWithBatchCreate.length > 0) {
    for (const useCase of useCasesWithBatchCreate) {
      await knex('t_help_use_cases')
        .where('use_case_id', useCase.use_case_id)
        .update({
          title: useCase.title?.replace(/batch_create/g, 'create_batch'),
          description: useCase.description?.replace(/batch_create/g, 'create_batch'),
          full_example: useCase.full_example?.replace(/batch_create/g, 'create_batch'),
          action_sequence: useCase.action_sequence?.replace(/batch_create/g, 'create_batch'),
        });
    }
    console.log(`  ✓ Updated ${useCasesWithBatchCreate.length} use cases (batch_create → create_batch)`);
  } else {
    console.log('  ✓ No use cases referencing batch_create found');
  }

  console.log('✅ Tool cleanup migration completed successfully');
}

export async function down(knex: Knex): Promise<void> {
  console.log('🔧 Reverting v3.8.0 tool cleanup...');

  // =========================================================================
  // 1. Restore removed tools
  // =========================================================================

  const toolsToRestore = [
    {
      tool_name: 'stats',
      description: 'Statistics & Utilities - View stats, activity logs, manage data cleanup, and access help system. Provides database statistics, layer summaries, activity history, and granular help queries with 60-70% token reduction.',
    },
    {
      tool_name: 'message',
      description: 'Agent Messaging - Send messages between agents with priority levels and read tracking. Enables asynchronous communication and coordination in multi-agent workflows with priority-based filtering.',
    },
    {
      tool_name: 'config',
      description: 'Configuration - Manage auto-deletion settings with weekend-aware retention. Control message and file history retention periods with support for skipping weekends in cleanup calculations.',
    },
  ];

  for (const tool of toolsToRestore) {
    const exists = await knex('m_help_tools')
      .where('tool_name', tool.tool_name)
      .first();

    if (!exists) {
      await knex('m_help_tools').insert(tool);
      console.log(`  ✓ Restored ${tool.tool_name} tool`);
    } else {
      console.log(`  ✓ ${tool.tool_name} tool already exists`);
    }
  }

  // =========================================================================
  // 2. Remove new tools
  // =========================================================================

  const toolsToRemove = ['help', 'example', 'use_case'];
  for (const toolName of toolsToRemove) {
    const exists = await knex('m_help_tools')
      .where('tool_name', toolName)
      .first();

    if (exists) {
      await knex('m_help_tools').where('tool_name', toolName).del();
      console.log(`  ✓ Removed ${toolName} tool`);
    } else {
      console.log(`  ✓ ${toolName} tool already removed`);
    }
  }

  // =========================================================================
  // 3. Restore original file tool description
  // =========================================================================

  const fileToolExists = await knex('m_help_tools')
    .where('tool_name', 'file')
    .first();

  if (fileToolExists) {
    await knex('m_help_tools')
      .where('tool_name', 'file')
      .update({
        description: 'File Change Tracking - Track file changes with layer classification and lock detection. Maintain change history, prevent concurrent edit conflicts, and associate file modifications with architecture layers.',
      });
    console.log('  ✓ Restored file tool description');
  }

  // =========================================================================
  // 4. Restore original task tool description
  // =========================================================================

  const taskToolExists = await knex('m_help_tools')
    .where('tool_name', 'task')
    .first();

  if (taskToolExists) {
    await knex('m_help_tools')
      .where('tool_name', 'task')
      .update({
        description: 'Kanban Task Watcher - AI-optimized task management with auto-stale detection. Create, track, and coordinate development tasks with metadata, dependencies, and automatic file watching. Features status validation and flat hierarchy for AI simplicity.',
      });
    console.log('  ✓ Restored task tool description');
  }

  // =========================================================================
  // 5. Rename task action: create_batch → batch_create
  // =========================================================================

  const createBatchAction = await knex('m_help_actions')
    .where({ tool_name: 'task', action_name: 'create_batch' })
    .first();

  if (createBatchAction) {
    await knex('m_help_actions')
      .where({ tool_name: 'task', action_name: 'create_batch' })
      .update({ action_name: 'batch_create' });
    console.log('  ✓ Renamed task.create_batch → task.batch_create');
  }

  // =========================================================================
  // 6. Remove file.sqlite_flush action
  // =========================================================================

  const sqliteFlushAction = await knex('m_help_actions')
    .where({ tool_name: 'file', action_name: 'sqlite_flush' })
    .first();

  if (sqliteFlushAction) {
    await knex('m_help_actions')
      .where({ tool_name: 'file', action_name: 'sqlite_flush' })
      .del();
    console.log('  ✓ Removed file.sqlite_flush action');
  }

  // =========================================================================
  // 7. Restore references in examples (create_batch → batch_create)
  // =========================================================================

  const examplesWithCreateBatch = await knex('t_help_action_examples')
    .where('example_code', 'like', '%create_batch%')
    .orWhere('example_title', 'like', '%create_batch%')
    .orWhere('explanation', 'like', '%create_batch%');

  if (examplesWithCreateBatch.length > 0) {
    for (const example of examplesWithCreateBatch) {
      await knex('t_help_action_examples')
        .where('example_id', example.example_id)
        .update({
          example_code: example.example_code?.replace(/create_batch/g, 'batch_create'),
          example_title: example.example_title?.replace(/create_batch/g, 'batch_create'),
          explanation: example.explanation?.replace(/create_batch/g, 'batch_create'),
        });
    }
    console.log(`  ✓ Restored ${examplesWithCreateBatch.length} examples (create_batch → batch_create)`);
  }

  // =========================================================================
  // 8. Restore references in use cases (create_batch → batch_create)
  // =========================================================================

  const useCasesWithCreateBatch = await knex('t_help_use_cases')
    .where('description', 'like', '%create_batch%')
    .orWhere('full_example', 'like', '%create_batch%')
    .orWhere('action_sequence', 'like', '%create_batch%')
    .orWhere('title', 'like', '%create_batch%');

  if (useCasesWithCreateBatch.length > 0) {
    for (const useCase of useCasesWithCreateBatch) {
      await knex('t_help_use_cases')
        .where('use_case_id', useCase.use_case_id)
        .update({
          title: useCase.title?.replace(/create_batch/g, 'batch_create'),
          description: useCase.description?.replace(/create_batch/g, 'batch_create'),
          full_example: useCase.full_example?.replace(/create_batch/g, 'batch_create'),
          action_sequence: useCase.action_sequence?.replace(/create_batch/g, 'batch_create'),
        });
    }
    console.log(`  ✓ Restored ${useCasesWithCreateBatch.length} use cases (create_batch → batch_create)`);
  }

  console.log('✅ Tool cleanup revert completed successfully');
}
