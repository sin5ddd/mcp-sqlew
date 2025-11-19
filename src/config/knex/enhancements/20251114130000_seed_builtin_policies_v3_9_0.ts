import type { Knex } from "knex";

/**
 * Migration: Seed Built-in Decision Policies (v3.9.0)
 *
 * Seeds 5 standard policies for common decision types:
 * 1. security_vulnerability - CVE tracking with pattern validation
 * 2. breaking_change - Version changes with semver and migration docs
 * 3. architecture_decision - ADRs with rationale and alternatives
 * 4. performance_optimization - Performance improvements with metrics
 * 5. deprecation - Deprecation notices with replacement recommendations
 *
 * Part of v3.9.0 Decision Intelligence System
 */

export async function up(knex: Knex): Promise<void> {
  // Check if built-in policies already exist
  const existingPolicies = await knex('t_decision_policies')
    .whereIn('name', [
      'security_vulnerability',
      'breaking_change',
      'architecture_decision',
      'performance_optimization',
      'deprecation'
    ])
    .select('name');

  if (existingPolicies.length > 0) {
    console.log('✓ Built-in policies already seeded, skipping');
    return;
  }

  // Get system agent ID
  let systemAgentId: number;
  const systemAgent = await knex('m_agents')
    .where('name', 'system')
    .select('id')
    .first();

  if (systemAgent) {
    systemAgentId = systemAgent.id;
  } else {
    const [agentId] = await knex('m_agents').insert({
      name: 'system',
      last_active_ts: Math.floor(Date.now() / 1000)
    });
    systemAgentId = agentId;
  }

  // Seed built-in policies
  await knex('t_decision_policies').insert([
    {
      name: 'security_vulnerability',
      defaults: JSON.stringify({
        layer: 'cross-cutting',
        status: 'active',
        tags: ['security', 'vulnerability'],
        priority: 4  // Critical
      }),
      validation_rules: JSON.stringify({
        patterns: {
          key: '^CVE-\\d{4}-\\d{4,7}$'  // CVE-YYYY-NNNNN format
        }
      }),
      quality_gates: JSON.stringify({
        required_fields: ['rationale']  // Must explain the vulnerability
      }),
      required_fields: JSON.stringify(['rationale']),  // Legacy compatibility
      suggest_similar: 1,  // Auto-trigger suggestions for related CVEs
      category: 'security',
      created_by: systemAgentId,
      project_id: 1,  // Default project
      ts: Math.floor(Date.now() / 1000)
    },
    {
      name: 'breaking_change',
      defaults: JSON.stringify({
        layer: 'infrastructure',
        status: 'active',
        tags: ['breaking-change', 'versioning'],
        priority: 4  // Critical
      }),
      validation_rules: JSON.stringify({
        patterns: {
          value: '.*migration.*|.*upgrade.*'  // Must mention migration or upgrade path
        }
      }),
      quality_gates: JSON.stringify({
        required_fields: ['rationale', 'alternatives']  // Must explain why and what alternatives exist
      }),
      required_fields: JSON.stringify(['rationale', 'alternatives']),  // Legacy compatibility
      suggest_similar: 1,  // Auto-trigger to find related breaking changes
      category: 'versioning',
      created_by: systemAgentId,
      project_id: 1,
      ts: Math.floor(Date.now() / 1000)
    },
    {
      name: 'architecture_decision',
      defaults: JSON.stringify({
        layer: 'infrastructure',
        status: 'active',
        tags: ['architecture', 'adr'],
        priority: 3  // High
      }),
      quality_gates: JSON.stringify({
        required_fields: ['rationale', 'alternatives', 'tradeoffs']  // Full ADR documentation
      }),
      required_fields: JSON.stringify(['rationale', 'alternatives', 'tradeoffs']),  // Legacy compatibility
      suggest_similar: 1,  // Find related architectural decisions
      category: 'architecture',
      created_by: systemAgentId,
      project_id: 1,
      ts: Math.floor(Date.now() / 1000)
    },
    {
      name: 'performance_optimization',
      defaults: JSON.stringify({
        layer: 'infrastructure',
        status: 'active',
        tags: ['performance', 'optimization'],
        priority: 2  // Medium
      }),
      quality_gates: JSON.stringify({
        required_fields: ['rationale']  // Must explain performance improvement
      }),
      required_fields: JSON.stringify(['rationale']),  // Legacy compatibility
      suggest_similar: 1,  // Find related performance decisions
      category: 'performance',
      created_by: systemAgentId,
      project_id: 1,
      ts: Math.floor(Date.now() / 1000)
    },
    {
      name: 'deprecation',
      defaults: JSON.stringify({
        layer: 'infrastructure',
        status: 'active',
        tags: ['deprecation', 'migration'],
        priority: 3  // High
      }),
      validation_rules: JSON.stringify({
        patterns: {
          value: '.*replace.*|.*alternative.*|.*migration.*'  // Must mention replacement or migration
        }
      }),
      quality_gates: JSON.stringify({
        required_fields: ['rationale', 'alternatives']  // Must explain why and recommend alternatives
      }),
      required_fields: JSON.stringify(['rationale', 'alternatives']),  // Legacy compatibility
      suggest_similar: 1,  // Find related deprecations
      category: 'deprecation',
      created_by: systemAgentId,
      project_id: 1,
      ts: Math.floor(Date.now() / 1000)
    }
  ]);

  console.log('✓ Seeded 5 built-in policies (security_vulnerability, breaking_change, architecture_decision, performance_optimization, deprecation)');
}

export async function down(knex: Knex): Promise<void> {
  // Remove built-in policies
  await knex('t_decision_policies')
    .whereIn('name', [
      'security_vulnerability',
      'breaking_change',
      'architecture_decision',
      'performance_optimization',
      'deprecation'
    ])
    .where('project_id', 1)  // Only remove from default project
    .delete();

  console.log('✓ Removed built-in policies');
}
