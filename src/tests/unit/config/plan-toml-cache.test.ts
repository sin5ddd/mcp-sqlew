/**
 * Plan TOML Cache Unit Tests
 *
 * Tests for cache CRUD operations for plan TOML data.
 *
 * @since v4.2.0
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { existsSync, mkdirSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  getPlanTomlCachePath,
  loadPlanTomlCache,
  savePlanTomlCache,
  clearPlanTomlCache,
  type PlanTomlCache,
  type DecisionCandidate,
  type ConstraintCandidate,
} from '../../../config/global-config.js';

describe('plan-toml-cache', () => {
  // Use a unique temp directory for each test
  let testProjectPath: string;

  beforeEach(() => {
    // Create unique test directory
    testProjectPath = join(tmpdir(), `sqlew-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testProjectPath, { recursive: true });
  });

  afterEach(() => {
    // Cleanup test directory
    if (existsSync(testProjectPath)) {
      rmSync(testProjectPath, { recursive: true, force: true });
    }
  });

  describe('getPlanTomlCachePath', () => {
    it('should return path ending with _plan-toml.json', () => {
      const cachePath = getPlanTomlCachePath(testProjectPath);
      assert.ok(cachePath.endsWith('_plan-toml.json'));
    });

    it('should return consistent path for same project', () => {
      const path1 = getPlanTomlCachePath(testProjectPath);
      const path2 = getPlanTomlCachePath(testProjectPath);
      assert.strictEqual(path1, path2);
    });

    it('should return different paths for different projects', () => {
      const path1 = getPlanTomlCachePath(testProjectPath);
      const path2 = getPlanTomlCachePath(join(testProjectPath, 'subdir'));
      assert.notStrictEqual(path1, path2);
    });
  });

  describe('savePlanTomlCache / loadPlanTomlCache', () => {
    it('should save and load cache correctly', () => {
      const decisions: DecisionCandidate[] = [
        {
          key: 'test/decision',
          value: 'Test value',
          status: 'active',
          layer: 'business',
          tags: ['test'],
        },
      ];

      const constraints: ConstraintCandidate[] = [
        {
          text: 'Test constraint',
          category: 'security',
          priority: 'high',
        },
      ];

      const cache: PlanTomlCache = {
        plan_id: 'test-plan-123',
        decisions,
        constraints,
        updated_at: new Date().toISOString(),
        decisions_registered: false,
        constraints_prompted: false,
      };

      savePlanTomlCache(testProjectPath, cache);
      const loaded = loadPlanTomlCache(testProjectPath);

      assert.ok(loaded);
      assert.strictEqual(loaded.plan_id, 'test-plan-123');
      assert.strictEqual(loaded.decisions.length, 1);
      assert.strictEqual(loaded.constraints.length, 1);
      assert.strictEqual(loaded.decisions[0].key, 'test/decision');
      assert.strictEqual(loaded.constraints[0].text, 'Test constraint');
    });

    it('should return null for non-existent cache', () => {
      const loaded = loadPlanTomlCache(testProjectPath);
      assert.strictEqual(loaded, null);
    });

    it('should preserve all decision fields', () => {
      const decision: DecisionCandidate = {
        key: 'full/decision',
        value: 'Complete decision',
        status: 'draft',
        layer: 'data',
        tags: ['tag1', 'tag2'],
        rationale: 'Because reasons',
        alternatives: ['Alt 1', 'Alt 2'],
        tradeoffs: 'Speed vs safety',
      };

      const cache: PlanTomlCache = {
        plan_id: 'full-test',
        decisions: [decision],
        constraints: [],
        updated_at: new Date().toISOString(),
        decisions_registered: true,
        constraints_prompted: true,
      };

      savePlanTomlCache(testProjectPath, cache);
      const loaded = loadPlanTomlCache(testProjectPath);

      assert.ok(loaded);
      const d = loaded.decisions[0];
      assert.strictEqual(d.key, 'full/decision');
      assert.strictEqual(d.value, 'Complete decision');
      assert.strictEqual(d.status, 'draft');
      assert.strictEqual(d.layer, 'data');
      assert.deepStrictEqual(d.tags, ['tag1', 'tag2']);
      assert.strictEqual(d.rationale, 'Because reasons');
      assert.deepStrictEqual(d.alternatives, ['Alt 1', 'Alt 2']);
      assert.strictEqual(d.tradeoffs, 'Speed vs safety');
    });

    it('should preserve all constraint fields', () => {
      const constraint: ConstraintCandidate = {
        text: 'Full constraint',
        category: 'performance',
        priority: 'critical',
        layer: 'infrastructure',
        tags: ['perf', 'critical'],
        rationale: 'Performance matters',
      };

      const cache: PlanTomlCache = {
        plan_id: 'constraint-test',
        decisions: [],
        constraints: [constraint],
        updated_at: new Date().toISOString(),
        decisions_registered: false,
        constraints_prompted: false,
      };

      savePlanTomlCache(testProjectPath, cache);
      const loaded = loadPlanTomlCache(testProjectPath);

      assert.ok(loaded);
      const c = loaded.constraints[0];
      assert.strictEqual(c.text, 'Full constraint');
      assert.strictEqual(c.category, 'performance');
      assert.strictEqual(c.priority, 'critical');
      assert.strictEqual(c.layer, 'infrastructure');
      assert.deepStrictEqual(c.tags, ['perf', 'critical']);
      assert.strictEqual(c.rationale, 'Performance matters');
    });

    it('should update existing cache on save', () => {
      const cache1: PlanTomlCache = {
        plan_id: 'plan-1',
        decisions: [{ key: 'first', value: 'First' }],
        constraints: [],
        updated_at: new Date().toISOString(),
        decisions_registered: false,
        constraints_prompted: false,
      };

      const cache2: PlanTomlCache = {
        plan_id: 'plan-2',
        decisions: [{ key: 'second', value: 'Second' }],
        constraints: [],
        updated_at: new Date().toISOString(),
        decisions_registered: true,
        constraints_prompted: true,
      };

      savePlanTomlCache(testProjectPath, cache1);
      savePlanTomlCache(testProjectPath, cache2);
      const loaded = loadPlanTomlCache(testProjectPath);

      assert.ok(loaded);
      assert.strictEqual(loaded.plan_id, 'plan-2');
      assert.strictEqual(loaded.decisions[0].key, 'second');
      assert.strictEqual(loaded.decisions_registered, true);
    });
  });

  describe('clearPlanTomlCache', () => {
    it('should clear cache by writing empty arrays', () => {
      const cache: PlanTomlCache = {
        plan_id: 'to-clear',
        decisions: [{ key: 'test', value: 'value' }],
        constraints: [{ text: 'rule', category: 'security' }],
        updated_at: new Date().toISOString(),
        decisions_registered: true,
        constraints_prompted: true,
      };

      savePlanTomlCache(testProjectPath, cache);
      clearPlanTomlCache(testProjectPath);

      const cachePath = getPlanTomlCachePath(testProjectPath);
      const content = JSON.parse(readFileSync(cachePath, 'utf-8'));

      assert.deepStrictEqual(content.decisions, []);
      assert.deepStrictEqual(content.constraints, []);
    });

    it('should not throw for non-existent cache', () => {
      // Should not throw
      clearPlanTomlCache(testProjectPath);
    });
  });

  describe('flag management', () => {
    it('should track decisions_registered flag', () => {
      const cache: PlanTomlCache = {
        plan_id: 'flag-test',
        decisions: [{ key: 'test', value: 'value' }],
        constraints: [],
        updated_at: new Date().toISOString(),
        decisions_registered: false,
        constraints_prompted: false,
      };

      savePlanTomlCache(testProjectPath, cache);
      let loaded = loadPlanTomlCache(testProjectPath);
      assert.strictEqual(loaded?.decisions_registered, false);

      // Update flag
      cache.decisions_registered = true;
      savePlanTomlCache(testProjectPath, cache);
      loaded = loadPlanTomlCache(testProjectPath);
      assert.strictEqual(loaded?.decisions_registered, true);
    });

    it('should track constraints_prompted flag', () => {
      const cache: PlanTomlCache = {
        plan_id: 'flag-test',
        decisions: [],
        constraints: [{ text: 'rule', category: 'security' }],
        updated_at: new Date().toISOString(),
        decisions_registered: false,
        constraints_prompted: false,
      };

      savePlanTomlCache(testProjectPath, cache);
      let loaded = loadPlanTomlCache(testProjectPath);
      assert.strictEqual(loaded?.constraints_prompted, false);

      // Update flag
      cache.constraints_prompted = true;
      savePlanTomlCache(testProjectPath, cache);
      loaded = loadPlanTomlCache(testProjectPath);
      assert.strictEqual(loaded?.constraints_prompted, true);
    });
  });
});
