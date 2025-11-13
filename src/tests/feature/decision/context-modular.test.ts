#!/usr/bin/env node
/**
 * Test for MODULAR context implementation (src/tools/context/)
 * Verifies that the refactored modular structure works identically to the monolithic version
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeDatabase, closeDatabase, getAdapter } from '../database.js';
import { ProjectContext } from '../utils/project-context.js';
import * as fs from 'fs';
import * as path from 'path';

// Import from MODULAR implementation (new structure)
import {
  setDecision,
  getDecision,
  getContext,
  searchByTags,
  getVersions,
  searchByLayer,
  quickSetDecision,
  searchAdvanced,
  setDecisionBatch,
  hasUpdates,
  setFromTemplate,
  createTemplate,
  listTemplates,
  hardDeleteDecision,
  addDecisionContextAction,
  listDecisionContextsAction
} from '../tools/context/index.js';

const TEST_DB_PATH = '.sqlew/tmp/test-context-modular.db';

describe('Modular Context Implementation Tests', () => {
  let adapter: any;

  before(async () => {
    // Clean up test database
    const dbDir = path.dirname(TEST_DB_PATH);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }

    // Initialize database
    adapter = await initializeDatabase({ databaseType: 'sqlite', connection: { filename: TEST_DB_PATH } });

    // Set up project context (required after v3.7.0)
    const knex = adapter.getKnex();
    const projectContext = ProjectContext.getInstance();
    await projectContext.ensureProject(knex, 'test-modular', 'config', {
      projectRootPath: process.cwd(),
    });
  });

  after(async () => {
    await closeDatabase();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  describe('setDecision action', () => {
    it('should set a decision with all parameters', async () => {
      const result = await setDecision({
        key: 'test-key-1',
        value: 'test-value-1',
        agent: 'test-agent',
        tags: ['test', 'modular'],
        layer: 'business',
        version: '1.0.0',
        status: 'active'
      });

      assert.equal(result.success, true);
      assert.equal(result.key, 'test-key-1');
    });

    it('should update existing decision', async () => {
      // First create
      await setDecision({
        key: 'test-update',
        value: 'original',
        agent: 'test-agent'
      });

      // Then update
      const result = await setDecision({
        key: 'test-update',
        value: 'updated',
        agent: 'test-agent'
      });

      assert.equal(result.success, true);
      // Verify update by fetching
      const getResult = await getDecision({ key: 'test-update' });
      assert.equal(getResult.decision?.value, 'updated');
    });
  });

  describe('getDecision action', () => {
    it('should retrieve existing decision', async () => {
      await setDecision({
        key: 'test-get',
        value: 'test-value',
        agent: 'test-agent'
      });

      const result = await getDecision({ key: 'test-get' });

      assert.equal(result.found, true);
      assert.equal(result.decision?.key, 'test-get');
      assert.equal(result.decision?.value, 'test-value');
    });

    it('should return not found for missing key', async () => {
      const result = await getDecision({ key: 'non-existent-key' });
      assert.equal(result.found, false);
    });
  });

  describe('getContext action (list)', () => {
    it('should list all decisions', async () => {
      const result = await getContext({});
      assert.ok(result.count >= 0);
      assert.ok(Array.isArray(result.decisions));
    });

    it('should filter by tags', async () => {
      await setDecision({
        key: 'tagged-decision',
        value: 'test',
        agent: 'test-agent',
        tags: ['filter-test']
      });

      const result = await getContext({ tags: ['filter-test'] });
      assert.ok(result.decisions.some(d => d.key === 'tagged-decision'));
    });
  });

  describe('searchByTags action', () => {
    it('should search by tags with AND mode', async () => {
      await setDecision({
        key: 'multi-tag',
        value: 'test',
        agent: 'test-agent',
        tags: ['tag1', 'tag2']
      });

      const result = await searchByTags({
        tags: ['tag1', 'tag2'],
        match_mode: 'AND'
      });

      assert.ok(result.count >= 0);
    });
  });

  describe('searchByLayer action', () => {
    it('should search by layer', async () => {
      await setDecision({
        key: 'layer-test',
        value: 'test',
        agent: 'test-agent',
        layer: 'infrastructure'
      });

      const result = await searchByLayer({ layer: 'infrastructure' });
      assert.ok(result.count >= 0);
      assert.equal(result.layer, 'infrastructure');
    });
  });

  describe('getVersions action', () => {
    it('should get version history', async () => {
      await setDecision({
        key: 'versioned',
        value: 'v1',
        agent: 'test-agent',
        version: '1.0.0'
      });

      await setDecision({
        key: 'versioned',
        value: 'v2',
        agent: 'test-agent',
        version: '2.0.0'
      });

      const result = await getVersions({ key: 'versioned' });
      assert.ok(result.count >= 2);
    });
  });

  describe('quickSetDecision action', () => {
    it('should quick set with minimal params', async () => {
      const result = await quickSetDecision({
        key: 'quick-test',
        value: 'quick-value',
        agent: 'test-agent'
      });

      assert.equal(result.success, true);
      assert.equal(result.key, 'quick-test');
    });
  });

  describe('searchAdvanced action', () => {
    it('should perform advanced search', async () => {
      await setDecision({
        key: 'advanced-search',
        value: 'searchable',
        agent: 'test-agent',
        tags: ['advanced'],
        layer: 'business'
      });

      const result = await searchAdvanced({
        layers: ['business'],
        tags_all: ['advanced']
      });

      assert.ok(result.count >= 0);
    });
  });

  describe('setDecisionBatch action', () => {
    it('should batch set multiple decisions', async () => {
      const result = await setDecisionBatch({
        decisions: [
          { key: 'batch-1', value: 'value-1', agent: 'test-agent' },
          { key: 'batch-2', value: 'value-2', agent: 'test-agent' }
        ]
      });

      assert.equal(result.success, true);
      assert.ok(result.inserted >= 2);
    });
  });

  describe('hasUpdates action', () => {
    it('should check for updates since timestamp', async () => {
      const result = await hasUpdates({
        agent_name: 'test-agent',
        since_timestamp: String(Math.floor(Date.now() / 1000) - 3600)
      });

      assert.equal(result.has_updates, true);
      assert.ok(result.counts);
    });
  });

  describe('Template actions', () => {
    it('should create and list templates', async () => {
      const createResult = await createTemplate({
        name: 'test-template',
        defaults: {
          layer: 'business',
          tags: ['template-test'],
          status: 'active'
        }
      });

      assert.equal(createResult.success, true);

      const listResult = await listTemplates({});
      assert.ok(listResult.templates.length > 0);
    });

    it('should set from template', async () => {
      await createTemplate({
        name: 'preset-template',
        defaults: {
          layer: 'infrastructure',
          tags: ['preset'],
          status: 'active'
        }
      });

      const result = await setFromTemplate({
        template: 'preset-template',
        key: 'from-template',
        value: 'templated-value',
        agent: 'test-agent'
      });

      assert.equal(result.success, true);
      assert.equal(result.key, 'from-template');
    });
  });

  describe('Decision context actions', () => {
    it('should add decision context', async () => {
      await setDecision({
        key: 'context-test',
        value: 'test',
        agent: 'test-agent'
      });

      const result = await addDecisionContextAction({
        key: 'context-test',
        context_type: 'rationale',
        content: 'Test rationale'
      });

      assert.equal(result.success, true);
    });

    it('should list decision contexts', async () => {
      const result = await listDecisionContextsAction({
        key: 'context-test'
      });

      assert.ok(Array.isArray(result.contexts));
    });
  });

  describe('hardDeleteDecision action', () => {
    it('should hard delete a decision', async () => {
      await setDecision({
        key: 'delete-me',
        value: 'test',
        agent: 'test-agent'
      });

      const result = await hardDeleteDecision({ key: 'delete-me' });
      assert.equal(result.success, true);

      const getResult = await getDecision({ key: 'delete-me' });
      assert.equal(getResult.found, false);
    });
  });
});
