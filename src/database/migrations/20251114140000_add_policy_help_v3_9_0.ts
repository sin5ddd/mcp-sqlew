/**
 * Converted from: src/config/knex/enhancements/20251114140000_add_policy_help_v3_9_0.ts
 * Changes:
 * - No Universal Knex Wrapper needed (pure data seeding migration)
 * - Original code already idempotent and cross-database compatible
 * - Line count: 244 (original) → 244 (no reduction - optimal as-is)
 */

import type { Knex } from "knex";

/**
 * Migration: Add Policy Actions to Help System (v3.9.0)
 *
 * Adds documentation for 3 policy management actions:
 * - create_policy
 * - list_policies
 * - set_from_policy
 *
 * Part of v3.9.0 Decision Intelligence System
 */

export async function up(knex: Knex): Promise<void> {
  // Check if policy actions already documented
  const existingActions = await knex('m_help_actions')
    .where('tool_name', 'decision')
    .whereIn('action_name', ['create_policy', 'list_policies', 'set_from_policy'])
    .select('action_name');

  if (existingActions.length > 0) {
    console.log('✓ Policy help already exists, skipping');
    return;
  }

  // Add policy actions to m_help_actions
  await knex('m_help_actions').insert([
    {
      tool_name: 'decision',
      action_name: 'create_policy',
      description: 'Create reusable decision policy with validation rules, quality gates, and auto-suggestion triggers. Policies standardize common decision types and enforce architectural standards across team.'
    },
    {
      tool_name: 'decision',
      action_name: 'list_policies',
      description: 'List all available decision policies with optional filtering by category or suggestion behavior. Shows policy defaults, validation rules, and quality requirements.'
    },
    {
      tool_name: 'decision',
      action_name: 'set_from_policy',
      description: 'Create decision from policy template. Applies policy defaults (layer, tags, priority) and validates against policy rules. Automatically triggers suggestions if policy has suggest_similar enabled.'
    }
  ]);

  // Get action IDs for parameter seeding
  const createPolicyAction = await knex('m_help_actions')
    .where({ tool_name: 'decision', action_name: 'create_policy' })
    .select('action_id')
    .first();

  const listPoliciesAction = await knex('m_help_actions')
    .where({ tool_name: 'decision', action_name: 'list_policies' })
    .select('action_id')
    .first();

  const setFromPolicyAction = await knex('m_help_actions')
    .where({ tool_name: 'decision', action_name: 'set_from_policy' })
    .select('action_id')
    .first();

  if (!createPolicyAction || !listPoliciesAction || !setFromPolicyAction) {
    throw new Error('Failed to retrieve policy action IDs');
  }

  // Add parameters for create_policy
  await knex('t_help_action_params').insert([
    {
      action_id: createPolicyAction.action_id,
      param_name: 'name',
      param_type: 'string',
      required: 1,
      description: 'Policy name (unique identifier). Use snake_case (e.g., "security_vulnerability", "architecture_decision").'
    },
    {
      action_id: createPolicyAction.action_id,
      param_name: 'defaults',
      param_type: 'object',
      required: 1,
      description: 'Default metadata applied to decisions: {layer, status, tags, priority}. Decisions can override these.'
    },
    {
      action_id: createPolicyAction.action_id,
      param_name: 'validation_rules',
      param_type: 'object',
      required: 0,
      description: 'Validation rules with regex patterns: {patterns: {field_name: "regex"}}. Validates key, value, or context fields.',
      default_value: 'null'
    },
    {
      action_id: createPolicyAction.action_id,
      param_name: 'quality_gates',
      param_type: 'object',
      required: 0,
      description: 'Quality requirements: {required_fields: ["rationale", "alternatives"]}. Enforces decision documentation standards.',
      default_value: 'null'
    },
    {
      action_id: createPolicyAction.action_id,
      param_name: 'suggest_similar',
      param_type: 'boolean',
      required: 0,
      description: 'Auto-trigger suggestions when decisions match this policy. Use for critical decision types to prevent duplicates.',
      default_value: 'false'
    },
    {
      action_id: createPolicyAction.action_id,
      param_name: 'category',
      param_type: 'string',
      required: 0,
      description: 'Policy category for organization (e.g., "security", "architecture", "performance").',
      default_value: 'null'
    }
  ]);

  // Add parameters for list_policies
  await knex('t_help_action_params').insert([
    {
      action_id: listPoliciesAction.action_id,
      param_name: 'category',
      param_type: 'string',
      required: 0,
      description: 'Filter policies by category (e.g., "security", "architecture").',
      default_value: 'null'
    },
    {
      action_id: listPoliciesAction.action_id,
      param_name: 'suggest_similar',
      param_type: 'boolean',
      required: 0,
      description: 'Filter policies by auto-suggestion behavior. True = policies that trigger suggestions.',
      default_value: 'null'
    }
  ]);

  // Add parameters for set_from_policy
  await knex('t_help_action_params').insert([
    {
      action_id: setFromPolicyAction.action_id,
      param_name: 'policy_name',
      param_type: 'string',
      required: 1,
      description: 'Policy to use (e.g., "security_vulnerability"). Policy defaults will be applied.'
    },
    {
      action_id: setFromPolicyAction.action_id,
      param_name: 'key',
      param_type: 'string',
      required: 1,
      description: 'Decision key. Will be validated against policy patterns if defined.'
    },
    {
      action_id: setFromPolicyAction.action_id,
      param_name: 'value',
      param_type: 'string|number',
      required: 1,
      description: 'Decision value. Will be validated against policy patterns if defined.'
    },
    {
      action_id: setFromPolicyAction.action_id,
      param_name: 'layer',
      param_type: 'string',
      required: 0,
      description: 'Override policy default layer.',
      default_value: 'null'
    },
    {
      action_id: setFromPolicyAction.action_id,
      param_name: 'tags',
      param_type: 'array',
      required: 0,
      description: 'Override or extend policy default tags.',
      default_value: '[]'
    },
    {
      action_id: setFromPolicyAction.action_id,
      param_name: 'rationale',
      param_type: 'string',
      required: 0,
      description: 'Rationale/justification. Required if policy has quality_gates.required_fields.',
      default_value: 'null'
    },
    {
      action_id: setFromPolicyAction.action_id,
      param_name: 'alternatives',
      param_type: 'array',
      required: 0,
      description: 'Alternatives considered. Required if policy has quality_gates.required_fields.',
      default_value: '[]'
    }
  ]);

  // Add code examples
  await knex('t_help_action_examples').insert([
    {
      action_id: createPolicyAction.action_id,
      example_title: 'Create security vulnerability policy',
      example_code: '{"action":"create_policy","name":"security_vulnerability","defaults":{"layer":"cross-cutting","tags":["security","vulnerability"],"priority":4},"validation_rules":{"patterns":{"key":"^CVE-\\\\d{4}-\\\\d{4,7}$"}},"quality_gates":{"required_fields":["rationale"]},"suggest_similar":true,"category":"security"}',
      explanation: 'Creates policy for CVE tracking with key pattern validation, required rationale, and auto-suggestions.'
    },
    {
      action_id: createPolicyAction.action_id,
      example_title: 'Create architecture decision policy',
      example_code: '{"action":"create_policy","name":"architecture_decision","defaults":{"layer":"infrastructure","tags":["architecture","adr"],"priority":3},"quality_gates":{"required_fields":["rationale","alternatives","tradeoffs"]},"suggest_similar":true,"category":"architecture"}',
      explanation: 'Creates ADR policy requiring full decision context (rationale, alternatives, tradeoffs).'
    },
    {
      action_id: listPoliciesAction.action_id,
      example_title: 'List all policies',
      example_code: '{"action":"list_policies"}',
      explanation: 'Returns all available policies with defaults, validation rules, and quality gates.'
    },
    {
      action_id: listPoliciesAction.action_id,
      example_title: 'List policies with auto-suggestions',
      example_code: '{"action":"list_policies","suggest_similar":true}',
      explanation: 'Returns only policies that auto-trigger suggestions (suggest_similar=true).'
    },
    {
      action_id: setFromPolicyAction.action_id,
      example_title: 'Create CVE decision from policy',
      example_code: '{"action":"set_from_policy","policy_name":"security_vulnerability","key":"CVE-2024-12345","value":"SQL injection vulnerability in user authentication","rationale":"Discovered during security audit. Allows authentication bypass via crafted input."}',
      explanation: 'Creates decision using security_vulnerability policy. Policy enforces CVE format, adds security tags, and triggers suggestions for related vulnerabilities.'
    },
    {
      action_id: setFromPolicyAction.action_id,
      example_title: 'Create architecture decision from policy',
      example_code: '{"action":"set_from_policy","policy_name":"architecture_decision","key":"arch/microservices-migration","value":"Migrate to microservices architecture","rationale":"Improve scalability and team autonomy","alternatives":[{"option":"Monolith","rejected_because":"Cannot scale horizontally"}],"tradeoffs":{"pros":["Better scalability","Team autonomy"],"cons":["Operational complexity","Network overhead"]}}',
      explanation: 'Creates ADR using architecture_decision policy. Policy enforces full decision context and auto-triggers related architecture suggestions.'
    }
  ]);

  console.log('✓ Added policy help (3 actions, 15 parameters, 6 examples)');
}

export async function down(knex: Knex): Promise<void> {
  // Remove policy action help (cascades to parameters and examples)
  await knex('m_help_actions')
    .where('tool_name', 'decision')
    .whereIn('action_name', ['create_policy', 'list_policies', 'set_from_policy'])
    .delete();

  console.log('✓ Removed policy help');
}
