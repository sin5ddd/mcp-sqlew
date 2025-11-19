/**
 * Decision Operations - Native RDBMS Integration Tests
 *
 * Tests decision table schema correctness across MySQL, MariaDB, and PostgreSQL:
 * - Foreign key constraint enforcement
 * - UNIQUE constraint validation
 * - CASCADE delete behavior
 * - View functionality (v_tagged_decisions)
 * - Tag index population (m_tag_index)
 * - Cross-database compatibility
 *
 * Architecture: Direct Knex operations, no MCP tool dependencies
 * Task #530: Refactored from MCP tool calls to database layer testing
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import type { Knex } from 'knex';
import {
  runTestsOnAllDatabases,
  assertDecisionExists,
  assertDecisionHasTags,
  assertTagIndexPopulated,
  cleanupTestData,
  getAgentId,
  getLayerId,
  getTagId,
  getScopeId,
} from './test-harness.js';

runTestsOnAllDatabases('Decision Operations', (getDb, dbType) => {
  let projectId: number;

  // Get project ID before running tests
  it('should get project ID', async () => {
    const db = getDb();
    const project = await db('m_projects').first();
    assert.ok(project, 'Project should exist');
    projectId = project.id;
  });

  // ============================================================================
  // Foreign Key Constraint Tests
  // ============================================================================

  describe('Foreign key constraints', () => {
    it('should enforce FK constraint on key_id', async () => {
      const db = getDb();

      // Try to insert decision with non-existent key_id
      const insertPromise = db('t_decisions').insert({
        key_id: 999999, // Non-existent
        project_id: projectId,
        value: 'test',
        version: '1.0.0',
        ts: Math.floor(Date.now() / 1000),
        agent_id: 1,
        layer_id: 1,
      });

      await assert.rejects(
        insertPromise,
        (err: any) => {
          return (
            err.message.includes('foreign key') ||
            err.message.includes('FOREIGN KEY') ||
            err.message.includes('Cannot add or update a child row')
          );
        },
        'Should reject FK constraint violation'
      );
    });

    it('should enforce FK constraint on agent_id', async () => {
      const db = getDb();

      // Setup: Create valid key
      await db('m_context_keys').insert({ key: 'fk-test-agent' });
      const keyRecord = await db('m_context_keys')
        .where({ key: 'fk-test-agent' })
        .first();

      // Try to insert with invalid agent_id
      const insertPromise = db('t_decisions').insert({
        key_id: keyRecord.id,
        project_id: projectId,
        value: 'test',
        version: '1.0.0',
        ts: Math.floor(Date.now() / 1000),
        agent_id: 999999, // Non-existent
        layer_id: 1,
      });

      await assert.rejects(insertPromise, /foreign key|FOREIGN KEY|Cannot add or update a child row/i);

      // Cleanup
      await db('m_context_keys').where({ id: keyRecord.id }).del();
    });

    it('should enforce FK constraint on layer_id', async () => {
      const db = getDb();

      // Setup: Create valid key
      await db('m_context_keys').insert({ key: 'fk-test-layer' });
      const keyRecord = await db('m_context_keys')
        .where({ key: 'fk-test-layer' })
        .first();

      const agentId = await getAgentId(db);

      // Try to insert with invalid layer_id
      const insertPromise = db('t_decisions').insert({
        key_id: keyRecord.id,
        project_id: projectId,
        value: 'test',
        version: '1.0.0',
        ts: Math.floor(Date.now() / 1000),
        agent_id: agentId,
        layer_id: 999999, // Non-existent
      });

      await assert.rejects(insertPromise, /foreign key|FOREIGN KEY|Cannot add or update a child row/i);

      // Cleanup
      await db('m_context_keys').where({ id: keyRecord.id }).del();
    });
  });

  // ============================================================================
  // UNIQUE Constraint Tests
  // ============================================================================

  describe('UNIQUE constraints', () => {
    it('should enforce PRIMARY KEY uniqueness on key_id', async () => {
      const db = getDb();

      // Setup: Create key and decision
      await db('m_context_keys').insert({ key: 'unique-test-pk' });
      const keyRecord = await db('m_context_keys')
        .where({ key: 'unique-test-pk' })
        .first();

      const agentId = await getAgentId(db);
      const layerId = await getLayerId(db, 'business');

      await db('t_decisions').insert({
        key_id: keyRecord.id,
        project_id: projectId,
        value: 'first value',
        version: '1.0.0',
        ts: Math.floor(Date.now() / 1000),
        agent_id: agentId,
        layer_id: layerId,
      });

      // Try to insert duplicate (same key_id + project_id)
      const duplicatePromise = db('t_decisions').insert({
        key_id: keyRecord.id,
        project_id: projectId,
        value: 'second value',
        version: '2.0.0',
        ts: Math.floor(Date.now() / 1000),
        agent_id: agentId,
        layer_id: layerId,
      });

      await assert.rejects(
        duplicatePromise,
        /UNIQUE constraint|Duplicate entry|duplicate key value/i
      );

      // Cleanup
      await cleanupTestData(db);
    });

    it('should enforce UNIQUE constraint on decision_key_id in t_decision_context', async () => {
      const db = getDb();

      // Setup: Create decision
      await db('m_context_keys').insert({ key: 'context-unique-test' });
      const keyRecord = await db('m_context_keys')
        .where({ key: 'context-unique-test' })
        .first();

      const agentId = await getAgentId(db);
      const layerId = await getLayerId(db, 'business');

      await db('t_decisions').insert({
        key_id: keyRecord.id,
        project_id: projectId,
        value: 'test value',
        version: '1.0.0',
        ts: Math.floor(Date.now() / 1000),
        agent_id: agentId,
        layer_id: layerId,
      });

      // Insert first context
      await db('t_decision_context').insert({
        decision_key_id: keyRecord.id,
        project_id: projectId,
        rationale: 'First rationale',
        ts: Math.floor(Date.now() / 1000),
      });

      // Try to insert duplicate context
      const duplicatePromise = db('t_decision_context').insert({
        decision_key_id: keyRecord.id,
        project_id: projectId,
        rationale: 'Duplicate rationale',
        ts: Math.floor(Date.now() / 1000),
      });

      await assert.rejects(
        duplicatePromise,
        /UNIQUE constraint|Duplicate entry|duplicate key value/i
      );

      // Cleanup
      await cleanupTestData(db);
    });
  });

  // ============================================================================
  // CASCADE Delete Tests
  // ============================================================================

  describe('CASCADE delete behavior', () => {
    it('should cascade delete decision when m_context_keys record deleted', async () => {
      const db = getDb();

      // Setup: Create key and decision
      await db('m_context_keys').insert({ key: 'cascade-test-key' });
      const keyRecord = await db('m_context_keys')
        .where({ key: 'cascade-test-key' })
        .first();

      const agentId = await getAgentId(db);
      const layerId = await getLayerId(db, 'business');

      await db('t_decisions').insert({
        key_id: keyRecord.id,
        project_id: projectId,
        value: 'test value',
        version: '1.0.0',
        ts: Math.floor(Date.now() / 1000),
        agent_id: agentId,
        layer_id: layerId,
      });

      // Verify decision exists
      let decision = await db('t_decisions').where({ key_id: keyRecord.id }).first();
      assert.ok(decision, 'Decision should exist before cascade');

      // Delete context key (should cascade to decision)
      await db('m_context_keys').where({ id: keyRecord.id }).del();

      // Verify decision was cascade deleted
      decision = await db('t_decisions').where({ key_id: keyRecord.id }).first();
      assert.strictEqual(decision, undefined, 'Decision should be cascade deleted');
    });

    it('should cascade delete decision_tags when decision deleted', async () => {
      const db = getDb();

      // Setup: Create decision with tags
      await db('m_context_keys').insert({ key: 'cascade-test-tags' });
      const keyRecord = await db('m_context_keys')
        .where({ key: 'cascade-test-tags' })
        .first();

      const agentId = await getAgentId(db);
      const layerId = await getLayerId(db, 'business');
      const tagId = await getTagId(db, 'test');

      await db('t_decisions').insert({
        key_id: keyRecord.id,
        project_id: projectId,
        value: 'test value',
        version: '1.0.0',
        ts: Math.floor(Date.now() / 1000),
        agent_id: agentId,
        layer_id: layerId,
      });

      await db('t_decision_tags').insert({
        decision_key_id: keyRecord.id,
        project_id: projectId,
        tag_id: tagId,
      });

      // Verify tags exist
      let tags = await db('t_decision_tags').where({ decision_key_id: keyRecord.id });
      assert.ok(tags.length > 0, 'Tags should exist before cascade');

      // Delete decision
      await db('t_decisions').where({ key_id: keyRecord.id }).del();

      // Verify tags were cascade deleted
      tags = await db('t_decision_tags').where({ decision_key_id: keyRecord.id });
      assert.strictEqual(tags.length, 0, 'Tags should be cascade deleted');

      // Cleanup
      await db('m_context_keys').where({ id: keyRecord.id }).del();
    });

    it('should cascade delete decision_context when decision deleted', async () => {
      const db = getDb();

      // Setup: Create decision with context
      await db('m_context_keys').insert({ key: 'cascade-test-context' });
      const keyRecord = await db('m_context_keys')
        .where({ key: 'cascade-test-context' })
        .first();

      const agentId = await getAgentId(db);
      const layerId = await getLayerId(db, 'business');

      await db('t_decisions').insert({
        key_id: keyRecord.id,
        project_id: projectId,
        value: 'test value',
        version: '1.0.0',
        ts: Math.floor(Date.now() / 1000),
        agent_id: agentId,
        layer_id: layerId,
      });

      await db('t_decision_context').insert({
        decision_key_id: keyRecord.id,
        project_id: projectId,
        rationale: 'Test rationale',
        ts: Math.floor(Date.now() / 1000),
      });

      // Verify context exists
      let context = await db('t_decision_context').where({ decision_key_id: keyRecord.id }).first();
      assert.ok(context, 'Context should exist before cascade');

      // Delete decision
      await db('t_decisions').where({ key_id: keyRecord.id }).del();

      // Verify context was cascade deleted
      context = await db('t_decision_context').where({ decision_key_id: keyRecord.id }).first();
      assert.strictEqual(context, undefined, 'Context should be cascade deleted');

      // Cleanup
      await db('m_context_keys').where({ id: keyRecord.id }).del();
    });
  });

  // ============================================================================
  // Decision CRUD Operations (Database Layer)
  // ============================================================================

  describe('Decision table operations', () => {
    it('should insert decision with all required fields', async () => {
      const db = getDb();

      // Setup: Insert master data
      await db('m_context_keys').insert({ key: 'crud-test-key' });
      const keyRecord = await db('m_context_keys')
        .where({ key: 'crud-test-key' })
        .first();

      const agentId = await getAgentId(db);
      const layerId = await getLayerId(db, 'infrastructure');

      // Insert decision
      await db('t_decisions').insert({
        key_id: keyRecord.id,
        project_id: projectId,
        value: 'fastify',
        version: '1.0.0',
        ts: Math.floor(Date.now() / 1000),
        agent_id: agentId,
        layer_id: layerId,
      });

      // Verify
      await assertDecisionExists(db, 'crud-test-key', 'fastify');

      // Cleanup
      await cleanupTestData(db);
    });

    it('should update existing decision value', async () => {
      const db = getDb();

      // Setup: Create initial decision
      await db('m_context_keys').insert({ key: 'update-test-key' });
      const keyRecord = await db('m_context_keys')
        .where({ key: 'update-test-key' })
        .first();

      const agentId = await getAgentId(db);
      const layerId = await getLayerId(db, 'data');

      await db('t_decisions').insert({
        key_id: keyRecord.id,
        project_id: projectId,
        value: 'postgresql',
        version: '1.0.0',
        ts: Math.floor(Date.now() / 1000),
        agent_id: agentId,
        layer_id: layerId,
      });

      // Update decision
      await db('t_decisions')
        .where({ key_id: keyRecord.id })
        .update({
          value: 'postgresql-v16',
          version: '1.1.0',
          ts: Math.floor(Date.now() / 1000),
        });

      // Verify
      await assertDecisionExists(db, 'update-test-key', 'postgresql-v16');

      // Cleanup
      await cleanupTestData(db);
    });

    it('should store numeric decisions in t_decisions_numeric', async () => {
      const db = getDb();

      // Setup: Create key
      await db('m_context_keys').insert({ key: 'numeric-test-key' });
      const keyRecord = await db('m_context_keys')
        .where({ key: 'numeric-test-key' })
        .first();

      const agentId = await getAgentId(db);
      const layerId = await getLayerId(db, 'infrastructure');

      // Insert numeric decision
      await db('t_decisions_numeric').insert({
        key_id: keyRecord.id,
        project_id: projectId,
        value: 100,
        version: '1.0.0',
        ts: Math.floor(Date.now() / 1000),
        agent_id: agentId,
        layer_id: layerId,
      });

      // Verify
      const numericDecision = await db('t_decisions_numeric')
        .where({ key_id: keyRecord.id })
        .first();

      assert.ok(numericDecision, 'Numeric decision should exist');
      assert.strictEqual(numericDecision.value, 100, 'Numeric value should match');

      // Cleanup
      await cleanupTestData(db);
    });
  });

  // ============================================================================
  // Decision Context Operations
  // ============================================================================

  describe('Decision context operations', () => {
    it('should insert decision context with rationale, alternatives, tradeoffs', async () => {
      const db = getDb();

      // Setup: Create decision
      await db('m_context_keys').insert({ key: 'context-test-key' });
      const keyRecord = await db('m_context_keys')
        .where({ key: 'context-test-key' })
        .first();

      const agentId = await getAgentId(db);
      const layerId = await getLayerId(db, 'business');

      await db('t_decisions').insert({
        key_id: keyRecord.id,
        project_id: projectId,
        value: 'oauth2',
        version: '1.0.0',
        ts: Math.floor(Date.now() / 1000),
        agent_id: agentId,
        layer_id: layerId,
      });

      // Insert context
      await db('t_decision_context').insert({
        decision_key_id: keyRecord.id,
        project_id: projectId,
        rationale: 'OAuth2 provides better security and user experience',
        alternatives_considered: 'JWT, Session-based auth, Basic auth',
        tradeoffs: 'More complex implementation than basic auth',
        ts: Math.floor(Date.now() / 1000),
      });

      // Verify
      const context = await db('t_decision_context')
        .where({ decision_key_id: keyRecord.id })
        .first();

      assert.ok(context, 'Context should exist');
      assert.strictEqual(context.rationale, 'OAuth2 provides better security and user experience');
      assert.strictEqual(context.alternatives_considered, 'JWT, Session-based auth, Basic auth');
      assert.strictEqual(context.tradeoffs, 'More complex implementation than basic auth');

      // Cleanup
      await cleanupTestData(db);
    });

    it('should update existing decision context', async () => {
      const db = getDb();

      // Setup: Create decision with context
      await db('m_context_keys').insert({ key: 'context-update-key' });
      const keyRecord = await db('m_context_keys')
        .where({ key: 'context-update-key' })
        .first();

      const agentId = await getAgentId(db);
      const layerId = await getLayerId(db, 'business');

      await db('t_decisions').insert({
        key_id: keyRecord.id,
        project_id: projectId,
        value: 'v1',
        version: '1.0.0',
        ts: Math.floor(Date.now() / 1000),
        agent_id: agentId,
        layer_id: layerId,
      });

      await db('t_decision_context').insert({
        decision_key_id: keyRecord.id,
        project_id: projectId,
        rationale: 'Original rationale',
        ts: Math.floor(Date.now() / 1000),
      });

      // Update context
      await db('t_decision_context')
        .where({ decision_key_id: keyRecord.id })
        .update({
          rationale: 'Updated rationale',
          alternatives_considered: 'New alternatives',
        });

      // Verify
      const context = await db('t_decision_context')
        .where({ decision_key_id: keyRecord.id })
        .first();

      assert.strictEqual(context.rationale, 'Updated rationale');
      assert.strictEqual(context.alternatives_considered, 'New alternatives');

      // Cleanup
      await cleanupTestData(db);
    });
  });

  // ============================================================================
  // Tag Operations
  // ============================================================================

  describe('Decision tagging', () => {
    it('should insert decision tags', async () => {
      const db = getDb();

      // Setup: Create decision
      await db('m_context_keys').insert({ key: 'tag-test-key' });
      const keyRecord = await db('m_context_keys')
        .where({ key: 'tag-test-key' })
        .first();

      const agentId = await getAgentId(db);
      const layerId = await getLayerId(db, 'business');

      await db('t_decisions').insert({
        key_id: keyRecord.id,
        project_id: projectId,
        value: 'test value',
        version: '1.0.0',
        ts: Math.floor(Date.now() / 1000),
        agent_id: agentId,
        layer_id: layerId,
      });

      // Insert tags
      const apiTagId = await getTagId(db, 'api');
      const perfTagId = await getTagId(db, 'performance');

      await db('t_decision_tags').insert([
        { decision_key_id: keyRecord.id, project_id: projectId, tag_id: apiTagId },
        { decision_key_id: keyRecord.id, project_id: projectId, tag_id: perfTagId },
      ]);

      // Verify
      await assertDecisionHasTags(db, 'tag-test-key', ['api', 'performance']);

      // Cleanup
      await cleanupTestData(db);
    });

    // Note: m_tag_index test removed - the table has a different schema
    // (tag_name, decision_count, constraint_count, task_count, total_count)
    // It's an aggregate count table populated by application logic, not individual mappings
  });

  // ============================================================================
  // Scope Operations
  // ============================================================================

  describe('Decision scoping', () => {
    it('should insert decision scopes', async () => {
      const db = getDb();

      // Setup: Create decision
      await db('m_context_keys').insert({ key: 'scope-test-key' });
      const keyRecord = await db('m_context_keys')
        .where({ key: 'scope-test-key' })
        .first();

      const agentId = await getAgentId(db);
      const layerId = await getLayerId(db, 'business');

      await db('t_decisions').insert({
        key_id: keyRecord.id,
        project_id: projectId,
        value: 'test value',
        version: '1.0.0',
        ts: Math.floor(Date.now() / 1000),
        agent_id: agentId,
        layer_id: layerId,
      });

      // Insert scopes
      const globalScopeId = await getScopeId(db, 'global');
      const moduleScopeId = await getScopeId(db, 'module');

      await db('t_decision_scopes').insert([
        { decision_key_id: keyRecord.id, project_id: projectId, scope_id: globalScopeId },
        { decision_key_id: keyRecord.id, project_id: projectId, scope_id: moduleScopeId },
      ]);

      // Verify
      const scopes = await db('t_decision_scopes')
        .join('m_scopes', 't_decision_scopes.scope_id', 'm_scopes.id')
        .where({ 't_decision_scopes.decision_key_id': keyRecord.id, 't_decision_scopes.project_id': projectId })
        .pluck('m_scopes.name');

      assert.strictEqual(scopes.length, 2, 'Should have 2 scopes');
      assert.ok(scopes.includes('global'), 'Should have global scope');
      assert.ok(scopes.includes('module'), 'Should have module scope');

      // Cleanup
      await cleanupTestData(db);
    });
  });

  // ============================================================================
  // Cross-Database Compatibility Tests
  // ============================================================================

  describe(`Cross-database compatibility - ${dbType}`, () => {
    it('should handle long VARCHAR keys', async () => {
      const db = getDb();
      const longKey = 'test/' + 'a'.repeat(100);

      await db('m_context_keys').insert({ key: longKey });
      const keyRecord = await db('m_context_keys')
        .where({ key: longKey })
        .first();

      const agentId = await getAgentId(db);
      const layerId = await getLayerId(db, 'business');

      await db('t_decisions').insert({
        key_id: keyRecord.id,
        project_id: projectId,
        value: 'test',
        version: '1.0.0',
        ts: Math.floor(Date.now() / 1000),
        agent_id: agentId,
        layer_id: layerId,
      });

      await assertDecisionExists(db, longKey, 'test');

      // Cleanup
      await cleanupTestData(db);
    });

    it('should handle special characters in values', async () => {
      const db = getDb();
      const specialValue = "Value with 'quotes', \"double quotes\", and \\backslashes";

      await db('m_context_keys').insert({ key: 'special-chars-key' });
      const keyRecord = await db('m_context_keys')
        .where({ key: 'special-chars-key' })
        .first();

      const agentId = await getAgentId(db);
      const layerId = await getLayerId(db, 'business');

      await db('t_decisions').insert({
        key_id: keyRecord.id,
        project_id: projectId,
        value: specialValue,
        version: '1.0.0',
        ts: Math.floor(Date.now() / 1000),
        agent_id: agentId,
        layer_id: layerId,
      });

      await assertDecisionExists(db, 'special-chars-key', specialValue);

      // Cleanup
      await cleanupTestData(db);
    });

    it('should handle unicode characters', async () => {
      const db = getDb();
      const unicodeValue = '日本語 中文 한국어 🚀 emoji';

      await db('m_context_keys').insert({ key: 'unicode-key' });
      const keyRecord = await db('m_context_keys')
        .where({ key: 'unicode-key' })
        .first();

      const agentId = await getAgentId(db);
      const layerId = await getLayerId(db, 'business');

      await db('t_decisions').insert({
        key_id: keyRecord.id,
        project_id: projectId,
        value: unicodeValue,
        version: '1.0.0',
        ts: Math.floor(Date.now() / 1000),
        agent_id: agentId,
        layer_id: layerId,
      });

      await assertDecisionExists(db, 'unicode-key', unicodeValue);

      // Cleanup
      await cleanupTestData(db);
    });
  });
});
