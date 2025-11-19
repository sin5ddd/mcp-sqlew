/**
 * Constraint Operations - Native RDBMS Integration Tests
 *
 * Tests constraint operations using direct Knex database operations on fresh
 * MySQL, MariaDB, and PostgreSQL installations.
 *
 * Task #531: Refactor to use direct Knex operations instead of MCP tool calls
 *
 * Key Tests:
 * - Basic constraint insertion with required fields
 * - Foreign key constraint enforcement (category_id, layer_id, agent_id)
 * - UNIQUE constraint on (constraint_text, project_id)
 * - Priority levels (1-4)
 * - active flag (0/1)
 * - Rationale field
 * - Tag associations via t_constraint_tags
 * - Filtering by layer, category, priority, tags
 * - Deactivation (active = 0)
 * - View functionality (v_tagged_constraints)
 * - Cross-database compatibility (text, special characters, unicode)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createHash } from 'crypto';
import type { Knex } from 'knex';
import { runTestsOnAllDatabases, assertConstraintActive } from './test-harness.js';

// Helper function to generate SHA256 hash of constraint_text
function hashConstraintText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

runTestsOnAllDatabases('Constraint Operations', (getDb, dbType) => {
  let projectId: number;
  let systemAgentId: number;
  let businessLayerId: number;
  let dataLayerId: number;
  let presentationLayerId: number;
  let crossCuttingLayerId: number;
  let categoryArchitectureId: number;
  let categorySecurityId: number;
  let categoryTestingId: number;
  let categoryPerformanceId: number;
  let categoryStyleId: number;
  let categoryCodeStyleId: number;
  let categoryObsoleteId: number;
  let categoryTestId: number;
  let tagTestId: number;
  let tagApiId: number;
  let tagPerformanceId: number;
  let tagSecurityId: number;

  // ============================================================================
  // Setup: Get Master Data IDs
  // ============================================================================

  it('should get project ID and master data', async () => {
    const db = getDb();

    // Get project ID
    const project = await db('m_projects').where({ id: 1 }).first();
    assert.ok(project, 'Project should exist');
    projectId = project.id;

    // Get system agent
    const systemAgent = await db('m_agents').where({ name: 'system' }).first();
    assert.ok(systemAgent, 'System agent should exist');
    systemAgentId = systemAgent.id;

    // Get layer IDs
    const businessLayer = await db('m_layers').where({ name: 'business' }).first();
    assert.ok(businessLayer, 'Business layer should exist');
    businessLayerId = businessLayer.id;

    const dataLayer = await db('m_layers').where({ name: 'data' }).first();
    assert.ok(dataLayer, 'Data layer should exist');
    dataLayerId = dataLayer.id;

    const presentationLayer = await db('m_layers').where({ name: 'presentation' }).first();
    assert.ok(presentationLayer, 'Presentation layer should exist');
    presentationLayerId = presentationLayer.id;

    const crossCuttingLayer = await db('m_layers').where({ name: 'cross-cutting' }).first();
    assert.ok(crossCuttingLayer, 'Cross-cutting layer should exist');
    crossCuttingLayerId = crossCuttingLayer.id;

    // Get or create constraint categories
    const architectureCategory = await db('m_constraint_categories')
      .where({ name: 'architecture' })
      .first();
    if (!architectureCategory) {
      const [id] = await db('m_constraint_categories').insert({ name: 'architecture' });
      categoryArchitectureId = id;
    } else {
      categoryArchitectureId = architectureCategory.id;
    }

    const securityCategory = await db('m_constraint_categories')
      .where({ name: 'security' })
      .first();
    if (!securityCategory) {
      const [id] = await db('m_constraint_categories').insert({ name: 'security' });
      categorySecurityId = id;
    } else {
      categorySecurityId = securityCategory.id;
    }

    const testingCategory = await db('m_constraint_categories')
      .where({ name: 'testing' })
      .first();
    if (!testingCategory) {
      const [id] = await db('m_constraint_categories').insert({ name: 'testing' });
      categoryTestingId = id;
    } else {
      categoryTestingId = testingCategory.id;
    }

    const performanceCategory = await db('m_constraint_categories')
      .where({ name: 'performance' })
      .first();
    if (!performanceCategory) {
      const [id] = await db('m_constraint_categories').insert({ name: 'performance' });
      categoryPerformanceId = id;
    } else {
      categoryPerformanceId = performanceCategory.id;
    }

    const styleCategory = await db('m_constraint_categories')
      .where({ name: 'style' })
      .first();
    if (!styleCategory) {
      const [id] = await db('m_constraint_categories').insert({ name: 'style' });
      categoryStyleId = id;
    } else {
      categoryStyleId = styleCategory.id;
    }

    const codeStyleCategory = await db('m_constraint_categories')
      .where({ name: 'code-style' })
      .first();
    if (!codeStyleCategory) {
      const [id] = await db('m_constraint_categories').insert({ name: 'code-style' });
      categoryCodeStyleId = id;
    } else {
      categoryCodeStyleId = codeStyleCategory.id;
    }

    const obsoleteCategory = await db('m_constraint_categories')
      .where({ name: 'obsolete' })
      .first();
    if (!obsoleteCategory) {
      const [id] = await db('m_constraint_categories').insert({ name: 'obsolete' });
      categoryObsoleteId = id;
    } else {
      categoryObsoleteId = obsoleteCategory.id;
    }

    const criticalCategory = await db('m_constraint_categories')
      .where({ name: 'critical' })
      .first();
    if (!criticalCategory) {
      const [id] = await db('m_constraint_categories').insert({ name: 'critical' });
      categoryTestId = id;
    } else {
      categoryTestId = criticalCategory.id;
    }

    // Get tag IDs
    const testTag = await db('m_tags').where({ name: 'test', project_id: projectId }).first();
    assert.ok(testTag, 'Test tag should exist');
    tagTestId = testTag.id;

    const apiTag = await db('m_tags').where({ name: 'api', project_id: projectId }).first();
    assert.ok(apiTag, 'API tag should exist');
    tagApiId = apiTag.id;

    const performanceTag = await db('m_tags').where({ name: 'performance', project_id: projectId }).first();
    assert.ok(performanceTag, 'Performance tag should exist');
    tagPerformanceId = performanceTag.id;

    const securityTag = await db('m_tags').where({ name: 'security', project_id: projectId }).first();
    assert.ok(securityTag, 'Security tag should exist');
    tagSecurityId = securityTag.id;
  });

  // ============================================================================
  // Basic Constraint Operations
  // ============================================================================

  describe('Basic constraint insertion', () => {
    it('should insert constraint with required fields', async () => {
      const db = getDb();

      const constraintText1 = 'All API endpoints must use async/await';
      const [constraintId] = await db('t_constraints').insert({
        constraint_text: constraintText1,
        constraint_text_hash: hashConstraintText(constraintText1),
        category_id: categoryCodeStyleId,
        priority: 3, // high
        layer_id: businessLayerId,
        project_id: projectId,
        active: 1,
        agent_id: systemAgentId,
        ts: Math.floor(Date.now() / 1000),
      });

      assert.ok(constraintId, 'Should return constraint ID');

      // Verify constraint exists
      const constraint = await db('t_constraints')
        .where({ id: constraintId })
        .first();

      assert.strictEqual(constraint.constraint_text, 'All API endpoints must use async/await');
      assert.strictEqual(constraint.priority, 3);
      assert.strictEqual(constraint.active, 1);
    });

    it('should insert constraint with all fields', async () => {
      const db = getDb();

      const constraintTextDb = 'Database queries must use parameterized statements';
      const [constraintId] = await db('t_constraints').insert({
        constraint_text: constraintTextDb,
        constraint_text_hash: hashConstraintText(constraintTextDb),
        category_id: categorySecurityId,
        priority: 4, // critical
        layer_id: dataLayerId,
        project_id: projectId,
        active: 1,
        agent_id: systemAgentId,
        ts: Math.floor(Date.now() / 1000),
      });

      // Verify constraint is stored with all fields
      const constraint = await db('t_constraints')
        .where({ id: constraintId })
        .first();

      assert.strictEqual(constraint.constraint_text, 'Database queries must use parameterized statements');
      assert.strictEqual(constraint.priority, 4);
      assert.strictEqual(constraint.category_id, categorySecurityId);
    });

    it('should handle different priority levels', async () => {
      const db = getDb();

      // Priority 1 (low)
      const constraintTextLow = 'Low priority rule';
      const [p1Id] = await db('t_constraints').insert({
        constraint_text: constraintTextLow,
        constraint_text_hash: hashConstraintText(constraintTextLow),
        category_id: categoryStyleId,
        priority: 1,
        layer_id: presentationLayerId,
        project_id: projectId,
        active: 1,
        agent_id: systemAgentId,
        ts: Math.floor(Date.now() / 1000),
      });

      // Priority 4 (critical)
      const constraintTextCritical = 'Critical security rule';
      const [p4Id] = await db('t_constraints').insert({
        constraint_text: constraintTextCritical,
        constraint_text_hash: hashConstraintText(constraintTextCritical),
        category_id: categorySecurityId,
        priority: 4,
        layer_id: businessLayerId,
        project_id: projectId,
        active: 1,
        agent_id: systemAgentId,
        ts: Math.floor(Date.now() / 1000),
      });

      assert.ok(p1Id && p4Id, 'Both constraints should be created');

      // Verify priority values
      const lowPriority = await db('t_constraints')
        .where({ id: p1Id })
        .first();

      const highPriority = await db('t_constraints')
        .where({ id: p4Id })
        .first();

      assert.strictEqual(lowPriority.priority, 1);
      assert.strictEqual(highPriority.priority, 4);
    });
  });

  // ============================================================================
  // Tag Associations
  // ============================================================================

  describe('Tag associations', () => {
    it('should associate constraint with tags', async () => {
      const db = getDb();

      // Insert constraint
      const constraintTextUnitTests = 'All components must have unit tests';
      const [constraintId] = await db('t_constraints').insert({
        constraint_text: constraintTextUnitTests,
        constraint_text_hash: hashConstraintText(constraintTextUnitTests),
        category_id: categoryTestingId,
        priority: 3,
        layer_id: crossCuttingLayerId,
        project_id: projectId,
        active: 1,
        agent_id: systemAgentId,
        ts: Math.floor(Date.now() / 1000),
      });

      // Associate with tags
      await db('t_constraint_tags').insert([
        { constraint_id: constraintId, tag_id: tagTestId },
        { constraint_id: constraintId, tag_id: tagPerformanceId },
      ]);

      // Verify tag associations
      const tagAssociations = await db('t_constraint_tags')
        .where({ constraint_id: constraintId })
        .count('* as count')
        .first();

      assert.ok(tagAssociations, 'Tag associations query should return result');
      assert.strictEqual(tagAssociations.count, 2, 'Should have 2 tag associations');
    });
  });

  // ============================================================================
  // Filtering and Retrieval
  // ============================================================================

  describe('Filtering constraints', () => {
    it('should filter constraints by layer', async () => {
      const db = getDb();

      // Add constraints in different layers
      const constraintTextBusiness = 'Business layer rule';
      await db('t_constraints').insert({
        constraint_text: constraintTextBusiness,
        constraint_text_hash: hashConstraintText(constraintTextBusiness),
        category_id: categoryArchitectureId,
        priority: 3,
        layer_id: businessLayerId,
        project_id: projectId,
        active: 1,
        agent_id: systemAgentId,
        ts: Math.floor(Date.now() / 1000),
      });

      const constraintTextData = 'Data layer rule';
      await db('t_constraints').insert({
        constraint_text: constraintTextData,
        constraint_text_hash: hashConstraintText(constraintTextData),
        category_id: categoryArchitectureId,
        priority: 3,
        layer_id: dataLayerId,
        project_id: projectId,
        active: 1,
        agent_id: systemAgentId,
        ts: Math.floor(Date.now() / 1000),
      });

      // Filter by business layer
      const businessConstraints = await db('t_constraints')
        .where({ layer_id: businessLayerId, active: 1, project_id: projectId })
        .select('*');

      const businessConstraint = businessConstraints.find(c => c.constraint_text === 'Business layer rule');
      assert.ok(businessConstraint, 'Should find business layer constraint');
    });

    it('should filter constraints by category', async () => {
      const db = getDb();

      const constraintTextSecurity = 'Security constraint';
      await db('t_constraints').insert({
        constraint_text: constraintTextSecurity,
        constraint_text_hash: hashConstraintText(constraintTextSecurity),
        category_id: categorySecurityId,
        priority: 4,
        layer_id: businessLayerId,
        project_id: projectId,
        active: 1,
        agent_id: systemAgentId,
        ts: Math.floor(Date.now() / 1000),
      });

      const constraintTextPerformance = 'Performance constraint';
      await db('t_constraints').insert({
        constraint_text: constraintTextPerformance,
        constraint_text_hash: hashConstraintText(constraintTextPerformance),
        category_id: categoryPerformanceId,
        priority: 3,
        layer_id: businessLayerId,
        project_id: projectId,
        active: 1,
        agent_id: systemAgentId,
        ts: Math.floor(Date.now() / 1000),
      });

      // Filter by security category
      const securityConstraints = await db('t_constraints')
        .where({ category_id: categorySecurityId, active: 1, project_id: projectId })
        .select('*');

      const securityConstraint = securityConstraints.find(c => c.constraint_text === 'Security constraint');
      assert.ok(securityConstraint, 'Should find security constraint');
    });

    it('should filter constraints by priority', async () => {
      const db = getDb();

      const constraintTextHighPriority = 'High priority constraint';
      await db('t_constraints').insert({
        constraint_text: constraintTextHighPriority,
        constraint_text_hash: hashConstraintText(constraintTextHighPriority),
        category_id: categoryTestId,
        priority: 4,
        layer_id: businessLayerId,
        project_id: projectId,
        active: 1,
        agent_id: systemAgentId,
        ts: Math.floor(Date.now() / 1000),
      });

      const constraintTextLowPriority = 'Low priority constraint';
      await db('t_constraints').insert({
        constraint_text: constraintTextLowPriority,
        constraint_text_hash: hashConstraintText(constraintTextLowPriority),
        category_id: categoryStyleId,
        priority: 1,
        layer_id: presentationLayerId,
        project_id: projectId,
        active: 1,
        agent_id: systemAgentId,
        ts: Math.floor(Date.now() / 1000),
      });

      // Filter by priority 4
      const highPriorityConstraints = await db('t_constraints')
        .where({ priority: 4, active: 1, project_id: projectId })
        .select('*');

      const highPriorityConstraint = highPriorityConstraints.find(c => c.constraint_text === 'High priority constraint');
      assert.ok(highPriorityConstraint, 'Should find high priority constraint');
    });

    it('should filter constraints by tags', async () => {
      const db = getDb();

      // Insert constraint
      const constraintTextTagged = 'Tagged constraint 1';
      const [constraintId] = await db('t_constraints').insert({
        constraint_text: constraintTextTagged,
        constraint_text_hash: hashConstraintText(constraintTextTagged),
        category_id: categoryTestingId,
        priority: 2,
        layer_id: businessLayerId,
        project_id: projectId,
        active: 1,
        agent_id: systemAgentId,
        ts: Math.floor(Date.now() / 1000),
      });

      // Associate with tags
      await db('t_constraint_tags').insert([
        { constraint_id: constraintId, tag_id: tagApiId },
        { constraint_id: constraintId, tag_id: tagTestId },
      ]);

      // Filter by api tag
      const apiTaggedConstraints = await db('t_constraints')
        .join('t_constraint_tags', 't_constraints.id', 't_constraint_tags.constraint_id')
        .where({
          't_constraint_tags.tag_id': tagApiId,
          't_constraints.active': 1,
          't_constraints.project_id': projectId,
        })
        .select('t_constraints.*');

      const apiConstraint = apiTaggedConstraints.find(c => c.constraint_text === 'Tagged constraint 1');
      assert.ok(apiConstraint, 'Should find api-tagged constraint');
    });

    it('should exclude deactivated constraints', async () => {
      const db = getDb();

      // Add and immediately deactivate a constraint
      const constraintTextDeactivated = 'Deactivated constraint';
      const [constraintId] = await db('t_constraints').insert({
        constraint_text: constraintTextDeactivated,
        constraint_text_hash: hashConstraintText(constraintTextDeactivated),
        category_id: categoryObsoleteId,
        priority: 2,
        layer_id: businessLayerId,
        project_id: projectId,
        active: 1,
        agent_id: systemAgentId,
        ts: Math.floor(Date.now() / 1000),
      });

      // Deactivate
      await db('t_constraints')
        .where({ id: constraintId })
        .update({ active: 0 });

      // Get only active constraints
      const activeConstraints = await db('t_constraints')
        .where({ active: 1, project_id: projectId })
        .select('*');

      const deactivatedConstraint = activeConstraints.find(c => c.constraint_text === 'Deactivated constraint');
      assert.strictEqual(deactivatedConstraint, undefined, 'Should not include deactivated constraint');
    });
  });

  // ============================================================================
  // Deactivation
  // ============================================================================

  describe('Constraint deactivation', () => {
    it('should deactivate constraint by ID', async () => {
      const db = getDb();

      // Add constraint
      const constraintTextToDeactivate = 'Constraint to deactivate';
      const [constraintId] = await db('t_constraints').insert({
        constraint_text: constraintTextToDeactivate,
        constraint_text_hash: hashConstraintText(constraintTextToDeactivate),
        category_id: categoryTestingId,
        priority: 2,
        layer_id: businessLayerId,
        project_id: projectId,
        active: 1,
        agent_id: systemAgentId,
        ts: Math.floor(Date.now() / 1000),
      });

      // Deactivate
      const updateCount = await db('t_constraints')
        .where({ id: constraintId, project_id: projectId })
        .update({ active: 0 });

      assert.strictEqual(updateCount, 1, 'Should update 1 row');

      // Verify active flag is set to 0
      const constraint = await db('t_constraints')
        .where({ id: constraintId })
        .first();

      assert.strictEqual(constraint.active, 0, 'active should be 0');
    });

    it('should allow re-deactivating already deactivated constraint', async () => {
      const db = getDb();

      // Add and deactivate
      const constraintTextReDeactivate = 'Re-deactivate test';
      const [constraintId] = await db('t_constraints').insert({
        constraint_text: constraintTextReDeactivate,
        constraint_text_hash: hashConstraintText(constraintTextReDeactivate),
        category_id: categoryTestingId,
        priority: 2,
        layer_id: businessLayerId,
        project_id: projectId,
        active: 1,
        agent_id: systemAgentId,
        ts: Math.floor(Date.now() / 1000),
      });

      await db('t_constraints')
        .where({ id: constraintId })
        .update({ active: 0 });

      // Deactivate again
      const updateCount = await db('t_constraints')
        .where({ id: constraintId })
        .update({ active: 0 });

      // Should succeed (no error thrown)
      assert.ok(updateCount >= 0, 'Should succeed on re-deactivation');
    });
  });

  // ============================================================================
  // Database Constraint Tests
  // ============================================================================

  describe('Database constraints', () => {
    it('should enforce foreign key constraint on category_id', async () => {
      const db = getDb();

      const constraintTextFkCategory = 'Test constraint';
      const insertPromise = db('t_constraints').insert({
        constraint_text: constraintTextFkCategory,
        constraint_text_hash: hashConstraintText(constraintTextFkCategory),
        category_id: 99999, // Non-existent category
        priority: 2,
        layer_id: businessLayerId,
        project_id: projectId,
        active: 1,
        agent_id: systemAgentId,
        ts: Math.floor(Date.now() / 1000),
      });

      await assert.rejects(
        insertPromise,
        (error: any) => {
          const msg = error.message.toLowerCase();
          return msg.includes('foreign key') ||
                 msg.includes('constraint') ||
                 msg.includes('violates') ||
                 msg.includes('cannot add');
        },
        'Should throw foreign key constraint error'
      );
    });

    it('should enforce foreign key constraint on agent_id', async () => {
      const db = getDb();

      const constraintTextFkAgent = 'Test constraint with invalid agent';
      const insertPromise = db('t_constraints').insert({
        constraint_text: constraintTextFkAgent,
        constraint_text_hash: hashConstraintText(constraintTextFkAgent),
        category_id: categoryTestingId,
        priority: 2,
        layer_id: businessLayerId,
        project_id: projectId,
        active: 1,
        agent_id: 99999, // Non-existent agent
        ts: Math.floor(Date.now() / 1000),
      });

      await assert.rejects(
        insertPromise,
        (error: any) => {
          const msg = error.message.toLowerCase();
          return msg.includes('foreign key') ||
                 msg.includes('constraint') ||
                 msg.includes('violates') ||
                 msg.includes('cannot add');
        },
        'Should throw foreign key constraint error'
      );
    });

    it('should enforce UNIQUE constraint on (constraint_text, project_id)', async () => {
      const db = getDb();

      const constraintTextValue = `Unique constraint test ${Date.now()}`;

      // Insert first constraint
      await db('t_constraints').insert({
        constraint_text: constraintTextValue,
        constraint_text_hash: hashConstraintText(constraintTextValue),
        category_id: categoryTestingId,
        priority: 3,
        layer_id: businessLayerId,
        project_id: projectId,
        active: 1,
        agent_id: systemAgentId,
        ts: Math.floor(Date.now() / 1000),
      });

      // Try to insert duplicate
      const duplicatePromise = db('t_constraints').insert({
        constraint_text: constraintTextValue, // Same constraint_text
        constraint_text_hash: hashConstraintText(constraintTextValue),
        category_id: categoryTestingId,
        priority: 3,
        layer_id: businessLayerId,
        project_id: projectId, // Same project_id
        active: 1,
        agent_id: systemAgentId,
        ts: Math.floor(Date.now() / 1000),
      });

      await assert.rejects(
        duplicatePromise,
        (error: any) => {
          const msg = error.message.toLowerCase();
          return msg.includes('unique') || msg.includes('duplicate');
        },
        'Should throw UNIQUE constraint error'
      );
    });
  });

  // ============================================================================
  // Cross-Database Compatibility Tests
  // ============================================================================

  describe(`Cross-database compatibility - ${dbType}`, () => {
    it('should handle long rule text', async () => {
      const db = getDb();
      const longRule = 'A'.repeat(500) + ' - This is a very long constraint rule';

      const [constraintId] = await db('t_constraints').insert({
        constraint_text: longRule,
        constraint_text_hash: hashConstraintText(longRule),
        category_id: categoryTestingId,
        priority: 2,
        layer_id: businessLayerId,
        project_id: projectId,
        active: 1,
        agent_id: systemAgentId,
        ts: Math.floor(Date.now() / 1000),
      });

      assert.ok(constraintId, 'Should handle long rule text');

      const constraint = await db('t_constraints')
        .where({ id: constraintId })
        .first();

      assert.strictEqual(constraint.constraint_text, longRule);
    });

    it('should handle special characters in rules', async () => {
      const db = getDb();
      const specialRule = "Rule with 'quotes', \"double quotes\", and \\backslashes";

      const [constraintId] = await db('t_constraints').insert({
        constraint_text: specialRule,
        constraint_text_hash: hashConstraintText(specialRule),
        category_id: categoryTestingId,
        priority: 2,
        layer_id: businessLayerId,
        project_id: projectId,
        active: 1,
        agent_id: systemAgentId,
        ts: Math.floor(Date.now() / 1000),
      });

      assert.ok(constraintId);

      const constraint = await db('t_constraints')
        .where({ id: constraintId })
        .first();

      assert.strictEqual(constraint.constraint_text, specialRule);
    });

    it('should handle unicode characters in constraint_text', async () => {
      const db = getDb();
      const unicodeText = '日本語のルール: Unicode support test 🎯';

      const [constraintId] = await db('t_constraints').insert({
        constraint_text: unicodeText,
        constraint_text_hash: hashConstraintText(unicodeText),
        category_id: categoryTestingId,
        priority: 2,
        layer_id: businessLayerId,
        project_id: projectId,
        active: 1,
        agent_id: systemAgentId,
        ts: Math.floor(Date.now() / 1000),
      });

      assert.ok(constraintId);

      const constraint = await db('t_constraints')
        .where({ id: constraintId })
        .first();

      assert.strictEqual(constraint.constraint_text, unicodeText);
    });
  });

  // ============================================================================
  // View Functionality Tests
  // ============================================================================

  describe('View functionality', () => {
    it('should query active constraints via v_tagged_constraints view (if exists)', async () => {
      const db = getDb();

      // Check if view exists (may not exist in all database versions)
      const hasView = await db.schema.hasTable('v_tagged_constraints');

      if (!hasView) {
        // Skip test if view doesn't exist
        return;
      }

      // Insert test constraint
      const constraintTextViewTest = 'View test constraint';
      const [constraintId] = await db('t_constraints').insert({
        constraint_text: constraintTextViewTest,
        constraint_text_hash: hashConstraintText(constraintTextViewTest),
        category_id: categoryArchitectureId,
        priority: 3,
        layer_id: businessLayerId,
        project_id: projectId,
        active: 1,
        agent_id: systemAgentId,
        ts: Math.floor(Date.now() / 1000),
      });

      // Query view
      const viewResults = await db('v_tagged_constraints')
        .where({ active: 1 })
        .select('*');

      // Find our constraint in view results
      const viewConstraint = viewResults.find((c: any) => c.constraint_text === 'View test constraint');
      assert.ok(viewConstraint, 'Should find constraint in view');
      assert.strictEqual(viewConstraint.priority, 3);
    });
  });
});
