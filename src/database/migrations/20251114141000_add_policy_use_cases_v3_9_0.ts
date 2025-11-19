/**
 * Converted from: src/config/knex/enhancements/20251114141000_add_policy_use_cases_v3_9_0.ts
 * Changes:
 * - No Universal Knex Wrapper needed (pure data seeding migration)
 * - Original code already idempotent and cross-database compatible
 * - Line count: 248 (original) → 248 (no reduction - optimal as-is)
 */

import type { Knex } from "knex";

/**
 * Migration: Add Policy Use Cases (v3.9.0)
 *
 * Adds comprehensive use cases for policy workflows:
 * - Creating custom team policies
 * - Using policies to enforce decision quality
 * - Leveraging auto-suggestions from policies
 *
 * Part of v3.9.0 Decision Intelligence System
 */

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
    throw new Error('Required use case categories not found');
  }

  // Check if policy use cases already exist
  const existing = await knex('t_help_use_cases')
    .where('title', 'like', '%policy%')
    .where('full_example', 'like', '%create_policy%');

  if (existing.length > 0) {
    console.log('✓ Policy use cases already exist, skipping');
    return;
  }

  // Add policy use cases
  await knex('t_help_use_cases').insert([
    {
      category_id: decisionCategory.category_id,
      title: 'Create custom policy for team standards',
      complexity: 'basic',
      description: 'Define a custom decision policy that enforces team standards for specific decision types. Policies provide defaults, validation rules, and quality requirements.',
      full_example: JSON.stringify({
        scenario: 'Your team needs to standardize API endpoint decisions with consistent metadata and documentation',
        steps: [
          {
            step: 1,
            action: 'decision.create_policy',
            code: {
              action: 'create_policy',
              name: 'api_endpoint',
              defaults: {
                layer: 'presentation',
                tags: ['api', 'endpoint'],
                priority: 2
              },
              validation_rules: {
                patterns: {
                  key: '^api/v\\d+/'  // Must start with api/v1/, api/v2/, etc.
                }
              },
              quality_gates: {
                required_fields: ['rationale']  // Must document endpoint purpose
              },
              suggest_similar: true,
              category: 'api'
            },
            explanation: 'Create policy enforcing API versioning pattern and documentation standards'
          },
          {
            step: 2,
            action: 'decision.set_from_policy',
            code: {
              action: 'set_from_policy',
              policy_name: 'api_endpoint',
              key: 'api/v1/users/create',
              value: 'POST endpoint for user registration',
              rationale: 'Allows new users to register with email and password'
            },
            explanation: 'Create API decision using policy. Policy auto-applies layer and tags, validates key format, and triggers suggestions for related endpoints.'
          }
        ],
        expected_outcome: 'Consistent API decisions with standardized metadata and documentation',
        common_pitfalls: [
          'Regex patterns need proper escaping in JSON',
          'Policy names must be unique per project',
          'Quality gate fields must exactly match decision context field names'
        ]
      }),
      action_sequence: 'decision.create_policy → decision.set_from_policy'
    },
    {
      category_id: decisionCategory.category_id,
      title: 'Enforce decision quality with policies',
      complexity: 'intermediate',
      description: 'Use policies to enforce documentation standards for architectural decisions. Policies validate that critical decisions include rationale, alternatives, and tradeoffs.',
      full_example: JSON.stringify({
        scenario: 'Your team wants to ensure all architecture decisions follow ADR (Architecture Decision Record) format',
        steps: [
          {
            step: 1,
            action: 'decision.list_policies',
            code: {
              action: 'list_policies'
            },
            explanation: 'Check if architecture_decision policy exists (built-in policy)'
          },
          {
            step: 2,
            action: 'decision.set_from_policy',
            code: {
              action: 'set_from_policy',
              policy_name: 'architecture_decision',
              key: 'arch/database-choice',
              value: 'Use PostgreSQL for primary database',
              rationale: 'Need ACID compliance, JSON support, and strong ecosystem',
              alternatives: [
                {
                  option: 'MongoDB',
                  rejected_because: 'Weak transaction support for financial data'
                },
                {
                  option: 'MySQL',
                  rejected_because: 'Limited JSON query capabilities'
                }
              ],
              tradeoffs: {
                pros: ['ACID compliance', 'JSON support', 'Mature ecosystem'],
                cons: ['Higher memory usage', 'Steeper learning curve']
              }
            },
            explanation: 'Create architecture decision. Policy enforces full ADR context (rationale, alternatives, tradeoffs).'
          },
          {
            step: 3,
            validation: 'If rationale or alternatives are missing, policy validation fails',
            error_example: {
              success: false,
              policy_validation: {
                valid: false,
                matched_policy: 'architecture_decision',
                violations: ['Quality gate: Required field missing: "rationale"']
              }
            }
          }
        ],
        expected_outcome: 'All architecture decisions have comprehensive documentation meeting ADR standards',
        common_pitfalls: [
          'Forgetting to include required fields (rationale, alternatives, tradeoffs)',
          'Not using set_from_policy - won\'t trigger validation',
          'Policy validation is advisory - decision still created but violations returned'
        ],
        related_tools: ['decision']
      }),
      action_sequence: 'decision.list_policies → decision.set_from_policy (with validation)'
    },
    {
      category_id: crossToolCategory.category_id,
      title: 'Auto-trigger suggestions with policies',
      complexity: 'advanced',
      description: 'Configure policies to automatically trigger similarity suggestions when decisions are created. Prevents duplicates and ensures consistency for critical decision types like security vulnerabilities.',
      full_example: JSON.stringify({
        scenario: 'Track CVE security vulnerabilities with auto-suggestions to discover related issues',
        steps: [
          {
            step: 1,
            action: 'decision.set_from_policy',
            code: {
              action: 'set_from_policy',
              policy_name: 'security_vulnerability',
              key: 'CVE-2024-12345',
              value: 'SQL injection in authentication endpoint',
              rationale: 'Allows bypass via crafted input in login form'
            },
            explanation: 'Create CVE decision using built-in security_vulnerability policy. Policy has suggest_similar=true, so suggestions auto-trigger.'
          },
          {
            step: 2,
            response_includes: 'Auto-generated suggestions',
            example_response: {
              success: true,
              key: 'CVE-2024-12345',
              message: 'Decision created',
              suggestions: {
                triggered_by: 'security_vulnerability',
                reason: 'Policy has suggest_similar enabled',
                suggestions: [
                  {
                    key: 'CVE-2024-11111',
                    score: 75,
                    layer: 'cross-cutting',
                    tags: ['security', 'vulnerability']
                  }
                ]
              }
            },
            explanation: 'Response includes auto-triggered suggestions for related CVEs based on tags and layer'
          },
          {
            step: 3,
            action: 'decision.get',
            code: {
              action: 'get',
              key: 'CVE-2024-11111',
              include_context: true
            },
            explanation: 'Review suggested CVE to understand related vulnerability and potential patterns'
          },
          {
            step: 4,
            action: 'decision.add_decision_context',
            code: {
              action: 'add_decision_context',
              key: 'CVE-2024-12345',
              related_decisions: ['CVE-2024-11111']
            },
            explanation: 'Link related CVEs for cross-referencing'
          }
        ],
        expected_outcome: 'Automatic discovery of related security issues, preventing duplicate reports and revealing patterns',
        common_pitfalls: [
          'Auto-suggestions only trigger when using set_from_policy with suggest_similar=true policy',
          'Suggestions require min_score threshold (default: 50) - low similarity matches excluded',
          'Policy validation failures prevent auto-suggestions'
        ],
        related_tools: ['decision', 'suggest']
      }),
      action_sequence: 'decision.set_from_policy (auto-triggers suggest.by_context) → decision.get → decision.add_decision_context'
    }
  ]);

  console.log('✓ Added 3 policy use cases (1 basic, 1 intermediate, 1 advanced)');
}

export async function down(knex: Knex): Promise<void> {
  // Remove policy use cases
  await knex('t_help_use_cases')
    .where('title', 'like', '%policy%')
    .where('full_example', 'like', '%create_policy%')
    .delete();

  console.log('✓ Removed policy use cases');
}
