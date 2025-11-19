import type { Knex } from "knex";

/**
 * Migration: Add Suggest Tool to Help System (v3.9.0)
 *
 * Adds the new suggest tool and its actions to the help system database tables:
 * - m_help_tools: suggest tool entry
 * - m_help_actions: 4 actions (by_key, by_tags, by_context, check_duplicate)
 * - t_help_action_params: Parameters for each action
 * - t_help_action_examples: Code examples for each action
 *
 * Part of v3.9.0 Decision Intelligence System
 */

export async function up(knex: Knex): Promise<void> {
  // Check if suggest tool already exists
  const existingSuggestTool = await knex('m_help_tools')
    .where('tool_name', 'suggest')
    .first();

  if (existingSuggestTool) {
    console.log('✓ Suggest tool already exists in help system, skipping');
    return;
  }

  // =========================================================================
  // 1. Add Suggest Tool to m_help_tools
  // =========================================================================

  await knex('m_help_tools').insert({
    tool_name: 'suggest',
    description: 'Intelligent Decision/Constraint Suggestion System - Find related decisions by key pattern, tags, or full context. Prevents duplicates and ensures consistency. Uses hybrid scoring with configurable relevance thresholds.'
  });

  // =========================================================================
  // 2. Add Suggest Actions to m_help_actions
  // =========================================================================

  await knex('m_help_actions').insert([
    {
      tool_name: 'suggest',
      action_name: 'by_key',
      description: 'Find similar decisions by key pattern matching. Uses intelligent key similarity scoring based on path segments, common prefixes, and word overlap. Returns decisions ranked by relevance score (40 points for key match, 25 for layer, 20 for pattern, 10 for recency, 5 for priority).'
    },
    {
      tool_name: 'suggest',
      action_name: 'by_tags',
      description: 'Find decisions by tag overlap (fast tag-based lookup). Uses inverted tag index for efficient queries. Returns decisions with matching tags ranked by overlap count. Ideal for discovering related decisions by topic or category.'
    },
    {
      tool_name: 'suggest',
      action_name: 'by_context',
      description: 'Hybrid scoring combining key, tags, layer, and priority. Most comprehensive suggestion mode. Analyzes all context dimensions and returns top-ranked decisions. Use when you have rich context and want best matches across all factors.'
    },
    {
      tool_name: 'suggest',
      action_name: 'check_duplicate',
      description: 'Check if decision key already exists or is very similar. Returns exact matches and high-similarity suggestions (score >= 70). Use before creating new decisions to prevent duplicates and discover existing related decisions.'
    }
  ]);

  // =========================================================================
  // 3. Get action IDs for parameter seeding
  // =========================================================================

  const byKeyAction = await knex('m_help_actions')
    .where({ tool_name: 'suggest', action_name: 'by_key' })
    .select('action_id')
    .first();

  const byTagsAction = await knex('m_help_actions')
    .where({ tool_name: 'suggest', action_name: 'by_tags' })
    .select('action_id')
    .first();

  const byContextAction = await knex('m_help_actions')
    .where({ tool_name: 'suggest', action_name: 'by_context' })
    .select('action_id')
    .first();

  const checkDuplicateAction = await knex('m_help_actions')
    .where({ tool_name: 'suggest', action_name: 'check_duplicate' })
    .select('action_id')
    .first();

  if (!byKeyAction || !byTagsAction || !byContextAction || !checkDuplicateAction) {
    throw new Error('Failed to retrieve suggest action IDs');
  }

  // =========================================================================
  // 4. Add Action Parameters to t_help_action_params
  // =========================================================================

  // by_key parameters
  await knex('t_help_action_params').insert([
    {
      action_id: byKeyAction.action_id,
      param_name: 'key',
      param_type: 'string',
      required: 1,
      description: 'Decision key to find similar matches for. Uses path segment analysis and prefix matching.'
    },
    {
      action_id: byKeyAction.action_id,
      param_name: 'limit',
      param_type: 'number',
      required: 0,
      description: 'Maximum number of suggestions to return',
      default_value: '5'
    },
    {
      action_id: byKeyAction.action_id,
      param_name: 'min_score',
      param_type: 'number',
      required: 0,
      description: 'Minimum relevance score (0-100) to include in results',
      default_value: '30'
    }
  ]);

  // by_tags parameters
  await knex('t_help_action_params').insert([
    {
      action_id: byTagsAction.action_id,
      param_name: 'tags',
      param_type: 'array',
      required: 1,
      description: 'Array of tag names to match against. More tags = better filtering.'
    },
    {
      action_id: byTagsAction.action_id,
      param_name: 'layer',
      param_type: 'string',
      required: 0,
      description: 'Filter results to specific architecture layer (presentation, business, data, infrastructure, cross-cutting, documentation, planning, coordination, review)',
      default_value: 'null'
    },
    {
      action_id: byTagsAction.action_id,
      param_name: 'limit',
      param_type: 'number',
      required: 0,
      description: 'Maximum number of suggestions to return',
      default_value: '5'
    },
    {
      action_id: byTagsAction.action_id,
      param_name: 'min_score',
      param_type: 'number',
      required: 0,
      description: 'Minimum relevance score (0-100) to include in results',
      default_value: '30'
    }
  ]);

  // by_context parameters
  await knex('t_help_action_params').insert([
    {
      action_id: byContextAction.action_id,
      param_name: 'key',
      param_type: 'string',
      required: 1,
      description: 'Decision key for similarity matching'
    },
    {
      action_id: byContextAction.action_id,
      param_name: 'tags',
      param_type: 'array',
      required: 0,
      description: 'Array of tags for topic matching',
      default_value: '[]'
    },
    {
      action_id: byContextAction.action_id,
      param_name: 'layer',
      param_type: 'string',
      required: 0,
      description: 'Architecture layer for layer-based scoring',
      default_value: 'null'
    },
    {
      action_id: byContextAction.action_id,
      param_name: 'priority',
      param_type: 'number',
      required: 0,
      description: 'Priority level (1=low, 2=medium, 3=high, 4=critical) for priority-based scoring',
      default_value: 'null'
    },
    {
      action_id: byContextAction.action_id,
      param_name: 'limit',
      param_type: 'number',
      required: 0,
      description: 'Maximum number of suggestions to return',
      default_value: '5'
    },
    {
      action_id: byContextAction.action_id,
      param_name: 'min_score',
      param_type: 'number',
      required: 0,
      description: 'Minimum relevance score (0-100) to include in results',
      default_value: '30'
    }
  ]);

  // check_duplicate parameters
  await knex('t_help_action_params').insert([
    {
      action_id: checkDuplicateAction.action_id,
      param_name: 'key',
      param_type: 'string',
      required: 1,
      description: 'Decision key to check for duplicates. Returns exact match plus high-similarity suggestions (score >= 70).'
    }
  ]);

  // =========================================================================
  // 5. Add Code Examples to t_help_action_examples
  // =========================================================================

  // by_key examples
  await knex('t_help_action_examples').insert([
    {
      action_id: byKeyAction.action_id,
      example_title: 'Find similar authentication decisions',
      example_code: '{"action":"by_key","key":"auth/jwt-strategy","limit":5,"min_score":40}',
      explanation: 'Finds decisions with similar keys to "auth/jwt-strategy" such as "auth/session-strategy" or "auth/oauth-strategy". Returns top 5 with score >= 40.'
    },
    {
      action_id: byKeyAction.action_id,
      example_title: 'Discover related API decisions',
      example_code: '{"action":"by_key","key":"api/rate-limiting","limit":3}',
      explanation: 'Searches for API-related decisions similar to rate-limiting. Returns top 3 matches with default min_score of 30.'
    }
  ]);

  // by_tags examples
  await knex('t_help_action_examples').insert([
    {
      action_id: byTagsAction.action_id,
      example_title: 'Find security and authentication decisions',
      example_code: '{"action":"by_tags","tags":["security","authentication"],"layer":"business","limit":5}',
      explanation: 'Finds business layer decisions tagged with both "security" and "authentication". Fast tag-based lookup.'
    },
    {
      action_id: byTagsAction.action_id,
      example_title: 'Discover performance optimization decisions',
      example_code: '{"action":"by_tags","tags":["performance","caching"],"min_score":50}',
      explanation: 'Searches for decisions tagged with performance and caching, returning only high-relevance matches (score >= 50).'
    }
  ]);

  // by_context examples
  await knex('t_help_action_examples').insert([
    {
      action_id: byContextAction.action_id,
      example_title: 'Comprehensive context search for database decisions',
      example_code: '{"action":"by_context","key":"db/connection-pool","tags":["database","performance"],"layer":"data","priority":3}',
      explanation: 'Uses all context dimensions: key similarity, tag matching, layer filtering, and priority weighting. Returns best overall matches.'
    },
    {
      action_id: byContextAction.action_id,
      example_title: 'Find related infrastructure decisions',
      example_code: '{"action":"by_context","key":"infra/deployment","tags":["docker","kubernetes"],"layer":"infrastructure"}',
      explanation: 'Hybrid scoring across key, tags, and layer for infrastructure decisions. Ideal when you have rich context.'
    }
  ]);

  // check_duplicate examples
  await knex('t_help_action_examples').insert([
    {
      action_id: checkDuplicateAction.action_id,
      example_title: 'Check for duplicate authentication decision',
      example_code: '{"action":"check_duplicate","key":"auth/oauth2-provider"}',
      explanation: 'Checks if "auth/oauth2-provider" already exists and finds very similar decisions (score >= 70). Prevents duplicate creation.'
    },
    {
      action_id: checkDuplicateAction.action_id,
      example_title: 'Verify unique decision before creation',
      example_code: '{"action":"check_duplicate","key":"feature/dark-mode"}',
      explanation: 'Verifies key uniqueness before creating new decision. Returns exact match or high-similarity warnings.'
    }
  ]);

  console.log('✓ Suggest tool added to help system with 4 actions, 15 parameters, and 8 examples');
}

export async function down(knex: Knex): Promise<void> {
  // Remove suggest tool entries (cascades to actions, parameters, and examples)
  await knex('m_help_tools')
    .where('tool_name', 'suggest')
    .delete();

  console.log('✓ Suggest tool removed from help system');
}
