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

    // Clean up any existing test policy from previous runs
    const projectId = projectContext.getProjectId();
    await knex('t_decision_policies')
      .where('name', 'security_vulnerability')
      .where('project_id', projectId)
      .delete();
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

    // Create test policy with suggest_similar=1 (no validation rules to avoid blocking auto-trigger)
    await knex('t_decision_policies').insert({
      name: 'security_vulnerability',
      project_id: projectId,
      description: 'Test policy for auto-trigger',
      suggest_similar: 1,
      validation_rules: null,  // No validation rules - focus on auto-trigger
      quality_gates: null,     // No quality gates - focus on auto-trigger
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

    // Create another related decision
    await setDecision({
      key: 'CVE-2024-0002',
      value: 'Fixed SQL injection in user query',
      tags: ['security', 'vulnerability', 'database'],
      layer: 'data',
      scopes: ['MODULE:database']
    });

    // Create decision that should trigger suggestions
    const result = await setDecision({
      key: 'CVE-2024-0003',
      value: 'Fixed XSS vulnerability in web interface',
      tags: ['security', 'vulnerability', 'web'],
      layer: 'presentation',
      scopes: ['MODULE:web']
    });

    // Verify policy validation was applied
    assert.ok(result.policy_validation, 'Should have policy_validation field');
    assert.strictEqual(
      result.policy_validation?.matched_policy,
      'security_vulnerability',
      'Should match security_vulnerability policy'
    );

    // Verify suggestions were auto-triggered
    assert.ok(result.suggestions, 'Should have suggestions field');
    assert.strictEqual(
      result.suggestions?.triggered_by,
      'security_vulnerability',
      'Should be triggered by security_vulnerability policy'
    );
    assert.ok(
      result.suggestions!.suggestions.length > 0,
      'Should have at least one suggestion'
    );

    // Verify suggestion structure
    const firstSuggestion = result.suggestions!.suggestions[0];
    assert.ok(firstSuggestion.key, 'Suggestion should have key');
    assert.ok(firstSuggestion.value, 'Suggestion should have value');
    assert.ok(firstSuggestion.score >= 50, 'Suggestion score should be >= 50 (auto-trigger threshold)');
    assert.ok(firstSuggestion.reason, 'Suggestion should have reason');
  });

  it('should NOT auto-trigger suggestions when policy has suggest_similar=0', async () => {
    const adapter = getAdapter();
    const knex = adapter.getKnex();
    const projectId = getProjectContext().getProjectId();

    // Update policy to disable auto-trigger
    await knex('t_decision_policies')
      .where('name', 'security_vulnerability')
      .where('project_id', projectId)
      .update({ suggest_similar: 0 });

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

    // Re-enable auto-trigger
    await knex('t_decision_policies')
      .where('name', 'security_vulnerability')
      .where('project_id', projectId)
      .update({ suggest_similar: 1 });

    // Create decision with invalid data that might cause suggestion error
    const result = await setDecision({
      key: 'CVE-2024-9999',
      value: 'Test decision',
      tags: [],  // Empty tags might cause low scores
      layer: 'infrastructure',
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
