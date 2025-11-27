/**
 * Schema verification module (v4.0)
 * Provides schema verification utilities using async Knex queries
 *
 * v4.0 Update: All tables now use v4_ prefix instead of m_/t_ prefixes
 * v4.0 Update: v4_agents table removed (agent tracking eliminated)
 */

import { DatabaseAdapter } from './adapters/index.js';

/**
 * Check if schema is already initialized
 * Checks for existence of the v4_projects table (v4 schema)
 * Note: v4_agents removed in v4.0 - now checks v4_projects
 *
 * @param adapter - Database adapter instance
 * @returns true if schema exists, false otherwise
 */
export async function isSchemaInitialized(adapter: DatabaseAdapter): Promise<boolean> {
  try {
    const knex = adapter.getKnex();
    return await knex.schema.hasTable('v4_projects');
  } catch (error) {
    return false;
  }
}

/**
 * Get schema version information
 * Returns counts of all master tables to verify schema integrity
 * Note: agents count removed in v4.0 (agent tracking eliminated)
 *
 * @param adapter - Database adapter instance
 * @returns Object with table counts
 */
export async function getSchemaInfo(adapter: DatabaseAdapter): Promise<{
  files: number;
  context_keys: number;
  layers: number;
  tags: number;
  scopes: number;
  constraint_categories: number;
}> {
  const counts = {
    files: 0,
    context_keys: 0,
    layers: 0,
    tags: 0,
    scopes: 0,
    constraint_categories: 0,
  };

  try {
    const knex = adapter.getKnex();

    const filesResult = await knex('v4_files').count('* as count').first() as { count: number } | undefined;
    counts.files = filesResult?.count || 0;

    const contextKeysResult = await knex('v4_context_keys').count('* as count').first() as { count: number } | undefined;
    counts.context_keys = contextKeysResult?.count || 0;

    const layersResult = await knex('v4_layers').count('* as count').first() as { count: number } | undefined;
    counts.layers = layersResult?.count || 0;

    const tagsResult = await knex('v4_tags').count('* as count').first() as { count: number } | undefined;
    counts.tags = tagsResult?.count || 0;

    const scopesResult = await knex('v4_scopes').count('* as count').first() as { count: number } | undefined;
    counts.scopes = scopesResult?.count || 0;

    const categoriesResult = await knex('v4_constraint_categories').count('* as count').first() as { count: number } | undefined;
    counts.constraint_categories = categoriesResult?.count || 0;
  } catch (error) {
    // If tables don't exist yet, return zeros
  }

  return counts;
}

/**
 * Verify schema integrity
 * Checks that all required tables, indexes, views, and triggers exist
 *
 * @param adapter - Database adapter instance
 * @returns Object with integrity check results
 */
export async function verifySchemaIntegrity(adapter: DatabaseAdapter): Promise<{
  valid: boolean;
  missing: string[];
  errors: string[];
}> {
  const result = {
    valid: true,
    missing: [] as string[],
    errors: [] as string[],
  };

  // v4.0: All tables use v4_ prefix, views and triggers removed for cross-DB compatibility
  // Note: v4_agents removed in v4.0 (agent tracking eliminated)
  const requiredTables = [
    // Master tables (v4_config removed in v4.0 - config is now in-memory)
    'v4_files', 'v4_context_keys', 'v4_constraint_categories',
    'v4_layers', 'v4_tags', 'v4_scopes', 'v4_task_statuses',
    'v4_projects',
    // Transaction tables
    'v4_decisions', 'v4_decisions_numeric', 'v4_decision_history',
    'v4_decision_tags', 'v4_decision_scopes', 'v4_decision_context',
    'v4_decision_policies',
    'v4_file_changes', 'v4_constraints', 'v4_constraint_tags',
    'v4_tasks', 'v4_task_tags', 'v4_task_decision_links',
    'v4_task_constraint_links', 'v4_task_file_links', 'v4_task_dependencies',
    'v4_task_pruned_files',
    // Help system tables
    'v4_help_tools', 'v4_help_actions', 'v4_help_action_params', 'v4_help_action_examples',
    'v4_help_use_case_cats', 'v4_help_use_cases', 'v4_help_action_sequences',
  ];

  // v4.0: Views removed for cross-DB compatibility (replaced with application-level queries)
  const requiredViews: string[] = [];

  // v4.0: Triggers removed for cross-DB compatibility (replaced with application-level logic)
  const requiredTriggers: string[] = [];

  try {
    const knex = adapter.getKnex();

    // Check tables
    for (const table of requiredTables) {
      const exists = await knex.schema.hasTable(table);
      if (!exists) {
        result.valid = false;
        result.missing.push(`table:${table}`);
      }
    }

    // Check views - use raw query for SQLite, hasTable for others
    for (const view of requiredViews) {
      let exists = false;
      try {
        // Try hasTable first (works for some databases with views)
        exists = await knex.schema.hasTable(view);
      } catch {
        // Fall back to raw query for SQLite
        const viewResult = await knex.raw(
          "SELECT name FROM sqlite_master WHERE type='view' AND name=?",
          [view]
        ) as any;
        exists = viewResult && viewResult.length > 0 && viewResult[0];
      }

      if (!exists) {
        result.valid = false;
        result.missing.push(`view:${view}`);
      }
    }

    // Check triggers - SQLite-specific
    for (const trigger of requiredTriggers) {
      const triggerResult = await knex.raw(
        "SELECT name FROM sqlite_master WHERE type='trigger' AND name=?",
        [trigger]
      ) as any;
      const exists = triggerResult && triggerResult.length > 0 && triggerResult[0];

      if (!exists) {
        result.valid = false;
        result.missing.push(`trigger:${trigger}`);
      }
    }

    // Verify standard data exists (v4 tables)
    const layerResult = await knex('v4_layers').count('* as count').first() as { count: number } | undefined;
    const layerCount = layerResult?.count || 0;
    if (layerCount < 9) {  // v4: 9 layers (expanded from 5)
      result.errors.push(`Expected 9 standard layers, found ${layerCount}`);
      result.valid = false;
    }

    const categoryResult = await knex('v4_constraint_categories').count('* as count').first() as { count: number } | undefined;
    const categoryCount = categoryResult?.count || 0;
    if (categoryCount < 3) {
      result.errors.push(`Expected 3 standard categories, found ${categoryCount}`);
      result.valid = false;
    }

    const tagResult = await knex('v4_tags').count('* as count').first() as { count: number } | undefined;
    const tagCount = tagResult?.count || 0;
    if (tagCount < 10) {
      result.errors.push(`Expected 10 standard tags, found ${tagCount}`);
      result.valid = false;
    }

    // Note: v4_config removed in v4.0 - config is now in-memory

    const taskStatusResult = await knex('v4_task_statuses').count('* as count').first() as { count: number } | undefined;
    const taskStatusCount = taskStatusResult?.count || 0;
    if (taskStatusCount < 6) {
      result.errors.push(`Expected 6 task statuses, found ${taskStatusCount}`);
      result.valid = false;
    }

  } catch (error) {
    result.valid = false;
    result.errors.push(error instanceof Error ? error.message : String(error));
  }

  return result;
}
