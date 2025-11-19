/**
 * Schema verification module
 * Provides schema verification utilities using async Knex queries
 */

import { DatabaseAdapter } from './adapters/index.js';

/**
 * Check if schema is already initialized
 * Checks for existence of the m_agents table
 *
 * @param adapter - Database adapter instance
 * @returns true if schema exists, false otherwise
 */
export async function isSchemaInitialized(adapter: DatabaseAdapter): Promise<boolean> {
  try {
    const knex = adapter.getKnex();
    return await knex.schema.hasTable('m_agents');
  } catch (error) {
    return false;
  }
}

/**
 * Get schema version information
 * Returns counts of all master tables to verify schema integrity
 *
 * @param adapter - Database adapter instance
 * @returns Object with table counts
 */
export async function getSchemaInfo(adapter: DatabaseAdapter): Promise<{
  agents: number;
  files: number;
  context_keys: number;
  layers: number;
  tags: number;
  scopes: number;
  constraint_categories: number;
}> {
  const counts = {
    agents: 0,
    files: 0,
    context_keys: 0,
    layers: 0,
    tags: 0,
    scopes: 0,
    constraint_categories: 0,
  };

  try {
    const knex = adapter.getKnex();

    const agentsResult = await knex('m_agents').count('* as count').first() as { count: number } | undefined;
    counts.agents = agentsResult?.count || 0;

    const filesResult = await knex('m_files').count('* as count').first() as { count: number } | undefined;
    counts.files = filesResult?.count || 0;

    const contextKeysResult = await knex('m_context_keys').count('* as count').first() as { count: number } | undefined;
    counts.context_keys = contextKeysResult?.count || 0;

    const layersResult = await knex('m_layers').count('* as count').first() as { count: number } | undefined;
    counts.layers = layersResult?.count || 0;

    const tagsResult = await knex('m_tags').count('* as count').first() as { count: number } | undefined;
    counts.tags = tagsResult?.count || 0;

    const scopesResult = await knex('m_scopes').count('* as count').first() as { count: number } | undefined;
    counts.scopes = scopesResult?.count || 0;

    const categoriesResult = await knex('m_constraint_categories').count('* as count').first() as { count: number } | undefined;
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

  const requiredTables = [
    'm_agents', 'm_files', 'm_context_keys', 'm_constraint_categories',
    'm_layers', 'm_tags', 'm_scopes', 'm_config', 'm_task_statuses',
    't_decisions', 't_decisions_numeric', 't_decision_history',
    't_decision_tags', 't_decision_scopes', 't_decision_context',
    't_agent_messages', 't_file_changes', 't_constraints', 't_constraint_tags',
    't_activity_log', 't_decision_templates',
    't_tasks', 't_task_details', 't_task_tags', 't_task_decision_links',
    't_task_constraint_links', 't_task_file_links', 't_task_dependencies',
    'm_help_tools', 'm_help_actions', 't_help_action_params', 't_help_action_examples',
    'm_help_use_case_categories', 't_help_use_cases', 't_help_action_sequences',
  ];

  const requiredViews = [
    'v_tagged_decisions', 'v_active_context', 'v_layer_summary',
    'v_unread_messages_by_priority', 'v_recent_file_changes', 'v_tagged_constraints',
    'v_task_board',
  ];

  const requiredTriggers = [
    'trg_record_decision_history',
    'trg_log_decision_set',
    'trg_log_decision_update',
    'trg_log_message_send',
    'trg_log_file_record',
    'trg_log_task_create',
    'trg_log_task_status_change',
    'trg_update_task_timestamp',
  ];

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

    // Verify standard data exists
    const layerResult = await knex('m_layers').count('* as count').first() as { count: number } | undefined;
    const layerCount = layerResult?.count || 0;
    if (layerCount < 5) {
      result.errors.push(`Expected 5 standard layers, found ${layerCount}`);
      result.valid = false;
    }

    const categoryResult = await knex('m_constraint_categories').count('* as count').first() as { count: number } | undefined;
    const categoryCount = categoryResult?.count || 0;
    if (categoryCount < 3) {
      result.errors.push(`Expected 3 standard categories, found ${categoryCount}`);
      result.valid = false;
    }

    const tagResult = await knex('m_tags').count('* as count').first() as { count: number } | undefined;
    const tagCount = tagResult?.count || 0;
    if (tagCount < 10) {
      result.errors.push(`Expected 10 standard tags, found ${tagCount}`);
      result.valid = false;
    }

    const configResult = await knex('m_config').count('* as count').first() as { count: number } | undefined;
    const configCount = configResult?.count || 0;
    if (configCount < 6) {
      result.errors.push(`Expected 6 m_config entries, found ${configCount}`);
      result.valid = false;
    }

    const taskStatusResult = await knex('m_task_statuses').count('* as count').first() as { count: number } | undefined;
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
