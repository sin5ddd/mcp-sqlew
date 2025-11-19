/**
 * Converted from: src/config/knex/enhancements/20251114121000_add_suggest_tool_use_cases_v3_9_0.ts
 * Line count: 253 → 253 (0% reduction)
 *
 * No wrapper needed - Pure data seeding migration (JSON data insertion)
 *
 * Migration: Add Suggest Tool Use Cases (v3.9.0)
 *
 * Adds comprehensive use cases for the suggest tool workflows:
 * - Preventing duplicate decisions
 * - Finding related decisions for consistency
 * - Discovering decisions by topic (tags)
 * - Context-aware decision discovery
 *
 * Part of v3.9.0 Decision Intelligence System
 */

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Get category IDs
  const decisionCategory = await knex('m_help_use_case_categories')
    .where('category_name', 'decision_tracking')
    .select('category_id')
    .first();

  const crossToolCategory = await knex('m_help_use_case_categories')
    .where('category_name', 'cross_tool_workflow')
    .select('category_id')
    .first();

  if (!decisionCategory || !crossToolCategory) {
    throw new Error('Required use case categories not found. Run seed_help_categories_and_use_cases migration first.');
  }

  // Check if suggest use cases already exist
  const existingUseCases = await knex('t_help_use_cases')
    .where('title', 'like', '%suggest%')
    .orWhere('full_example', 'like', '%suggest%');

  if (existingUseCases.length > 0) {
    console.log('✓ Suggest use cases already exist, skipping');
    return;
  }

  // =========================================================================
  // Add Suggest Tool Use Cases
  // =========================================================================

  await knex('t_help_use_cases').insert([
    {
      category_id: decisionCategory.category_id,
      title: 'Prevent duplicate decisions before creation',
      complexity: 'basic',
      description: 'Use suggest.check_duplicate to verify a decision key is unique before creating it. Prevents duplicate decisions and discovers existing similar decisions that might be updated instead.',
      full_example: JSON.stringify({
        scenario: 'Before creating a new decision about API authentication, check if similar decisions exist',
        steps: [
          {
            step: 1,
            action: 'suggest.check_duplicate',
            code: {
              action: 'check_duplicate',
              key: 'api/authentication-strategy'
            },
            explanation: 'Check if key exists or is very similar (score >= 70)'
          },
          {
            step: 2,
            decision: 'If no exact match found and similarity scores are low, create new decision',
            action: 'decision.set',
            code: {
              action: 'set',
              key: 'api/authentication-strategy',
              value: 'JWT with refresh tokens',
              layer: 'business',
              tags: ['api', 'security', 'authentication']
            }
          },
          {
            step: 3,
            alternative: 'If exact match or high similarity found, update existing decision instead',
            action: 'decision.set',
            code: {
              action: 'set',
              key: 'existing-key-from-suggestion',
              value: 'Updated value',
              version: '1.1.0'
            }
          }
        ]
      }),
      action_sequence: 'suggest.check_duplicate → decision.set (new or update)'
    },
    {
      category_id: decisionCategory.category_id,
      title: 'Find related decisions for consistency',
      complexity: 'intermediate',
      description: 'Use suggest.by_key to find decisions with similar keys when making architectural choices. Ensures consistency across related decisions and helps discover existing patterns.',
      full_example: JSON.stringify({
        scenario: 'When implementing database caching strategy, find related database decisions',
        steps: [
          {
            step: 1,
            action: 'suggest.by_key',
            code: {
              action: 'by_key',
              key: 'db/caching-strategy',
              limit: 5,
              min_score: 40
            },
            explanation: 'Find similar database decisions (db/connection-pool, db/query-optimization, etc.)'
          },
          {
            step: 2,
            action: 'decision.get',
            code: {
              action: 'get',
              key: 'db/connection-pool',
              include_context: true
            },
            explanation: 'Review similar decisions to understand existing patterns'
          },
          {
            step: 3,
            action: 'decision.set',
            code: {
              action: 'set',
              key: 'db/caching-strategy',
              value: 'Redis with write-through pattern',
              layer: 'data',
              tags: ['database', 'caching', 'performance']
            },
            explanation: 'Create new decision consistent with existing db/ pattern'
          }
        ]
      }),
      action_sequence: 'suggest.by_key → decision.get → decision.set'
    },
    {
      category_id: decisionCategory.category_id,
      title: 'Discover decisions by topic using tags',
      complexity: 'basic',
      description: 'Use suggest.by_tags to find all decisions related to a specific topic or feature. Fast tag-based lookup for discovering related context.',
      full_example: JSON.stringify({
        scenario: 'Find all security-related decisions before implementing authentication',
        steps: [
          {
            step: 1,
            action: 'suggest.by_tags',
            code: {
              action: 'by_tags',
              tags: ['security', 'authentication'],
              layer: 'business',
              limit: 10
            },
            explanation: 'Find security and authentication decisions in business layer'
          },
          {
            step: 2,
            action: 'decision.get',
            code: {
              action: 'get',
              key: 'returned-key-from-suggestion',
              include_context: true
            },
            explanation: 'Review each suggested decision for context and rationale'
          }
        ],
        expected_outcome: 'Comprehensive list of security decisions to guide implementation',
        common_pitfalls: [
          'Using too many tags (reduces matches)',
          'Not specifying layer (gets results from all layers)',
          'Setting min_score too high (excludes valid results)'
        ]
      }),
      action_sequence: 'suggest.by_tags → decision.get (for each result)'
    },
    {
      category_id: crossToolCategory.category_id,
      title: 'Context-aware decision discovery',
      complexity: 'advanced',
      description: 'Use suggest.by_context for comprehensive decision discovery using all context dimensions: key similarity, tag overlap, layer matching, and priority weighting. Ideal when you have rich context.',
      full_example: JSON.stringify({
        scenario: 'Find relevant decisions when implementing critical infrastructure change',
        steps: [
          {
            step: 1,
            action: 'suggest.by_context',
            code: {
              action: 'by_context',
              key: 'infra/kubernetes-migration',
              tags: ['infrastructure', 'deployment', 'docker'],
              layer: 'infrastructure',
              priority: 4,
              limit: 5,
              min_score: 50
            },
            explanation: 'Hybrid scoring across key, tags, layer, and priority for best matches'
          },
          {
            step: 2,
            action: 'decision.get',
            code: {
              action: 'get',
              key: 'suggested-decision-key',
              include_context: true
            },
            explanation: 'Review suggested decision context and rationale'
          },
          {
            step: 3,
            action: 'decision.add_decision_context',
            code: {
              action: 'add_decision_context',
              key: 'infra/kubernetes-migration',
              rationale: 'Based on successful docker patterns from similar decisions',
              alternatives_considered: [
                {
                  option: 'Direct VM deployment',
                  rejected_because: 'Less flexible than container orchestration'
                }
              ],
              tradeoffs: {
                pros: ['Auto-scaling', 'High availability'],
                cons: ['Increased complexity', 'Learning curve']
              }
            },
            explanation: 'Document new decision with context referencing related decisions'
          }
        ],
        expected_outcome: 'Well-informed decision based on comprehensive context discovery',
        common_pitfalls: [
          'Not providing enough context (tags, layer)',
          'Setting min_score too high for exploratory search',
          'Ignoring priority weighting for critical decisions'
        ],
        related_tools: ['decision', 'task']
      }),
      action_sequence: 'suggest.by_context → decision.get → decision.add_decision_context'
    }
  ]);

  console.log('✓ Added 4 suggest tool use cases (1 basic, 1 intermediate, 1 advanced, 1 cross-tool)');
}

export async function down(knex: Knex): Promise<void> {
  // Remove suggest use cases
  await knex('t_help_use_cases')
    .where('title', 'like', '%suggest%')
    .orWhere('title', 'like', '%duplicate decision%')
    .orWhere('title', 'like', '%related decisions%')
    .orWhere('title', 'like', '%Context-aware decision%')
    .delete();

  console.log('✓ Removed suggest tool use cases');
}
