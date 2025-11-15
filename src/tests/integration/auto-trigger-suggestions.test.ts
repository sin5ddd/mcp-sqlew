/**
 * Auto-Trigger Suggestions Integration Test (Task 407)
 *
 * Tests the integration of policy-based suggestion triggering in decision.set
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { setDecision } from '../../tools/context/index.js';
import { getAdapter, initializeDatabase, closeDatabase } from '../../database.js';
import { getProjectContext, ProjectContext } from '../../utils/project-context.js';

describe('Auto-Trigger Suggestions (Task 407)', () => {
  before(async () => {
    // Initialize database with SQLite using test-specific database
    const adapter = await initializeDatabase({
      databaseType: 'sqlite',
      connection: { filename: '.tmp-test/auto-trigger-suggestions.db' }
    });

    // Set up project context (required after v3.7.0)
    const knex = adapter.getKnex();
    const projectContext = ProjectContext.getInstance();
    await projectContext.ensureProject(knex, 'test-auto-trigger-suggestions', 'config', {
      projectRootPath: process.cwd(),
    });

    // Clean up any existing test data from previous runs
    const projectId = projectContext.getProjectId();

    // Delete test policy
    await knex('t_decision_policies')
      .where('name', 'security_vulnerability')
      .where('project_id', projectId)
      .delete();

    // Get key IDs for CVE decisions and test decisions
    const cveKeyIds = await knex('m_context_keys')
      .select('id')
      .where('key', 'like', 'CVE-%')
      .orWhere('key', 'like', 'test/autotrigger/%');

    const keyIds = cveKeyIds.map((row: any) => row.id);

    if (keyIds.length > 0) {
      // Delete in order of dependencies (child tables first)
      await knex('t_decision_tags')
        .whereIn('decision_key_id', keyIds)
        .where('project_id', projectId)
        .delete();

      await knex('t_decision_scopes')
        .whereIn('decision_key_id', keyIds)
        .where('project_id', projectId)
        .delete();

      await knex('t_decision_history')
        .whereIn('key_id', keyIds)
        .delete();

      await knex('t_decisions')
        .whereIn('key_id', keyIds)
        .where('project_id', projectId)
        .delete();

      await knex('t_decisions_numeric')
        .whereIn('key_id', keyIds)
        .where('project_id', projectId)
        .delete();

      await knex('m_context_keys')
        .whereIn('id', keyIds)
        .delete();
    }
  });

  after(async () => {
    // Clean up test data
    const adapter = getAdapter();
    const knex = adapter.getKnex();
    const projectId = getProjectContext().getProjectId();

    // Get key IDs for CVE decisions and test decisions
    const cveKeyIds = await knex('m_context_keys')
      .select('id')
      .where('key', 'like', 'CVE-%')
      .orWhere('key', 'like', 'test/autotrigger/%');

    const keyIds = cveKeyIds.map((row: any) => row.id);

    if (keyIds.length > 0) {
      // Delete in order of dependencies (child tables first)
      // 1. Delete decision tags (junction table)
      await knex('t_decision_tags')
        .whereIn('decision_key_id', keyIds)
        .where('project_id', projectId)
        .delete();

      // 2. Delete decision scopes (junction table)
      await knex('t_decision_scopes')
        .whereIn('decision_key_id', keyIds)
        .where('project_id', projectId)
        .delete();

      // 3. Delete decision history
      await knex('t_decision_history')
        .whereIn('key_id', keyIds)
        .delete();

      // 4. Delete decisions from both tables
      await knex('t_decisions')
        .whereIn('key_id', keyIds)
        .where('project_id', projectId)
        .delete();

      await knex('t_decisions_numeric')
        .whereIn('key_id', keyIds)
        .where('project_id', projectId)
        .delete();

      // 5. Delete context keys
      await knex('m_context_keys')
        .whereIn('id', keyIds)
        .delete();
    }

    // Delete test policy
    await knex('t_decision_policies')
      .where('name', 'security_vulnerability')
      .where('project_id', projectId)
      .delete();

    await closeDatabase();
  });

  it('should auto-trigger suggestions when policy has suggest_similar=1', async () => {
    const adapter = getAdapter();
    const knex = adapter.getKnex();
    const projectId = getProjectContext().getProjectId();

    // Delete existing policy first (migration may have created it with defaults)
    await knex('t_decision_policies')
      .where('name', 'security_vulnerability')
      .where('project_id', projectId)
      .delete();

    // Get system agent
    let systemAgentId: number;
    const systemAgent = await knex('m_agents').where('name', 'system').select('id').first();
    if (systemAgent) {
      systemAgentId = systemAgent.id;
    } else {
      const [agentId] = await knex('m_agents').insert({
        name: 'system',
        last_active_ts: Math.floor(Date.now() / 1000)
      });
      systemAgentId = agentId;
    }

    // Create test policy with suggest_similar=1 (matches CVE-* keys)
    await knex('t_decision_policies').insert({
      name: 'security_vulnerability',
      project_id: projectId,
      defaults: JSON.stringify({ layer: 'cross-cutting', tags: ['security', 'vulnerability'] }),
      suggest_similar: 1,
      validation_rules: JSON.stringify({
        patterns: {
          key: '^CVE-'  // Match CVE-* keys
        }
      }),
      quality_gates: null,
      created_by: systemAgentId,
      ts: Math.floor(Date.now() / 1000)
    });

    // Create a related decision first (for suggestions)
    await setDecision({
      key: 'CVE-2024-0001',
      value: 'Fixed buffer overflow in auth module',
      tags: ['security', 'vulnerability', 'auth'],
      layer: 'infrastructure',
      scopes: ['MODULE:auth']
    });

    // Create another related decision (use different tags/key to avoid triggering duplicate detection)
    await setDecision({
      key: 'DB-PERF-2024-001',
      value: 'Optimized database query performance for user search',
      tags: ['database', 'performance', 'optimization'],
      layer: 'data',
      scopes: ['MODULE:database']
    });

    // Create decision that should trigger suggestions
    // v3.9.0 Three-Tier System:
    // - Tier 1 (35-44): Gentle nudge (non-blocking warning)
    // - Tier 2 (45-59): Hard block (error thrown)
    // - Tier 3 (60+): Auto-update (transparent update)
    //
    // This test accepts ANY tier as evidence that auto-trigger works
    let result: any;
    let wasBlocked = false;

    try {
      result = await setDecision({
        key: 'CVE-2024-0003',
        value: 'Fixed XSS vulnerability in React component rendering',
        tags: ['security', 'vulnerability', 'frontend'],  // 2/3 overlap with CVE-0001
        layer: 'presentation',  // Different layer to keep score below 60
        scopes: ['MODULE:frontend']
      });
    } catch (error: any) {
      // Tier 2/3: Hard block - match either "DUPLICATE DETECTED" or "DUPLICATE_DETECTED"
      const isDuplicateError = error.message && (
        error.message.includes('DUPLICATE DETECTED') ||
        error.message.includes('DUPLICATE_DETECTED') ||
        error.message.includes('HIGH-SIMILARITY')
      );

      if (isDuplicateError) {
        wasBlocked = true;
        console.log('  ✓ Auto-trigger worked (Tier 2 hard block or higher)');
      } else {
        throw error; // Unexpected error
      }
    }

    if (wasBlocked) {
      // Test passed - blocking is evidence of auto-trigger
      assert.ok(true, 'Auto-trigger worked: detected similarity and blocked');
      return;
    }

    // Tier 1: If not blocked, verify gentle nudge was triggered
    assert.ok(result, 'Result should exist if not blocked');
    assert.ok(result.policy_validation, 'Should have policy_validation field');
    assert.strictEqual(
      result.policy_validation?.matched_policy,
      'security_vulnerability',
      'Should match security_vulnerability policy'
    );

    // Verify auto-trigger provided suggestions (Tier 1 gentle nudge)
    const hasSuggestions = (result as any).duplicate_risk || result.suggestions;
    assert.ok(hasSuggestions, 'Auto-trigger should provide suggestions (Tier 1) or block (Tier 2+)');

    if ((result as any).duplicate_risk) {
      // v3.9.0 format
      const suggestionsList = (result as any).duplicate_risk.suggestions;
      assert.ok(suggestionsList && suggestionsList.length > 0, 'Should have at least one suggestion');
      assert.ok(suggestionsList[0].key, 'Suggestion should have key');
      assert.ok(suggestionsList[0].reasoning, 'Suggestion should have reasoning');
    } else if (result.suggestions) {
      // Legacy format
      const suggestionsList = result.suggestions.suggestions;
      assert.ok(suggestionsList && suggestionsList.length > 0, 'Should have at least one suggestion');
      assert.ok(suggestionsList[0].key, 'Suggestion should have key');
    }
  });

  it('should NOT auto-trigger suggestions when policy has suggest_similar=0', async () => {
    const adapter = getAdapter();
    const knex = adapter.getKnex();
    const projectId = getProjectContext().getProjectId();

    // Delete existing policy from previous test
    await knex('t_decision_policies')
      .where('name', 'security_vulnerability')
      .where('project_id', projectId)
      .delete();

    // Get system agent
    let systemAgentId: number;
    const systemAgent = await knex('m_agents').where('name', 'system').select('id').first();
    if (systemAgent) {
      systemAgentId = systemAgent.id;
    } else {
      const [agentId] = await knex('m_agents').insert({
        name: 'system',
        last_active_ts: Math.floor(Date.now() / 1000)
      });
      systemAgentId = agentId;
    }

    // Create policy with suggest_similar=0 (auto-trigger disabled)
    await knex('t_decision_policies').insert({
      name: 'security_vulnerability',
      project_id: projectId,
      defaults: JSON.stringify({ layer: 'cross-cutting', tags: ['security', 'vulnerability'] }),
      suggest_similar: 0,  // Disabled
      validation_rules: null,
      quality_gates: null,
      created_by: systemAgentId,
      ts: Math.floor(Date.now() / 1000)
    });

    // Create decision that matches policy but should NOT trigger suggestions
    const result = await setDecision({
      key: 'CVE-2024-0004',
      value: 'Fixed memory leak in cache module',
      tags: ['security', 'vulnerability', 'cache'],
      layer: 'infrastructure',
      scopes: ['MODULE:cache']
    });

    // Verify policy validation was applied
    assert.ok(result.policy_validation, 'Should have policy_validation field');
    assert.strictEqual(
      result.policy_validation?.matched_policy,
      'security_vulnerability',
      'Should match security_vulnerability policy'
    );

    // Verify suggestions were NOT triggered
    assert.strictEqual(
      result.suggestions,
      undefined,
      'Should NOT have suggestions field when suggest_similar=0'
    );
  });

  it('should NOT auto-trigger suggestions when decision does not match any policy', async () => {
    // Create decision that does not match any policy pattern
    const result = await setDecision({
      key: 'test/autotrigger/no-policy-match',
      value: 'Some arbitrary decision',
      tags: ['test'],
      layer: 'business',
      scopes: ['GLOBAL']
    });

    // Verify no policy validation was applied
    assert.strictEqual(
      result.policy_validation,
      undefined,
      'Should NOT have policy_validation when no policy matches'
    );

    // Verify no suggestions were triggered
    assert.strictEqual(
      result.suggestions,
      undefined,
      'Should NOT have suggestions when no policy matches'
    );
  });

  it('should handle suggestion errors gracefully', async () => {
    const adapter = getAdapter();
    const knex = adapter.getKnex();
    const projectId = getProjectContext().getProjectId();

    // Delete existing policy from previous test
    await knex('t_decision_policies')
      .where('name', 'security_vulnerability')
      .where('project_id', projectId)
      .delete();

    // Get system agent
    let systemAgentId: number;
    const systemAgent = await knex('m_agents').where('name', 'system').select('id').first();
    if (systemAgent) {
      systemAgentId = systemAgent.id;
    } else {
      const [agentId] = await knex('m_agents').insert({
        name: 'system',
        last_active_ts: Math.floor(Date.now() / 1000)
      });
      systemAgentId = agentId;
    }

    // Create policy with auto-trigger enabled
    await knex('t_decision_policies').insert({
      name: 'security_vulnerability',
      project_id: projectId,
      defaults: JSON.stringify({ layer: 'cross-cutting', tags: ['security', 'vulnerability'] }),
      suggest_similar: 1,  // Enabled
      validation_rules: null,
      quality_gates: null,
      created_by: systemAgentId,
      ts: Math.floor(Date.now() / 1000)
    });

    // Create decision with empty tags that won't match existing decisions
    const result = await setDecision({
      key: 'CVE-2024-9999-unique',
      value: 'Patched critical vulnerability in authentication middleware',
      tags: [],  // Empty tags might cause low scores
      layer: 'presentation',  // Use different layer to avoid high similarity
      scopes: ['GLOBAL']
    });

    // Decision should still succeed even if suggestions fail
    assert.ok(result.success, 'Decision.set should succeed even if suggestions fail');
    assert.ok(result.key, 'Should have key');
    assert.ok(result.version, 'Should have version');

    // Policy validation should still work
    assert.ok(result.policy_validation, 'Should have policy_validation field');
  });
});
