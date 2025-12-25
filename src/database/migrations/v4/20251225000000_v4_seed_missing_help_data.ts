/**
 * v4 Seed Missing Help Data Migration
 *
 * Adds missing help system data:
 * - v4_help_action_params for analytics, by_key, by_tags, check_duplicate
 * - v4_help_action_examples (initial examples)
 *
 * This migration supplements the original seed migration with
 * data that was missing in v4.1.1 clean installs.
 */

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  console.error('🌱 Seeding missing help system data...');

  // Get action IDs
  const actions = await knex('v4_help_actions').select('id', 'tool_name', 'action_name');
  const actionMap = actions.reduce((map: Record<string, number>, action: { id: number; tool_name: string; action_name: string }) => {
    map[`${action.tool_name}:${action.action_name}`] = action.id;
    return map;
  }, {} as Record<string, number>);

  // 1. Seed missing v4_help_action_params
  const missingParams = [
    // DECISION:ANALYTICS
    { action_id: actionMap['decision:analytics'], param_name: 'action', param_type: 'string', required: 1, description: 'Must be "analytics"', default_value: null },
    { action_id: actionMap['decision:analytics'], param_name: 'key_pattern', param_type: 'string', required: 1, description: 'SQL LIKE pattern for decision keys (e.g., "metric/%")', default_value: null },
    { action_id: actionMap['decision:analytics'], param_name: 'aggregation', param_type: 'string', required: 1, description: 'Aggregation type: avg, sum, max, min, count', default_value: null },
    { action_id: actionMap['decision:analytics'], param_name: 'layer', param_type: 'string', required: 0, description: 'Filter by layer', default_value: null },
    { action_id: actionMap['decision:analytics'], param_name: 'time_series', param_type: 'object', required: 0, description: 'Time series options: { bucket, start_ts, end_ts }', default_value: null },
    { action_id: actionMap['decision:analytics'], param_name: 'percentiles', param_type: 'number[]', required: 0, description: 'Percentiles to calculate (e.g., [50, 90, 95, 99])', default_value: null },

    // SUGGEST:BY_KEY
    { action_id: actionMap['suggest:by_key'], param_name: 'action', param_type: 'string', required: 1, description: 'Must be "by_key"', default_value: null },
    { action_id: actionMap['suggest:by_key'], param_name: 'key', param_type: 'string', required: 1, description: 'Decision key pattern to search', default_value: null },
    { action_id: actionMap['suggest:by_key'], param_name: 'limit', param_type: 'number', required: 0, description: 'Max suggestions', default_value: '5' },
    { action_id: actionMap['suggest:by_key'], param_name: 'min_score', param_type: 'number', required: 0, description: 'Minimum relevance score', default_value: '30' },

    // SUGGEST:BY_TAGS
    { action_id: actionMap['suggest:by_tags'], param_name: 'action', param_type: 'string', required: 1, description: 'Must be "by_tags"', default_value: null },
    { action_id: actionMap['suggest:by_tags'], param_name: 'tags', param_type: 'string[]', required: 1, description: 'Tags to search for', default_value: null },
    { action_id: actionMap['suggest:by_tags'], param_name: 'layer', param_type: 'string', required: 0, description: 'Filter by layer', default_value: null },
    { action_id: actionMap['suggest:by_tags'], param_name: 'limit', param_type: 'number', required: 0, description: 'Max suggestions', default_value: '5' },
    { action_id: actionMap['suggest:by_tags'], param_name: 'min_score', param_type: 'number', required: 0, description: 'Minimum relevance score', default_value: '15' },

    // SUGGEST:CHECK_DUPLICATE
    { action_id: actionMap['suggest:check_duplicate'], param_name: 'action', param_type: 'string', required: 1, description: 'Must be "check_duplicate"', default_value: null },
    { action_id: actionMap['suggest:check_duplicate'], param_name: 'key', param_type: 'string', required: 1, description: 'Decision key to check', default_value: null },
    { action_id: actionMap['suggest:check_duplicate'], param_name: 'tags', param_type: 'string[]', required: 0, description: 'Tags for context matching', default_value: '[]' },
    { action_id: actionMap['suggest:check_duplicate'], param_name: 'layer', param_type: 'string', required: 0, description: 'Layer for context matching', default_value: null },
  ].filter(p => p.action_id);

  if (missingParams.length > 0) {
    // Check for existing params to avoid duplicates
    for (const param of missingParams) {
      const exists = await knex('v4_help_action_params')
        .where({ action_id: param.action_id, param_name: param.param_name })
        .first();
      if (!exists) {
        await knex('v4_help_action_params').insert(param);
      }
    }
    console.error(`  ✓ Missing help action params seeded`);
  }

  // 2. Seed v4_help_action_examples
  const existingExamples = await knex('v4_help_action_examples').count('* as count').first();
  if (!existingExamples || Number(existingExamples.count) === 0) {
    const examples = [
      // DECISION:SET examples
      {
        action_id: actionMap['decision:set'],
        title: 'Basic decision',
        code: JSON.stringify({
          action: 'set',
          key: 'auth/method',
          value: 'JWT tokens with refresh',
          tags: ['security', 'auth'],
          layer: 'infrastructure'
        }, null, 2),
        explanation: 'Store a simple architectural decision with tags and layer'
      },
      {
        action_id: actionMap['decision:set'],
        title: 'Decision with context',
        code: JSON.stringify({
          action: 'set',
          key: 'database/orm',
          value: 'Prisma',
          tags: ['database', 'orm'],
          layer: 'data',
          rationale: 'Type safety and migration support',
          alternatives: 'TypeORM, Knex, raw SQL',
          tradeoffs: 'Learning curve, but better DX'
        }, null, 2),
        explanation: 'Store a decision with full context (rationale, alternatives, tradeoffs)'
      },

      // DECISION:LIST examples
      {
        action_id: actionMap['decision:list'],
        title: 'List all decisions',
        code: JSON.stringify({
          action: 'list'
        }, null, 2),
        explanation: 'Get all active decisions'
      },
      {
        action_id: actionMap['decision:list'],
        title: 'Filter by layer',
        code: JSON.stringify({
          action: 'list',
          layer: 'infrastructure',
          limit: 10
        }, null, 2),
        explanation: 'List decisions filtered by architecture layer'
      },

      // SUGGEST:BY_KEY examples
      {
        action_id: actionMap['suggest:by_key'],
        title: 'Find similar by key',
        code: JSON.stringify({
          action: 'by_key',
          key: 'auth'
        }, null, 2),
        explanation: 'Find decisions with keys similar to "auth" (e.g., auth/method, auth/provider)'
      },

      // SUGGEST:BY_TAGS examples
      {
        action_id: actionMap['suggest:by_tags'],
        title: 'Find by tags',
        code: JSON.stringify({
          action: 'by_tags',
          tags: ['security', 'auth']
        }, null, 2),
        explanation: 'Find decisions tagged with security or auth'
      },

      // DECISION:ANALYTICS examples
      {
        action_id: actionMap['decision:analytics'],
        title: 'Count decisions',
        code: JSON.stringify({
          action: 'analytics',
          key_pattern: '%',
          aggregation: 'count'
        }, null, 2),
        explanation: 'Count all decisions in the database'
      },
      {
        action_id: actionMap['decision:analytics'],
        title: 'Average metric value',
        code: JSON.stringify({
          action: 'analytics',
          key_pattern: 'metric/api-latency/%',
          aggregation: 'avg',
          layer: 'infrastructure'
        }, null, 2),
        explanation: 'Calculate average of numeric decisions matching pattern'
      },

      // TASK:CREATE examples
      {
        action_id: actionMap['task:create'],
        title: 'Create simple task',
        code: JSON.stringify({
          action: 'create',
          title: 'Implement user authentication',
          priority: 3,
          layer: 'business'
        }, null, 2),
        explanation: 'Create a high-priority task in the business layer'
      },

      // CONSTRAINT:ADD examples
      {
        action_id: actionMap['constraint:add'],
        title: 'Add architectural constraint',
        code: JSON.stringify({
          action: 'add',
          constraint_text: 'All API endpoints must validate input',
          category: 'security',
          priority: 3,
          layer: 'infrastructure'
        }, null, 2),
        explanation: 'Add a security constraint to enforce input validation'
      }
    ].filter(e => e.action_id);

    if (examples.length > 0) {
      await knex('v4_help_action_examples').insert(examples);
      console.error(`  ✓ Help action examples seeded (${examples.length})`);
    }
  } else {
    console.error('  ℹ Help action examples already exist, skipping');
  }

  console.error('🎉 Missing help system data seeded!');
}

export async function down(knex: Knex): Promise<void> {
  // Remove examples added by this migration
  await knex('v4_help_action_examples').del();

  // Remove params added by this migration (analytics, by_key, by_tags, check_duplicate)
  const actions = await knex('v4_help_actions')
    .whereIn('action_name', ['analytics', 'by_key', 'by_tags', 'check_duplicate'])
    .select('id');
  const actionIds = actions.map(a => a.id);

  if (actionIds.length > 0) {
    await knex('v4_help_action_params')
      .whereIn('action_id', actionIds)
      .del();
  }

  console.error('🗑️ Missing help system data removed');
}
