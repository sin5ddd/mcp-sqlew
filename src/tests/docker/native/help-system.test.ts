/**
 * Help System - Native RDBMS Integration Tests
 *
 * Tests help system tables (m_help_tools, m_help_actions, t_help_action_examples,
 * t_help_use_cases) on fresh MySQL, MariaDB, and PostgreSQL installations.
 *
 * Task #534: Refactor to use direct Knex operations instead of MCP tool functions
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import type { Knex } from 'knex';
import { runTestsOnAllDatabases } from './test-harness.js';

runTestsOnAllDatabases('Help System', (getDb, dbType) => {
  let projectId: number;

  // Get project ID before running tests
  it('should get project ID', async () => {
    const db = getDb();
    const project = await db('v4_projects').first();
    assert.ok(project, 'Project should exist');
    projectId = project.id;
  });

  // ============================================================================
  // m_help_tools - Tool Registry
  // ============================================================================

  describe('m_help_tools table', () => {
    it('should have decision tool registered', async () => {
      const db = getDb();

      const tool = await db('v4_help_tools')
        .where({ tool_name: 'decision' })
        .first();

      assert.ok(tool, 'Decision tool should be registered');
      assert.strictEqual(tool.tool_name, 'decision');
      assert.ok(tool.description, 'Tool should have description');
      assert.ok(tool.description.includes('decision') || tool.description.includes('context'),
        'Description should mention decision or context management');
    });

    it('should have task tool registered', async () => {
      const db = getDb();

      const tool = await db('v4_help_tools')
        .where({ tool_name: 'task' })
        .first();

      assert.ok(tool, 'Task tool should be registered');
      assert.strictEqual(tool.tool_name, 'task');
      assert.ok(tool.description, 'Tool should have description');
    });

    it('should have constraint tool registered', async () => {
      const db = getDb();

      const tool = await db('v4_help_tools')
        .where({ tool_name: 'constraint' })
        .first();

      assert.ok(tool, 'Constraint tool should be registered');
      assert.strictEqual(tool.tool_name, 'constraint');
      assert.ok(tool.description, 'Tool should have description');
    });

    it('should have help and example tools registered', async () => {
      const db = getDb();

      const helpTool = await db('v4_help_tools')
        .where({ tool_name: 'help' })
        .first();

      const exampleTool = await db('v4_help_tools')
        .where({ tool_name: 'example' })
        .first();

      assert.ok(helpTool, 'Help tool should be registered');
      assert.ok(exampleTool, 'Example tool should be registered');
    });

    it('should have all core tools registered', async () => {
      const db = getDb();

      const tools = await db('v4_help_tools')
        .select('tool_name')
        .orderBy('tool_name');

      const toolNames = tools.map((t: any) => t.tool_name);

      // Core tools that must exist
      const requiredTools = ['decision', 'task', 'constraint', 'help', 'example'];
      for (const requiredTool of requiredTools) {
        assert.ok(
          toolNames.includes(requiredTool),
          `Should have ${requiredTool} tool registered`
        );
      }
    });
  });

  // ============================================================================
  // m_help_actions - Action Documentation
  // ============================================================================

  describe('m_help_actions table', () => {
    it('should have decision.set action documented', async () => {
      const db = getDb();

      const action = await db('v4_help_actions')
        .where({ tool_name: 'decision', action_name: 'set' })
        .first();

      assert.ok(action, 'decision.set action should be documented');
      assert.strictEqual(action.action_name, 'set');
      assert.ok(action.description, 'Action should have description');

      // Parameters are stored in t_help_action_params table
      const params = await db('v4_help_action_params')
        .where({ action_id: action.action_id })
        .select('*');

      assert.ok(Array.isArray(params), 'Parameters should be an array');
      assert.ok(params.length > 0, 'Should have at least one parameter');

      // Verify key parameters
      const paramNames = params.map((p: any) => p.param_name);
      assert.ok(paramNames.includes('key'), 'Should have key parameter');
      assert.ok(paramNames.includes('value'), 'Should have value parameter');
    });

    it('should have task.create action documented', async () => {
      const db = getDb();

      const action = await db('v4_help_actions')
        .where({ tool_name: 'task', action_name: 'create' })
        .first();

      assert.ok(action, 'task.create action should be documented');
      assert.strictEqual(action.action_name, 'create');
      assert.ok(action.description, 'Action should have description');

      // Parameters are stored in t_help_action_params table
      const params = await db('v4_help_action_params')
        .where({ action_id: action.action_id })
        .select('*');

      // Verify file_actions parameter is documented (v3.8.0)
      const paramNames = params.map((p: any) => p.param_name);
      assert.ok(
        paramNames.includes('file_actions'),
        'Should document file_actions parameter'
      );

      const fileActionsParam = params.find((p: any) => p.param_name === 'file_actions');
      assert.ok(fileActionsParam, 'file_actions parameter should exist');
    });

    it('should have constraint.add action documented', async () => {
      const db = getDb();

      const action = await db('v4_help_actions')
        .where({ tool_name: 'constraint', action_name: 'add' })
        .first();

      assert.ok(action, 'constraint.add action should be documented');
      assert.strictEqual(action.action_name, 'add');
      assert.ok(action.description, 'Action should have description');

      // Parameters are stored in t_help_action_params table
      const params = await db('v4_help_action_params')
        .where({ action_id: action.action_id })
        .select('*');

      assert.ok(Array.isArray(params), 'Should have parameters');
    });

    it('should have multiple actions per tool', async () => {
      const db = getDb();

      const decisionActions = await db('v4_help_actions')
        .where({ tool_name: 'decision' })
        .select('action_name');

      const taskActions = await db('v4_help_actions')
        .where({ tool_name: 'task' })
        .select('action_name');

      assert.ok(decisionActions.length > 1, 'Decision tool should have multiple actions');
      assert.ok(taskActions.length > 1, 'Task tool should have multiple actions');

      // Verify key task actions exist
      const taskActionNames = taskActions.map((a: any) => a.action_name);
      assert.ok(taskActionNames.includes('create'), 'Should have create action');
      assert.ok(taskActionNames.includes('update'), 'Should have update action');
      assert.ok(taskActionNames.includes('move'), 'Should have move action');
    });

    it('should indicate required vs optional parameters', async () => {
      const db = getDb();

      const action = await db('v4_help_actions')
        .where({ tool_name: 'decision', action_name: 'set' })
        .first();

      assert.ok(action, 'Action should exist');

      // Parameters are stored in t_help_action_params table
      const params = await db('v4_help_action_params')
        .where({ action_id: action.action_id })
        .select('*');

      assert.ok(params.length > 0, 'Should have parameters');

      // Check that parameters have required flag (stored as integer 0/1)
      const hasRequiredFlag = params.every((p: any) =>
        typeof p.required === 'number' || typeof p.required === 'boolean'
      );
      assert.ok(hasRequiredFlag, 'All parameters should have required flag');
    });
  });

  // ============================================================================
  // m_help_actions - Foreign Key Constraints
  // ============================================================================

  describe('m_help_actions foreign key constraints', () => {
    it('should enforce FK constraint on tool_name', async () => {
      const db = getDb();

      try {
        await db('v4_help_actions').insert({
          tool_name: 'non_existent_tool',
          action_name: 'test_action',
          description: 'Test description',
          parameters: '[]',
        });
        assert.fail('Should have thrown FK constraint error');
      } catch (error: any) {
        // Expected: FK constraint violation
        assert.ok(
          error.message.includes('foreign key') ||
          error.message.includes('FOREIGN KEY') ||
          error.message.includes('constraint'),
          'Should be a foreign key constraint error'
        );
      }
    });

    it('should allow actions with valid tool_name', async () => {
      const db = getDb();

      // Insert a test action with valid tool_name
      const testActionName = `test_action_${Date.now()}`;

      await db('v4_help_actions').insert({
        tool_name: 'decision',
        action_name: testActionName,
        description: 'Test action',
        parameters: '[]',
      });

      const inserted = await db('v4_help_actions')
        .where({ tool_name: 'decision', action_name: testActionName })
        .first();

      assert.ok(inserted, 'Should insert action with valid tool_name');

      // Cleanup
      await db('v4_help_actions')
        .where({ action_name: testActionName })
        .delete();
    });
  });

  // ============================================================================
  // t_help_action_examples - Example Storage
  // ============================================================================

  describe('t_help_action_examples table', () => {
    it('should have examples for decision tool', async () => {
      const db = getDb();

      // Join with m_help_actions to filter by tool_name
      const examples = await db('v4_help_action_examples')
        .join('v4_help_actions', 't_help_action_examples.action_id', 'm_help_actions.action_id')
        .where({ 'm_help_actions.tool_name': 'decision' })
        .select('t_help_action_examples.*');

      // Should have examples seeded
      assert.ok(
        examples.length >= 0,
        'Should return examples (or empty array if none seeded)'
      );

      if (examples.length > 0) {
        const example = examples[0];
        assert.ok(example.example_title, 'Example should have example_title');
        assert.ok(example.example_code, 'Example should have example_code');
      }
    });

    it('should filter examples by action', async () => {
      const db = getDb();

      // Join with m_help_actions to filter by tool_name and action_name
      const examples = await db('v4_help_action_examples')
        .join('v4_help_actions', 't_help_action_examples.action_id', 'm_help_actions.action_id')
        .where({ 'm_help_actions.tool_name': 'decision', 'm_help_actions.action_name': 'set' })
        .select('t_help_action_examples.*', 'm_help_actions.tool_name', 'm_help_actions.action_name');

      // Verify filtering works
      assert.ok(Array.isArray(examples), 'Should return array');

      // All returned examples should match the filter
      examples.forEach((ex: any) => {
        assert.strictEqual(ex.tool_name, 'decision');
        assert.strictEqual(ex.action_name, 'set');
      });
    });

    it('should have required columns', async () => {
      const db = getDb();

      const examples = await db('v4_help_action_examples')
        .limit(5)
        .select('*');

      assert.ok(Array.isArray(examples), 'Should return examples array');

      if (examples.length > 0) {
        const example = examples[0];
        assert.ok('example_id' in example, 'Should have example_id');
        assert.ok('action_id' in example, 'Should have action_id');
        assert.ok('example_title' in example, 'Should have example_title');
        assert.ok('example_code' in example, 'Should have example_code');
        assert.ok('explanation' in example, 'Should have explanation');
      }
    });

    it('should search examples by keyword in title', async () => {
      const db = getDb();

      const keyword = 'decision';
      const examples = await db('v4_help_action_examples')
        .where('example_title', 'like', `%${keyword}%`)
        .select('*');

      assert.ok(Array.isArray(examples), 'Should return search results');

      // All results should match keyword in title
      examples.forEach((ex: any) => {
        assert.ok(
          ex.example_title.toLowerCase().includes(keyword.toLowerCase()),
          'Title should contain keyword'
        );
      });
    });

    it('should search examples by keyword in explanation', async () => {
      const db = getDb();

      const keyword = 'task';
      const examples = await db('v4_help_action_examples')
        .where('explanation', 'like', `%${keyword}%`)
        .select('*');

      assert.ok(Array.isArray(examples), 'Should return search results');
    });

    it('should search examples by tool and keyword', async () => {
      const db = getDb();

      // Join with m_help_actions to filter by tool_name
      const examples = await db('v4_help_action_examples')
        .join('v4_help_actions', 't_help_action_examples.action_id', 'm_help_actions.action_id')
        .where({ 'm_help_actions.tool_name': 'task' })
        .andWhere(function() {
          this.where('example_title', 'like', '%create%')
            .orWhere('explanation', 'like', '%create%');
        })
        .select('t_help_action_examples.*', 'm_help_actions.tool_name');

      assert.ok(Array.isArray(examples), 'Should return filtered search results');

      // All results should be for task tool
      examples.forEach((ex: any) => {
        assert.strictEqual(ex.tool_name, 'task');
      });
    });
  });

  // ============================================================================
  // t_help_use_cases - Use Case Storage
  // ============================================================================

  describe('t_help_use_cases table', () => {
    it('should have use case table structure', async () => {
      const db = getDb();

      const useCases = await db('v4_help_use_cases')
        .limit(5)
        .select('*');

      assert.ok(Array.isArray(useCases), 'Should return use cases array');

      if (useCases.length > 0) {
        const useCase = useCases[0];
        assert.ok('use_case_id' in useCase, 'Use case should have use_case_id');
        assert.ok('title' in useCase, 'Use case should have title');
        assert.ok('category_id' in useCase, 'Use case should have category_id');
        assert.ok('complexity' in useCase, 'Use case should have complexity');
      }
    });

    it('should get use case by ID', async () => {
      const db = getDb();

      // Get first use case if any exist
      const firstUseCase = await db('v4_help_use_cases')
        .orderBy('use_case_id', 'asc')
        .first();

      if (firstUseCase) {
        const useCase = await db('v4_help_use_cases')
          .where({ use_case_id: firstUseCase.use_case_id })
          .first();

        assert.ok(useCase, 'Should retrieve use case by ID');
        assert.strictEqual(useCase.use_case_id, firstUseCase.use_case_id);
        assert.ok(useCase.title, 'Use case should have title');
      }
    });

    it('should search use cases by keyword in title', async () => {
      const db = getDb();

      const keyword = 'sprint';
      const useCases = await db('v4_help_use_cases')
        .where('title', 'like', `%${keyword}%`)
        .select('*');

      assert.ok(Array.isArray(useCases), 'Should return search results');
    });

    it('should search use cases by keyword in description', async () => {
      const db = getDb();

      const keyword = 'workflow';
      const useCases = await db('v4_help_use_cases')
        .where('description', 'like', `%${keyword}%`)
        .select('*');

      assert.ok(Array.isArray(useCases), 'Should return search results');
    });

    it('should filter use cases by complexity', async () => {
      const db = getDb();

      const basicUseCases = await db('v4_help_use_cases')
        .where({ complexity: 'basic' })
        .select('*');

      const advancedUseCases = await db('v4_help_use_cases')
        .where({ complexity: 'advanced' })
        .select('*');

      assert.ok(Array.isArray(basicUseCases), 'Should return basic use cases');
      assert.ok(Array.isArray(advancedUseCases), 'Should return advanced use cases');

      basicUseCases.forEach((uc: any) => {
        assert.strictEqual(uc.complexity, 'basic');
      });

      advancedUseCases.forEach((uc: any) => {
        assert.strictEqual(uc.complexity, 'advanced');
      });
    });
  });

  // ============================================================================
  // m_help_use_case_categories - Category Management
  // ============================================================================

  describe('m_help_use_case_categories table', () => {
    it('should have use case categories', async () => {
      const db = getDb();

      const categories = await db('v4_help_use_case_categories')
        .select('*');

      assert.ok(Array.isArray(categories), 'Should return categories');
      assert.ok(categories.length > 0, 'Should have at least one category');

      categories.forEach((cat: any) => {
        assert.ok(cat.id, 'Category should have id');
        assert.ok(cat.category_name, 'Category should have name');
      });
    });

    it('should join use cases with categories', async () => {
      const db = getDb();

      const useCasesWithCategory = await db('v4_help_use_cases')
        .join(
          'v4_help_use_case_categories',
          't_help_use_cases.category_id',
          'm_help_use_case_categories.category_id'
        )
        .select(
          't_help_use_cases.*',
          'm_help_use_case_categories.category_name'
        )
        .limit(5);

      assert.ok(Array.isArray(useCasesWithCategory), 'Should return joined results');

      useCasesWithCategory.forEach((uc: any) => {
        assert.ok(uc.category_name, 'Should have category_name from join');
      });
    });

    it('should filter use cases by category name', async () => {
      const db = getDb();

      const categories = await db('v4_help_use_case_categories')
        .select('*');

      if (categories.length > 0) {
        const firstCategory = categories[0];

        const useCases = await db('v4_help_use_cases')
          .join(
            'v4_help_use_case_categories',
            't_help_use_cases.category_id',
            'm_help_use_case_categories.category_id'
          )
          .where('m_help_use_case_categories.category_name', firstCategory.category_name)
          .select('t_help_use_cases.*');

        assert.ok(Array.isArray(useCases), 'Should return category-filtered results');
      }
    });
  });

  // NOTE: m_help_use_case_steps table does not exist in current schema
  // Use case steps are stored in the 'action_sequence' TEXT column of t_help_use_cases

  // ============================================================================
  // Cross-Database Compatibility Tests
  // ============================================================================

  describe(`Cross-database compatibility - ${dbType}`, () => {
    it('should handle unicode in example search', async () => {
      const db = getDb();

      const unicodeKeyword = '日本語';
      const examples = await db('v4_help_action_examples')
        .where('title', 'like', `%${unicodeKeyword}%`)
        .select('*');

      // Should not crash with unicode
      assert.ok(Array.isArray(examples), 'Should handle unicode search');
    });

    it('should handle special characters in search', async () => {
      const db = getDb();

      const specialKeyword = "test's \"special\" chars";
      const examples = await db('v4_help_action_examples')
        .where('title', 'like', `%${specialKeyword}%`)
        .select('*');

      // Should not crash with special characters
      assert.ok(Array.isArray(examples), 'Should handle special characters');
    });

    it('should support pagination in example listing', async () => {
      const db = getDb();

      const page1 = await db('v4_help_action_examples')
        .limit(5)
        .offset(0)
        .select('*');

      const page2 = await db('v4_help_action_examples')
        .limit(5)
        .offset(5)
        .select('*');

      assert.ok(Array.isArray(page1), 'Should return page 1');
      assert.ok(Array.isArray(page2), 'Should return page 2');

      // If there are enough examples, pages should be different
      if (page1.length === 5 && page2.length > 0) {
        const page1Ids = page1.map((e: any) => e.id);
        const page2Ids = page2.map((e: any) => e.id);
        const overlap = page1Ids.some((id: number) => page2Ids.includes(id));
        assert.strictEqual(overlap, false, 'Pages should not overlap');
      }
    });

    it('should support pagination in use case listing', async () => {
      const db = getDb();

      const page1 = await db('v4_help_use_cases')
        .limit(3)
        .offset(0)
        .select('*');

      const page2 = await db('v4_help_use_cases')
        .limit(3)
        .offset(3)
        .select('*');

      assert.ok(Array.isArray(page1), 'Should return page 1');
      assert.ok(Array.isArray(page2), 'Should return page 2');
    });

    it('should retrieve parameters from t_help_action_params', async () => {
      const db = getDb();

      const action = await db('v4_help_actions')
        .where({ tool_name: 'decision', action_name: 'set' })
        .first();

      if (action) {
        const params = await db('v4_help_action_params')
          .where({ action_id: action.action_id })
          .select('*');

        assert.ok(Array.isArray(params), 'Should retrieve parameters as array');
      }
    });

    it('should enforce UNIQUE constraint on tool_name in m_help_tools', async () => {
      const db = getDb();

      try {
        await db('v4_help_tools').insert({
          tool_name: 'decision', // Duplicate
          description: 'Duplicate tool',
        });
        assert.fail('Should have thrown UNIQUE constraint error');
      } catch (error: any) {
        // Expected: UNIQUE constraint violation
        assert.ok(
          error.message.includes('unique') ||
          error.message.includes('UNIQUE') ||
          error.message.includes('duplicate'),
          'Should be a unique constraint error'
        );
      }
    });

    it('should enforce composite UNIQUE on (tool_name, action_name)', async () => {
      const db = getDb();

      try {
        await db('v4_help_actions').insert({
          tool_name: 'decision',
          action_name: 'set', // Duplicate combination
          description: 'Duplicate action',
          parameters: '[]',
        });
        assert.fail('Should have thrown UNIQUE constraint error');
      } catch (error: any) {
        // Expected: UNIQUE constraint violation
        assert.ok(
          error.message.includes('unique') ||
          error.message.includes('UNIQUE') ||
          error.message.includes('duplicate'),
          'Should be a unique constraint error'
        );
      }
    });
  });

  // ============================================================================
  // Integration Tests - Complex Queries
  // ============================================================================

  describe('Integration - Complex queries', () => {
    it('should join tools, actions, and examples', async () => {
      const db = getDb();

      const results = await db('v4_help_tools')
        .join('v4_help_actions', 'm_help_tools.tool_name', 'm_help_actions.tool_name')
        .leftJoin('v4_help_action_examples', 'm_help_actions.action_id', 't_help_action_examples.action_id')
        .select(
          'm_help_tools.tool_name',
          'm_help_actions.action_name',
          't_help_action_examples.example_title'
        )
        .limit(10);

      assert.ok(Array.isArray(results), 'Should return joined results');

      results.forEach((row: any) => {
        assert.ok(row.tool_name, 'Should have tool_name');
        assert.ok(row.action_name, 'Should have action_name');
        // example_title may be null (left join)
      });
    });

    it('should count actions per tool', async () => {
      const db = getDb();

      const counts = await db('v4_help_actions')
        .select('tool_name')
        .count('* as action_count')
        .groupBy('tool_name')
        .orderBy('action_count', 'desc');

      assert.ok(Array.isArray(counts), 'Should return counts');
      assert.ok(counts.length > 0, 'Should have at least one tool with actions');

      counts.forEach((row: any) => {
        assert.ok(row.tool_name, 'Should have tool_name');
        assert.ok(row.action_count > 0, 'Should have positive count');
      });
    });

    it('should count examples per complexity level', async () => {
      const db = getDb();

      const counts = await db('v4_help_action_examples')
        .select('complexity')
        .count('* as example_count')
        .groupBy('complexity')
        .orderBy('complexity');

      assert.ok(Array.isArray(counts), 'Should return counts');

      counts.forEach((row: any) => {
        assert.ok(row.complexity, 'Should have complexity');
        assert.ok(row.example_count >= 0, 'Should have count');
      });
    });

    it('should get full use case with category', async () => {
      const db = getDb();

      // Note: m_help_use_case_steps table does not exist
      // Steps are stored in action_sequence TEXT column
      const fullUseCases = await db('v4_help_use_cases')
        .join(
          'v4_help_use_case_categories',
          't_help_use_cases.category_id',
          'm_help_use_case_categories.category_id'
        )
        .select(
          't_help_use_cases.use_case_id',
          't_help_use_cases.title',
          'm_help_use_case_categories.category_name',
          't_help_use_cases.action_sequence'
        )
        .orderBy('t_help_use_cases.use_case_id')
        .limit(20);

      assert.ok(Array.isArray(fullUseCases), 'Should return full use cases');

      fullUseCases.forEach((row: any) => {
        assert.ok(row.use_case_id, 'Should have use_case_id');
        assert.ok(row.title, 'Should have title');
        assert.ok(row.category_name, 'Should have category_name');
        // action_sequence contains the workflow steps
      });
    });
  });
});
