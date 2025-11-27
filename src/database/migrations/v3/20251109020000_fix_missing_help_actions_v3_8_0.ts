/**
 * Converted from: src/config/knex/enhancements/20251109020000_fix_missing_help_actions_v3_8_0.ts
 * Line count: 252 → 252 (0% reduction)
 *
 * No wrapper needed - Pure data seeding migration
 *
 * Migration: Fix Missing Help Actions (v3.8.0)
 *
 * CRITICAL BUG FIX: The help database (m_help_actions table) is severely out of sync
 * with the actual tool implementations. This causes the help system to lie to users
 * about what actions are available.
 *
 * Issue discovered: When trying to use decision.set_batch, it was rejected as
 * "Action not found" by help system, but the action exists in code and works correctly.
 *
 * Root Cause: Original seed migration (20251025100000) did not seed all actions.
 * Tool cleanup migration (20251109010000) updated some but not all missing actions.
 *
 * Missing Actions by Tool:
 * - decision: 9 actions (quick_set, search_advanced, set_batch, has_updates,
 *   set_from_template, create_template, list_templates, hard_delete, use_case)
 * - task: 14 actions (update, get, list, move, link, archive, create_batch,
 *   add_dependency, remove_dependency, get_dependencies, watch_files,
 *   get_pruned_files, link_pruned_file, watcher, use_case)
 * - constraint: 1 action (use_case)
 * - file: 0 actions (all present after tool cleanup migration)
 *
 * This migration adds all missing actions with proper descriptions.
 *
 * Idempotency: Checks for existing actions before inserting.
 */

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  console.log('🔧 Adding missing help actions to m_help_actions...');

  // =========================================================================
  // 1. Add missing decision tool actions
  // =========================================================================

  const decisionActions = [
    {
      tool_name: 'decision',
      action_name: 'quick_set',
      description: 'Simplified decision setter with auto-inferred layer from key prefix (api/* → presentation, db/* → data). Reduces required parameters from 7 to 2 for rapid documentation.',
    },
    {
      tool_name: 'decision',
      action_name: 'search_advanced',
      description: 'Advanced search with multiple filter criteria: layers, tags (AND/OR/NOT), scopes, date ranges, decided_by, statuses, full-text search. Supports sorting and pagination.',
    },
    {
      tool_name: 'decision',
      action_name: 'set_batch',
      description: 'Batch set multiple decisions atomically (all succeed or all fail) or non-atomically. Limit: 50 items per batch. Validates all items before transaction.',
    },
    {
      tool_name: 'decision',
      action_name: 'has_updates',
      description: 'Check if specific agent has new/updated decisions since given timestamp. Returns boolean and count for tracking stale context.',
    },
    {
      tool_name: 'decision',
      action_name: 'set_from_template',
      description: 'Create decision from predefined template (breaking_change, deprecated_feature, performance_optimization). Templates provide structured metadata.',
    },
    {
      tool_name: 'decision',
      action_name: 'create_template',
      description: 'Create reusable decision template from existing decision. Templates standardize common decision types across team.',
    },
    {
      tool_name: 'decision',
      action_name: 'list_templates',
      description: 'List all available decision templates with metadata. Includes built-in and custom templates.',
    },
    {
      tool_name: 'decision',
      action_name: 'hard_delete',
      description: 'Permanently delete decision and all version history. WARNING: Irreversible operation. Use deactivate/deprecate for normal workflows.',
    },
    {
      tool_name: 'decision',
      action_name: 'use_case',
      description: 'Browse decision tool use cases with complete workflows. Filter by category and complexity.',
    },
  ];

  for (const action of decisionActions) {
    const exists = await knex('m_help_actions')
      .where({ tool_name: action.tool_name, action_name: action.action_name })
      .first();

    if (!exists) {
      await knex('m_help_actions').insert(action);
      console.log(`  ✓ Added ${action.tool_name}.${action.action_name}`);
    } else {
      console.log(`  ✓ ${action.tool_name}.${action.action_name} already exists`);
    }
  }

  // =========================================================================
  // 2. Add missing task tool actions
  // =========================================================================

  const taskActions = [
    {
      tool_name: 'task',
      action_name: 'update',
      description: 'Update existing task fields (title, description, layer, assigned_agent). Preserves file links and dependencies.',
    },
    {
      tool_name: 'task',
      action_name: 'get',
      description: 'Get single task by ID with full details: file links, decision/constraint links, dependencies, status history.',
    },
    {
      tool_name: 'task',
      action_name: 'list',
      description: 'List tasks with flexible filtering: status, layer, assigned_agent, stale detection. Supports pagination and sorting.',
    },
    {
      tool_name: 'task',
      action_name: 'move',
      description: 'Move task between kanban columns (todo → in_progress → review → done). Validates state transitions and updates timestamps.',
    },
    {
      tool_name: 'task',
      action_name: 'link',
      description: 'Link task to decision or constraint. Creates bidirectional relationship for traceability.',
    },
    {
      tool_name: 'task',
      action_name: 'archive',
      description: 'Archive completed task. Marks as archived (soft delete) while preserving history and relationships.',
    },
    {
      tool_name: 'task',
      action_name: 'create_batch',
      description: 'Batch create multiple tasks atomically (all succeed or all fail) or non-atomically. Limit: 50 items per batch.',
    },
    {
      tool_name: 'task',
      action_name: 'add_dependency',
      description: 'Add dependency between tasks (task A blocks task B). Validates no circular dependencies.',
    },
    {
      tool_name: 'task',
      action_name: 'remove_dependency',
      description: 'Remove existing task dependency. Unblocks dependent task.',
    },
    {
      tool_name: 'task',
      action_name: 'get_dependencies',
      description: 'Get all dependencies for a task: both blocking (dependencies) and blocked_by (dependents).',
    },
    {
      tool_name: 'task',
      action_name: 'watch_files',
      description: 'Associate files with task for automatic change tracking. Returns watched file list.',
    },
    {
      tool_name: 'task',
      action_name: 'get_pruned_files',
      description: 'Get files that were removed from task file_actions but still exist in filesystem. Helps cleanup orphaned associations.',
    },
    {
      tool_name: 'task',
      action_name: 'link_pruned_file',
      description: 'Re-link pruned file to task. Restores file association after accidental removal.',
    },
    {
      tool_name: 'task',
      action_name: 'watcher',
      description: 'Get file watcher status: active watches, recent changes, stale tasks. For monitoring task-file synchronization.',
    },
    {
      tool_name: 'task',
      action_name: 'use_case',
      description: 'Browse task tool use cases with complete workflows. Filter by category and complexity.',
    },
  ];

  for (const action of taskActions) {
    const exists = await knex('m_help_actions')
      .where({ tool_name: action.tool_name, action_name: action.action_name })
      .first();

    if (!exists) {
      await knex('m_help_actions').insert(action);
      console.log(`  ✓ Added ${action.tool_name}.${action.action_name}`);
    } else {
      console.log(`  ✓ ${action.tool_name}.${action.action_name} already exists`);
    }
  }

  // =========================================================================
  // 3. Add missing constraint tool action
  // =========================================================================

  const constraintAction = {
    tool_name: 'constraint',
    action_name: 'use_case',
    description: 'Browse constraint tool use cases with complete workflows. Filter by category and complexity.',
  };

  const constraintExists = await knex('m_help_actions')
    .where({ tool_name: constraintAction.tool_name, action_name: constraintAction.action_name })
    .first();

  if (!constraintExists) {
    await knex('m_help_actions').insert(constraintAction);
    console.log(`  ✓ Added ${constraintAction.tool_name}.${constraintAction.action_name}`);
  } else {
    console.log(`  ✓ ${constraintAction.tool_name}.${constraintAction.action_name} already exists`);
  }

  console.log('✅ Help actions database synchronized with code');
}

export async function down(knex: Knex): Promise<void> {
  console.log('🔄 Removing added help actions...');

  // Remove decision actions
  const decisionActions = [
    'quick_set', 'search_advanced', 'set_batch', 'has_updates',
    'set_from_template', 'create_template', 'list_templates', 'hard_delete', 'use_case'
  ];

  for (const actionName of decisionActions) {
    await knex('m_help_actions')
      .where({ tool_name: 'decision', action_name: actionName })
      .del();
  }

  // Remove task actions
  const taskActions = [
    'update', 'get', 'list', 'move', 'link', 'archive', 'create_batch',
    'add_dependency', 'remove_dependency', 'get_dependencies', 'watch_files',
    'get_pruned_files', 'link_pruned_file', 'watcher', 'use_case'
  ];

  for (const actionName of taskActions) {
    await knex('m_help_actions')
      .where({ tool_name: 'task', action_name: actionName })
      .del();
  }

  // Remove constraint action
  await knex('m_help_actions')
    .where({ tool_name: 'constraint', action_name: 'use_case' })
    .del();

  console.log('✅ Removed added help actions');
}
