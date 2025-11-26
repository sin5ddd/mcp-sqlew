/**
 * Workflow 1 Debug - Isolate the failure
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdirSync } from 'node:fs';
import { initializeDatabase, closeDatabase, getAdapter } from '../../database.js';
import { ProjectContext } from '../../utils/project-context.js';
import { validateAgainstPolicies } from '../../utils/policy-validator.js';

const TEST_DB_PATH = '.tmp-test/e2e-workflow1-debug.db';

describe('Workflow 1 Debug', () => {
  before(async () => {
    // Ensure test directory exists
    mkdirSync('.tmp-test', { recursive: true });

    const adapter = await initializeDatabase({
      databaseType: 'sqlite',
      connection: { filename: TEST_DB_PATH }
    });

    const knex = adapter.getKnex();
    const projectContext = ProjectContext.getInstance();
    await projectContext.ensureProject(knex, 'test-e2e-w1', 'config', {
      projectRootPath: process.cwd(),
    });
  });

  after(async () => {
    try {
      // Clean up test policy
      const adapter = getAdapter();
      const knex = adapter.getKnex();
      const projectId = ProjectContext.getInstance().getProjectId();

      await knex('v4_decision_policies')
        .where({ name: 'test-cve-policy', project_id: projectId })
        .del();
    } catch (error) {
      // Ignore cleanup errors
    }

    await closeDatabase();
  });

  it('should create policy and validate CVE-ID', async () => {
    try {
      console.log('Step 1: Creating policy...');
      const adapter = getAdapter();
      const knex = adapter.getKnex();
      const projectId = ProjectContext.getInstance().getProjectId();

      // Delete existing policy if present (from failed previous run)
      await knex('v4_decision_policies')
        .where({ name: 'test-cve-policy', project_id: projectId })
        .del();

      // Get system agent ID
      let systemAgentId: number;
      const systemAgent = await knex('v4_agents').where('name', 'system').select('id').first();
      if (systemAgent) {
        systemAgentId = systemAgent.id;
      } else {
        const [agentId] = await knex('v4_agents').insert({
          name: 'system',
          last_active_ts: Math.floor(Date.now() / 1000)
        });
        systemAgentId = agentId;
      }

      await knex('v4_decision_policies').insert({
        project_id: projectId,
        name: 'test-cve-policy',
        category: 'security',
        defaults: JSON.stringify({
          layer: 'cross-cutting',
          tags: ['security', 'vulnerability']
        }),
        validation_rules: JSON.stringify({
          patterns: {
            key: '^test/cve/CVE-\\d{4}-\\d{4,7}$'
          }
        }),
        quality_gates: JSON.stringify({
          required_fields: ['severity']
        }),
        created_by: systemAgentId,
        ts: Math.floor(Date.now() / 1000)
      });

      console.log('Step 2: Validating against policy...');
      const validation = await validateAgainstPolicies(
        adapter,
        'test/cve/CVE-2024-12345',
        'Test vulnerability',
        {
          severity: 'high',
          policy_name: 'test-cve-policy'  // Explicit policy reference
        },
        undefined
      );

      console.log('Validation result:', JSON.stringify(validation, null, 2));

      assert.strictEqual(validation.valid, true, 'Should pass validation');
      assert.strictEqual(validation.violations.length, 0);
      assert.ok(validation.matchedPolicy, 'Should match policy');

      console.log('✅ Test passed');
    } catch (error) {
      console.error('❌ Test failed:', error);
      throw error;
    }
  });
});
