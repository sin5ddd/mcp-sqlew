/**
 * Integration tests for v3.9.0 Hybrid Similarity Detection
 * Tests two-tier duplicate detection (50-84 gentle nudge, 85+ hard block)
 */

import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert';
import { initializeDatabase, getAdapter, closeDatabase } from '../../database.js';
import { setDecision } from '../../tools/context/index.js';
import { SUGGEST_THRESHOLDS } from '../../constants.js';
import { ProjectContext } from '../../utils/project-context.js';

describe('Hybrid Similarity Detection (v3.9.0)', () => {
  let projectId: number;

  // Helper function to call setDecision (uses transaction for rollback on error)
  async function createDecision(params: any) {
    return setDecision(params);
  }

  before(async () => {
    // Initialize database with SQLite using test-specific database
    const adapter = await initializeDatabase({
      databaseType: 'sqlite',
      connection: { filename: '.tmp-test/hybrid-similarity-detection.db' }
    });

    // Set up project context (required after v3.7.0)
    const knex = adapter.getKnex();
    const projectContext = ProjectContext.getInstance();
    await projectContext.ensureProject(knex, 'test-hybrid-similarity', 'config', {
      projectRootPath: process.cwd(),
    });

    projectId = projectContext.getProjectId();

    // Clean up any existing test data from previous runs
    const testKeyIds = await knex('m_context_keys')
      .select('id')
      .where(function(this: any) {
        this.where('key', 'like', 'test-%')
          .orWhere('key', 'like', 'test-db-%')
          .orWhere('key', 'like', 'test-block-%')
          .orWhere('key', 'like', 'test-resolution-%');
      });

    const keyIds = testKeyIds.map((row: any) => row.id);

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

    // Clean up existing policies
    await knex('t_decision_policies')
      .where('project_id', projectId)
      .where(function(this: any) {
        this.where('name', 'like', '%test%')
          .orWhere('name', 'no-suggest-policy');
      })
      .delete();

    // Get or create system agent
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

    // Create test policy with suggest_similar=1 (no validation_rules to match all decisions)
    await knex('t_decision_policies').insert({
      project_id: projectId,
      name: 'test-policy',
      category: 'testing',
      defaults: JSON.stringify({}),  // Empty defaults (NOT NULL column)
      validation_rules: null,  // No validation rules - match all decisions for similarity detection
      quality_gates: null,
      suggest_similar: 1,
      created_by: systemAgentId,
      ts: Math.floor(Date.now() / 1000)
    });
  });

  after(async () => {
    await closeDatabase();
  });

  describe('Tier 1: Gentle Nudge (35-59)', () => {
    it('should return duplicate_risk warning for similar decisions (non-blocking)', async () => {
      // Create baseline decision
      await createDecision({
        key: 'test-2024-0001',
        value: 'Fixed buffer overflow in auth module',
        tags: ['security', 'vulnerability', 'auth'],
        layer: 'infrastructure',
        version: '1.0.0'
      });

      // Create similar decision (should trigger gentle nudge)
      // Different layer and partial tag overlap to score in 35-59 range
      const result = await createDecision({
        key: 'test-2024-0002',
        value: 'Fixed authentication bypass in API module',
        tags: ['security', 'vulnerability', 'api'],  // 2/3 tag match
        layer: 'business',  // Different layer (no layer match bonus)
        version: '1.0.0'
      });

      // Assert decision was created (non-blocking)
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.key, 'test-2024-0002');

      // Assert duplicate_risk warning exists
      assert.ok((result as any).duplicate_risk, 'duplicate_risk should be present');
      const risk = (result as any).duplicate_risk;

      assert.strictEqual(risk.severity, 'MODERATE');
      assert.ok(risk.max_score >= SUGGEST_THRESHOLDS.GENTLE_NUDGE, 'Score should be >= 35');
      assert.ok(risk.max_score < SUGGEST_THRESHOLDS.HARD_BLOCK, 'Score should be < 60');

      // Assert confidence scores
      assert.ok(risk.confidence.is_duplicate >= 0 && risk.confidence.is_duplicate <= 1);
      assert.ok(risk.confidence.should_update >= 0 && risk.confidence.should_update <= 1);

      // Assert suggestions structure
      assert.ok(Array.isArray(risk.suggestions), 'suggestions should be an array');
      assert.ok(risk.suggestions.length > 0 && risk.suggestions.length <= 3, 'Max 3 suggestions');

      const suggestion = risk.suggestions[0];
      assert.strictEqual(suggestion.key, 'test-2024-0001');
      assert.ok(suggestion.recommended, 'First suggestion should be recommended');
      assert.ok(suggestion.matches, 'Should have matches details');
      assert.ok(suggestion.version_info, 'Should have version info');
      assert.ok(suggestion.reasoning, 'Should have reasoning');
      assert.ok(suggestion.update_command, 'Should have update command');
    });

    it('should include enriched suggestion details', async () => {
      // Create baseline with distinct key prefix to avoid matching first test
      await createDecision({
        key: 'test-db-001',
        value: 'Optimized database query performance',
        tags: ['database', 'performance', 'optimization'],
        layer: 'data',
        version: '1.0.0'
      });

      // Create similar decision - partial tag overlap, different layer, similar value
      const result = await createDecision({
        key: 'test-db-002',
        value: 'Improved database query caching',  // More similar value
        tags: ['database', 'performance', 'caching'],  // 2/3 tag match
        layer: 'infrastructure',  // Different layer to reduce score
        version: '1.0.0'
      });

      const risk = (result as any).duplicate_risk;
      assert.ok(risk, 'Should have duplicate_risk');

      const suggestion = risk.suggestions[0];

      // Check matches details exist
      assert.ok(suggestion.matches, 'Should have matches object');
      assert.ok(Array.isArray(suggestion.matches.tags), 'Should have tags array');
      // Note: Tags may be empty due to how similarity engine populates metadata

      // Check version_info
      assert.ok(suggestion.version_info.current, 'Should have current version');
      assert.ok(suggestion.version_info.next_suggested, 'Should have next suggested version');
      assert.ok(Array.isArray(suggestion.version_info.recent_changes), 'Should have recent changes');

      // Check update_command
      assert.strictEqual(suggestion.update_command.key, 'test-db-001');
      assert.ok(suggestion.update_command.version, 'Should have version in command');
      assert.ok(Array.isArray(suggestion.update_command.tags), 'Should have tags in command');
    });
  });

  describe('Tier 2: Hard Block (60+)', () => {
    it('should throw error for very similar decisions (blocking)', async () => {
      // Create baseline decision with completely distinct content
      await createDecision({
        key: 'test-block-001',
        value: 'Configured load balancer for production',
        tags: ['infrastructure', 'deployment', 'loadbalancer'],
        layer: 'infrastructure',
        version: '1.0.0'
      });

      // Try to create near-identical decision (should throw)
      // Use identical value and tags to ensure score >= 60
      try {
        await createDecision({
          key: 'test-block-002',
          value: 'Configured load balancer for production',  // Identical value
          tags: ['infrastructure', 'deployment', 'loadbalancer'],  // Identical tags
          layer: 'infrastructure',  // Same layer
          version: '1.0.0'
        });
        assert.fail('Should have thrown HARD BLOCK error');
      } catch (error: any) {
        assert.ok(error.message.includes('DUPLICATE DETECTED'), 'Should contain DUPLICATE DETECTED');
        assert.ok(error.message.includes('test-block-001'), 'Should mention existing decision');
        assert.ok(error.message.includes('Update existing decision'), 'Should suggest update action');
      }

      // Verify decision was NOT created
      const adapter = getAdapter();
      const check = await adapter.getKnex()('t_decisions')
        .join('m_context_keys', 't_decisions.key_id', 'm_context_keys.id')
        .where('m_context_keys.key', 'test-block-002')
        .first();

      assert.strictEqual(check, undefined, 'Decision should not have been created');
    });

    it('should include actionable resolution in error message', async () => {
      // Create baseline with distinct key
      await createDecision({
        key: 'test-resolution-001',
        value: 'Added caching layer for user profiles',
        tags: ['caching', 'performance', 'users'],
        layer: 'data',
        version: '1.0.0'
      });

      // Try to create duplicate with identical value and tags
      try {
        await createDecision({
          key: 'test-resolution-002',
          value: 'Added caching layer for user profiles',  // Identical value
          tags: ['caching', 'performance', 'users'],  // Identical tags
          layer: 'data',  // Same layer
          version: '1.0.0'
        });
        assert.fail('Should have thrown error');
      } catch (error: any) {
        // Check error structure - verify key fields are present
        assert.ok(error.message.includes('DUPLICATE DETECTED'), 'Should indicate duplicate');
        assert.ok(error.message.includes('test-resolution-001'), 'Should mention existing decision');
        assert.ok(error.message.includes('Update existing decision'), 'Should suggest update');
        assert.ok(error.message.includes('ignore_suggest'), 'Should mention bypass option');
      }
    });
  });

  describe('Bypass Mechanism', () => {
    it('should skip detection when ignore_suggest=true', async () => {
      // Create baseline
      await createDecision({
        key: 'test-queue-rabbitmq',
        value: 'Use RabbitMQ for message queue',
        tags: ['queue', 'rabbitmq', 'messaging'],
        layer: 'infrastructure',
        version: '1.0.0'
      });

      // Create similar decision with ignore_suggest=true
      const result = await createDecision({
        key: 'test-queue-implementation',
        value: 'Use RabbitMQ for messaging',
        tags: ['queue', 'rabbitmq', 'messaging'],
        layer: 'infrastructure',
        version: '1.0.0',
        ignore_suggest: true,
        ignore_reason: 'Different use case - async tasks vs event bus'
      } as any);

      // Should succeed without warning or error
      assert.strictEqual(result.success, true);
      assert.strictEqual((result as any).duplicate_risk, undefined, 'Should not have duplicate_risk');
    });

    it('should bypass both gentle nudge and hard block tiers', async () => {
      // Create baseline
      await createDecision({
        key: 'test-search-elasticsearch',
        value: 'Use Elasticsearch for full-text search',
        tags: ['search', 'elasticsearch'],
        layer: 'infrastructure',
        version: '1.0.0'
      });

      // Try to create near-identical decision with bypass
      const result = await createDecision({
        key: 'test-search-engine',
        value: 'Use Elasticsearch for search',
        tags: ['search', 'elasticsearch'],
        layer: 'infrastructure',
        version: '1.0.0',
        ignore_suggest: true,
        ignore_reason: 'Testing bypass functionality'
      } as any);

      // Should succeed
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.key, 'test-search-engine');
    });
  });

  describe('Operation Scope', () => {
    it('should only apply to CREATE operations', async () => {
      // Create baseline
      const created = await createDecision({
        key: 'test-update-scope',
        value: 'Initial value',
        tags: ['test'],
        layer: 'business',
        version: '1.0.0'
      });

      // Update the decision (should not trigger detection)
      const updated = await createDecision({
        key: 'test-update-scope',
        value: 'Updated value',
        tags: ['test'],
        layer: 'business',
        version: '1.1.0'
      });

      // Should succeed without duplicate_risk
      assert.strictEqual(updated.success, true);
      assert.strictEqual((updated as any).duplicate_risk, undefined, 'Updates should not trigger detection');
    });
  });

  describe('Policy Respect', () => {
    it('should only trigger when suggest_similar=1', async () => {
      // Create policy with suggest_similar=0
      const adapter = getAdapter();
      const knex = adapter.getKnex();

      // Get system agent
      const systemAgent = await knex('m_agents').where('name', 'system').select('id').first();
      const systemAgentId = systemAgent!.id;

      await knex('t_decision_policies').insert({
        project_id: projectId,
        name: 'no-suggest-policy',
        category: 'testing',
        defaults: JSON.stringify({}),  // Empty defaults (NOT NULL column)
        validation_rules: JSON.stringify({
          patterns: {
            key: '^nosuggest-'
          }
        }),
        quality_gates: null,
        suggest_similar: 0,
        created_by: systemAgentId,
        ts: Math.floor(Date.now() / 1000)
      });

      // Create baseline
      await createDecision({
        key: 'nosuggest-baseline',
        value: 'Baseline decision',
        tags: ['test'],
        layer: 'business',
        version: '1.0.0'
      });

      // Create similar decision (should NOT trigger detection)
      const result = await createDecision({
        key: 'nosuggest-similar',
        value: 'Similar decision',
        tags: ['test'],
        layer: 'business',
        version: '1.0.0'
      });

      // Should succeed without warning
      assert.strictEqual(result.success, true);
      assert.strictEqual((result as any).duplicate_risk, undefined, 'Should not detect when suggest_similar=0');
    });
  });

  describe('Edge Cases', () => {
    it('should handle decisions with no matching suggestions', async () => {
      // Create unique decision with no matches
      const result = await createDecision({
        key: 'test-unique-decision',
        value: 'Completely unique decision with no matches',
        tags: ['unique', 'special', 'isolated'],
        layer: 'business',
        version: '1.0.0'
      });

      // Should succeed without warning
      assert.strictEqual(result.success, true);
      assert.strictEqual((result as any).duplicate_risk, undefined, 'No warning for unique decisions');
    });

    it('should handle decisions without tags', async () => {
      // Create baseline without tags
      await createDecision({
        key: 'test-no-tags-baseline',
        value: 'Decision without tags',
        layer: 'business',
        version: '1.0.0'
      });

      // Create similar decision without tags
      const result = await createDecision({
        key: 'test-no-tags-similar',
        value: 'Another decision without tags',
        layer: 'business',
        version: '1.0.0'
      });

      // Should still work (detection may not trigger due to low score)
      assert.strictEqual(result.success, true);
    });

    it('should handle empty suggestion list gracefully', async () => {
      // Create decision in a new layer with no existing decisions
      const result = await createDecision({
        key: 'test-isolated-layer',
        value: 'First decision in presentation layer',
        layer: 'presentation',
        version: '1.0.0'
      });

      // Should succeed without issues
      assert.strictEqual(result.success, true);
    });
  });
});
