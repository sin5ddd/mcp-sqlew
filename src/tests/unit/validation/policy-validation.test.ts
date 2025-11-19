/**
 * Policy Validation Unit Tests - Decision Intelligence System v3.9.0
 *
 * Tests for policy-validator.ts covering:
 * - Policy pattern matching
 * - Required fields validation
 * - Regex pattern enforcement
 * - Quality gates checking
 * - Error message clarity
 *
 * Task 403: Write policy validation unit tests
 * Dependencies: Task 401 (policy validator implementation)
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { validateAgainstPolicies } from '../../../utils/policy-validator.js';
import { initializeDatabase, closeDatabase } from '../../../database.js';
import { ProjectContext } from '../../../utils/project-context.js';
import type { DatabaseAdapter } from '../../../adapters/index.js';
import path from 'path';
import fs from 'fs';

const TEST_DB_PATH = '.sqlew/tmp/test-policy-validation.db';

describe('Policy Validation Tests', () => {
  let adapter: DatabaseAdapter;
  let projectId: number;

  before(async () => {
    // Create temporary test database
    const testDbDir = path.dirname(TEST_DB_PATH);

    if (!fs.existsSync(testDbDir)) {
      fs.mkdirSync(testDbDir, { recursive: true });
    }

    // Remove existing test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }

    // Initialize database
    adapter = await initializeDatabase({ databaseType: 'sqlite', connection: { filename: TEST_DB_PATH } });

    // Set up project context (required after v3.7.0)
    const knex = adapter.getKnex();
    const projectContext = ProjectContext.getInstance();
    await projectContext.ensureProject(knex, 'test-policy-validation', 'config', {
      projectRootPath: process.cwd(),
    });

    // Get actual project ID for use in tests
    projectId = projectContext.getProjectId();
  });

  after(async () => {
    // Cleanup test policies to prevent foreign key errors
    const knex = adapter.getKnex();
    await knex('t_decision_policies')
      .where('project_id', projectId)
      .delete();

    // Cleanup
    await closeDatabase();

    // Remove test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  describe('Policy Pattern Matching', () => {
    it('should match security_vulnerability policy for CVE keys', async () => {
      const knex = adapter.getKnex();

      // Insert security_vulnerability policy
      await knex('t_decision_policies').insert({
        name: 'security_vulnerability',
        project_id: projectId,
        defaults: JSON.stringify({ layer: 'security' }),
        validation_rules: JSON.stringify({
          patterns: { cve_id: '^CVE-\\d{4}-\\d{4,7}$' }
        }),
        quality_gates: JSON.stringify({
          required_fields: ['rationale', 'cve_id', 'severity']
        }),
        suggest_similar: 1,
        category: 'security'
      });

      const result = await validateAgainstPolicies(
        adapter,
        'CVE-2024-1234',
        'Fix critical vulnerability',
        { cve_id: 'CVE-2024-1234', severity: 'critical', rationale: 'RCE exploit' }
      );

      assert.strictEqual(result.valid, true, 'CVE key should match security_vulnerability policy');
      assert.strictEqual(result.matchedPolicy?.name, 'security_vulnerability');
    });

    it('should match breaking_change policy for version keys', async () => {
      const knex = adapter.getKnex();

      // Insert breaking_change policy
      await knex('t_decision_policies').insert({
        name: 'breaking_change',
        project_id: projectId,
        defaults: JSON.stringify({ layer: 'business' }),
        validation_rules: JSON.stringify({
          patterns: { semver: '^\\d+\\.\\d+\\.\\d+$' }
        }),
        quality_gates: JSON.stringify({
          required_fields: ['rationale', 'migration_guide', 'semver_bump']
        }),
        category: 'compatibility'
      });

      const result = await validateAgainstPolicies(
        adapter,
        'version-2.0.0-breaking-api',
        'Remove deprecated API',
        { semver: '2.0.0', semver_bump: 'major', rationale: 'Cleanup', migration_guide: 'Use new API' }
      );

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.matchedPolicy?.name, 'breaking_change');
    });

    it('should match architecture_decision policy for ADR keys', async () => {
      const knex = adapter.getKnex();

      await knex('t_decision_policies').insert({
        name: 'architecture_decision',
        project_id: projectId,
        defaults: JSON.stringify({ layer: 'infrastructure' }),
        quality_gates: JSON.stringify({
          required_fields: ['rationale', 'alternatives', 'tradeoffs']
        }),
        category: 'architecture'
      });

      const result = await validateAgainstPolicies(
        adapter,
        'adr-001-microservices',
        'Adopt microservices architecture',
        { rationale: 'Scalability', alternatives: ['Monolith'], tradeoffs: 'Complexity' }
      );

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.matchedPolicy?.name, 'architecture_decision');
    });
  });

  describe('Pattern Validation', () => {
    it('should validate CVE ID pattern correctly', async () => {
      const knex = adapter.getKnex();

      await knex('t_decision_policies').insert({
        name: 'test_cve_pattern',
        project_id: projectId,
        defaults: JSON.stringify({}),
        validation_rules: JSON.stringify({
          patterns: { cve_id: '^CVE-\\d{4}-\\d{4,7}$' }
        })
      });

      // Valid CVE ID
      const validResult = await validateAgainstPolicies(
        adapter,
        'cve-test-valid',
        'Test',
        { cve_id: 'CVE-2024-12345', policy_name: 'test_cve_pattern' }
      );

      assert.strictEqual(validResult.valid, true);
      assert.strictEqual(validResult.violations.length, 0);

      // Invalid CVE ID
      const invalidResult = await validateAgainstPolicies(
        adapter,
        'cve-test-invalid',
        'Test',
        { cve_id: 'CVE-INVALID', policy_name: 'test_cve_pattern' }
      );

      assert.strictEqual(invalidResult.valid, false);
      assert.strictEqual(invalidResult.violations.length, 1);
      assert.ok(invalidResult.violations[0].includes('does not match required pattern'));
    });

    it('should validate semver pattern correctly', async () => {
      const knex = adapter.getKnex();

      await knex('t_decision_policies').insert({
        name: 'test_semver_pattern',
        project_id: projectId,
        defaults: JSON.stringify({}),
        validation_rules: JSON.stringify({
          patterns: { semver: '^\\d+\\.\\d+\\.\\d+$' }
        })
      });

      // Valid semver
      const validResult = await validateAgainstPolicies(
        adapter,
        'semver-test-valid',
        'Test',
        { semver: '2.1.0', policy_name: 'test_semver_pattern' }
      );

      assert.strictEqual(validResult.valid, true);

      // Invalid semver
      const invalidResult = await validateAgainstPolicies(
        adapter,
        'semver-test-invalid',
        'Test',
        { semver: 'v2.1', policy_name: 'test_semver_pattern' }
      );

      assert.strictEqual(invalidResult.valid, false);
      assert.ok(invalidResult.violations[0].includes('does not match required pattern'));
    });

    it('should handle multiple pattern validations', async () => {
      const knex = adapter.getKnex();

      await knex('t_decision_policies').insert({
        name: 'test_multi_pattern',
        project_id: projectId,
        defaults: JSON.stringify({}),
        validation_rules: JSON.stringify({
          patterns: {
            email: '^[^@]+@[^@]+\\.[^@]+$',
            phone: '^\\d{3}-\\d{3}-\\d{4}$'
          }
        })
      });

      // All valid
      const validResult = await validateAgainstPolicies(
        adapter,
        'multi-pattern-test',
        'Test',
        { email: 'test@example.com', phone: '123-456-7890', policy_name: 'test_multi_pattern' }
      );

      assert.strictEqual(validResult.valid, true);

      // One invalid
      const partialResult = await validateAgainstPolicies(
        adapter,
        'multi-pattern-test-2',
        'Test',
        { email: 'invalid-email', phone: '123-456-7890', policy_name: 'test_multi_pattern' }
      );

      assert.strictEqual(partialResult.valid, false);
      assert.strictEqual(partialResult.violations.length, 1);
    });
  });

  describe('Required Fields Validation', () => {
    it('should enforce legacy required_fields (template compatibility)', async () => {
      const knex = adapter.getKnex();

      await knex('t_decision_policies').insert({
        name: 'test_required_fields',
        project_id: projectId,
        defaults: JSON.stringify({}),
        required_fields: JSON.stringify(['field1', 'field2', 'field3'])
      });

      // All fields present
      const validResult = await validateAgainstPolicies(
        adapter,
        'required-test-valid',
        'Test',
        { field1: 'value1', field2: 'value2', field3: 'value3', policy_name: 'test_required_fields' }
      );

      assert.strictEqual(validResult.valid, true);

      // Missing field
      const invalidResult = await validateAgainstPolicies(
        adapter,
        'required-test-invalid',
        'Test',
        { field1: 'value1', field2: 'value2', policy_name: 'test_required_fields' }
      );

      assert.strictEqual(invalidResult.valid, false);
      assert.strictEqual(invalidResult.violations.length, 1);
      assert.ok(invalidResult.violations[0].includes('Required field missing: "field3"'));
    });

    it('should reject empty string values', async () => {
      const knex = adapter.getKnex();

      await knex('t_decision_policies').insert({
        name: 'test_empty_string',
        project_id: projectId,
        defaults: JSON.stringify({}),
        required_fields: JSON.stringify(['important_field'])
      });

      const result = await validateAgainstPolicies(
        adapter,
        'empty-string-test',
        'Test',
        { important_field: '', policy_name: 'test_empty_string' }
      );

      assert.strictEqual(result.valid, false);
      assert.ok(result.violations[0].includes('Required field missing'));
    });
  });

  describe('Quality Gates Validation', () => {
    it('should enforce quality_gates.required_fields', async () => {
      const knex = adapter.getKnex();

      await knex('t_decision_policies').insert({
        name: 'test_quality_gates',
        project_id: projectId,
        defaults: JSON.stringify({}),
        quality_gates: JSON.stringify({
          required_fields: ['rationale', 'impact', 'timeline']
        })
      });

      // All fields present
      const validResult = await validateAgainstPolicies(
        adapter,
        'quality-gates-valid',
        'Test',
        { rationale: 'Important', impact: 'High', timeline: 'Q1', policy_name: 'test_quality_gates' }
      );

      assert.strictEqual(validResult.valid, true);

      // Missing field
      const invalidResult = await validateAgainstPolicies(
        adapter,
        'quality-gates-invalid',
        'Test',
        { rationale: 'Important', impact: 'High', policy_name: 'test_quality_gates' }
      );

      assert.strictEqual(invalidResult.valid, false);
      assert.ok(invalidResult.violations[0].includes('Quality gate: Required field missing: "timeline"'));
    });

    it('should combine pattern validation and quality gates', async () => {
      const knex = adapter.getKnex();

      await knex('t_decision_policies').insert({
        name: 'test_combined_validation',
        project_id: projectId,
        defaults: JSON.stringify({}),
        validation_rules: JSON.stringify({
          patterns: { version: '^\\d+\\.\\d+\\.\\d+$' }
        }),
        quality_gates: JSON.stringify({
          required_fields: ['changelog', 'migration_notes']
        })
      });

      // All valid
      const validResult = await validateAgainstPolicies(
        adapter,
        'combined-test-valid',
        'Test',
        {
          version: '1.0.0',
          changelog: 'Added features',
          migration_notes: 'No breaking changes',
          policy_name: 'test_combined_validation'
        }
      );

      assert.strictEqual(validResult.valid, true);

      // Pattern fails
      const patternFailResult = await validateAgainstPolicies(
        adapter,
        'combined-test-pattern-fail',
        'Test',
        {
          version: 'invalid',
          changelog: 'Added features',
          migration_notes: 'No breaking changes',
          policy_name: 'test_combined_validation'
        }
      );

      assert.strictEqual(patternFailResult.valid, false);
      assert.strictEqual(patternFailResult.violations.length, 1);
      assert.ok(patternFailResult.violations[0].includes('does not match required pattern'));

      // Quality gate fails
      const gateFailResult = await validateAgainstPolicies(
        adapter,
        'combined-test-gate-fail',
        'Test',
        {
          version: '1.0.0',
          changelog: 'Added features',
          policy_name: 'test_combined_validation'
        }
      );

      assert.strictEqual(gateFailResult.valid, false);
      assert.ok(gateFailResult.violations[0].includes('Quality gate: Required field missing'));

      // Both fail
      const bothFailResult = await validateAgainstPolicies(
        adapter,
        'combined-test-both-fail',
        'Test',
        {
          version: 'bad-version',
          policy_name: 'test_combined_validation'
        }
      );

      assert.strictEqual(bothFailResult.valid, false);
      assert.strictEqual(bothFailResult.violations.length, 3); // 1 pattern + 2 quality gates
    });
  });

  describe('Error Handling', () => {
    it('should handle missing policies gracefully', async () => {
      const result = await validateAgainstPolicies(
        adapter,
        'no-policy-match',
        'Test value',
        { some_field: 'value' }
      );

      assert.strictEqual(result.valid, true, 'Should pass when no policy matches');
      assert.strictEqual(result.violations.length, 0);
      assert.strictEqual(result.matchedPolicy, undefined);
    });

    it('should handle malformed JSON in validation_rules', async () => {
      const knex = adapter.getKnex();

      await knex('t_decision_policies').insert({
        name: 'test_malformed_validation',
        project_id: projectId,
        defaults: JSON.stringify({}),
        validation_rules: 'INVALID JSON'
      });

      const result = await validateAgainstPolicies(
        adapter,
        'malformed-test',
        'Test',
        { policy_name: 'test_malformed_validation' }
      );

      // Should not throw error, should pass gracefully
      assert.strictEqual(result.valid, true);
    });

    it('should handle malformed JSON in quality_gates', async () => {
      const knex = adapter.getKnex();

      await knex('t_decision_policies').insert({
        name: 'test_malformed_gates',
        project_id: projectId,
        defaults: JSON.stringify({}),
        quality_gates: 'NOT VALID JSON'
      });

      const result = await validateAgainstPolicies(
        adapter,
        'malformed-gates-test',
        'Test',
        { policy_name: 'test_malformed_gates' }
      );

      assert.strictEqual(result.valid, true, 'Should pass gracefully on malformed JSON');
    });

    it('should provide clear error messages', async () => {
      const knex = adapter.getKnex();

      await knex('t_decision_policies').insert({
        name: 'test_clear_errors',
        project_id: projectId,
        defaults: JSON.stringify({}),
        validation_rules: JSON.stringify({
          patterns: { email: '^[^@]+@[^@]+\\.[^@]+$' }
        }),
        quality_gates: JSON.stringify({
          required_fields: ['approval_by', 'approved_date']
        })
      });

      const result = await validateAgainstPolicies(
        adapter,
        'clear-errors-test',
        'Test',
        { email: 'not-an-email', policy_name: 'test_clear_errors' }
      );

      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.violations.length, 3);

      // Check error message clarity
      assert.ok(result.violations.some(v => v.includes('email') && v.includes('does not match')));
      assert.ok(result.violations.some(v => v.includes('approval_by') && v.includes('missing')));
      assert.ok(result.violations.some(v => v.includes('approved_date') && v.includes('missing')));
    });
  });

  describe('Explicit Policy Reference', () => {
    it('should use metadata.policy_name for explicit policy selection', async () => {
      const knex = adapter.getKnex();

      await knex('t_decision_policies').insert({
        name: 'custom_policy',
        project_id: projectId,
        defaults: JSON.stringify({}),
        quality_gates: JSON.stringify({
          required_fields: ['custom_field']
        })
      });

      const result = await validateAgainstPolicies(
        adapter,
        'any-key-name',
        'Test',
        { policy_name: 'custom_policy', custom_field: 'present' }
      );

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.matchedPolicy?.name, 'custom_policy');
    });
  });
});
