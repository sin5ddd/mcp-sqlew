/**
 * Simple Suggest Tool Test - Debugging
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdirSync } from 'node:fs';
import { initializeDatabase, closeDatabase, getAdapter } from '../../database.js';
import { ProjectContext } from '../../utils/project-context.js';
import { setDecision } from '../../tools/context/actions/set.js';
import { handleSuggestAction } from '../../tools/suggest/index.js';

const TEST_DB_PATH = '.tmp-test/suggest-simple.db';

describe('Suggest Tool - Simple Test', () => {
  before(async () => {
    // Ensure test directory exists
    mkdirSync('.tmp-test', { recursive: true });

    // Initialize database
    const adapter = await initializeDatabase({
      databaseType: 'sqlite',
      connection: { filename: TEST_DB_PATH }
    });

    // Set up project context
    const knex = adapter.getKnex();
    const projectContext = ProjectContext.getInstance();
    await projectContext.ensureProject(knex, 'test-suggest-simple', 'config', {
      projectRootPath: process.cwd(),
    });

    // Insert test decision
    await setDecision({
      key: 'test/simple/decision1',
      value: 'Test decision 1',
      layer: 'business',
      tags: ['test', 'simple']
    });
  });

  after(async () => {
    await closeDatabase();
  });

  it('should call suggest by_key without error', async () => {
    console.log('Testing suggest by_key...');

    try {
      const result = await handleSuggestAction({
        action: 'by_key',
        key: 'test/simple/decision1',
        limit: 5
      });

      console.log('Suggest result:', JSON.stringify(result, null, 2));
      assert.ok(result, 'Should return result');
      assert.ok(result.suggestions !== undefined, 'Should have suggestions property');

    } catch (error) {
      console.error('Suggest error:', error);
      throw error;
    }
  });

  it('should call suggest check_duplicate without error', async () => {
    console.log('Testing suggest check_duplicate...');

    try {
      const result = await handleSuggestAction({
        action: 'check_duplicate',
        key: 'test/simple/decision1'
      });

      console.log('Duplicate check result:', JSON.stringify(result, null, 2));
      assert.ok(result, 'Should return result');
      assert.ok(result.is_duplicate !== undefined, 'Should have is_duplicate property');

    } catch (error) {
      console.error('Check duplicate error:', error);
      throw error;
    }
  });
});
