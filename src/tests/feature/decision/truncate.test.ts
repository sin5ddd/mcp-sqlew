/**
 * Value Truncation Feature Tests
 *
 * Tests for the value truncation feature in decision list/search actions.
 * Default behavior: 30 chars with ellipsis; full_value=true returns complete text.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdirSync } from 'node:fs';
import { getAdapter, initializeDatabase, closeDatabase } from '../../../database.js';
import { ProjectContext } from '../../../utils/project-context.js';
import { truncateValue } from '../../../utils/text-truncate.js';

// Action imports
import { setDecision } from '../../../tools/context/index.js';
import { getContext } from '../../../tools/context/actions/list.js';
import { searchByTags } from '../../../tools/context/actions/search-tags.js';
import { searchByLayer } from '../../../tools/context/actions/search-layer.js';
import { searchAdvanced } from '../../../tools/context/actions/search-advanced.js';

const TEST_DB_PATH = '.tmp-test/decision-truncate.db';

describe('Value Truncation', () => {
  before(async () => {
    // Ensure test directory exists
    mkdirSync('.tmp-test', { recursive: true });

    // Initialize database with SQLite using test-specific database
    const adapter = await initializeDatabase({
      databaseType: 'sqlite',
      connection: { filename: TEST_DB_PATH }
    });

    // Set up project context (required after v3.7.0)
    const knex = adapter.getKnex();
    const projectContext = ProjectContext.getInstance();
    await projectContext.ensureProject(knex, 'test-truncate', 'config', {
      projectRootPath: process.cwd(),
    });
  });

  after(async () => {
    await closeDatabase();
  });

  describe('truncateValue utility', () => {
    it('should return original value if shorter than maxLength', () => {
      const result = truncateValue('short text', 30);
      assert.strictEqual(result, 'short text');
    });

    it('should truncate and add ellipsis if longer than maxLength', () => {
      const longText = 'This is a very long text that exceeds thirty characters';
      const result = truncateValue(longText, 30);
      // 30 chars: 'This is a very long text that ' (with trailing space)
      assert.strictEqual(result, 'This is a very long text that …');
      assert.strictEqual(result.length, 31); // 30 + 1 ellipsis
    });

    it('should handle empty string', () => {
      const result = truncateValue('', 30);
      assert.strictEqual(result, '');
    });

    it('should handle exactly maxLength chars', () => {
      const exactText = 'a'.repeat(30);
      const result = truncateValue(exactText, 30);
      assert.strictEqual(result, exactText);
      assert.strictEqual(result.length, 30);
    });
  });

  describe('list action', () => {
    it('should truncate values by default', async () => {
      const longValue = 'This is a very long decision value that should be truncated to 30 characters';
      const adapter = getAdapter();

      await setDecision({
        key: 'truncate/list-default',
        value: longValue,
        layer: 'business'
      });

      const result = await getContext({}, adapter);
      const decision = result.decisions.find(d => d.key === 'truncate/list-default');

      assert.ok(decision, 'Decision should exist');
      assert.strictEqual(decision.value, 'This is a very long decision v…');
    });

    it('should return full value when full_value=true', async () => {
      const longValue = 'This is a very long decision value that should NOT be truncated when full_value is true';
      const adapter = getAdapter();

      await setDecision({
        key: 'truncate/list-full',
        value: longValue,
        layer: 'business'
      });

      const result = await getContext({ full_value: true }, adapter);
      const decision = result.decisions.find(d => d.key === 'truncate/list-full');

      assert.ok(decision, 'Decision should exist');
      assert.strictEqual(decision.value, longValue);
    });

    it('should not add ellipsis for short values', async () => {
      const shortValue = 'Short value';
      const adapter = getAdapter();

      await setDecision({
        key: 'truncate/list-short',
        value: shortValue,
        layer: 'business'
      });

      const result = await getContext({}, adapter);
      const decision = result.decisions.find(d => d.key === 'truncate/list-short');

      assert.ok(decision, 'Decision should exist');
      assert.strictEqual(decision.value, shortValue);
    });
  });

  describe('search_tags action', () => {
    it('should truncate values by default', async () => {
      const longValue = 'This is another very long decision value for tag search testing purpose';
      const adapter = getAdapter();

      await setDecision({
        key: 'truncate/tags-default',
        value: longValue,
        layer: 'business',
        tags: ['truncate-test']
      });

      const result = await searchByTags({ tags: ['truncate-test'] }, adapter);
      const decision = result.decisions.find(d => d.key === 'truncate/tags-default');

      assert.ok(decision, 'Decision should exist');
      assert.strictEqual(decision.value, 'This is another very long deci…');
    });

    it('should return full value when full_value=true', async () => {
      const longValue = 'This is another very long decision value for tag search testing purpose';
      const adapter = getAdapter();

      await setDecision({
        key: 'truncate/tags-full',
        value: longValue,
        layer: 'business',
        tags: ['truncate-full-test']
      });

      const result = await searchByTags({ tags: ['truncate-full-test'], full_value: true }, adapter);
      const decision = result.decisions.find(d => d.key === 'truncate/tags-full');

      assert.ok(decision, 'Decision should exist');
      assert.strictEqual(decision.value, longValue);
    });
  });

  describe('search_layer action', () => {
    it('should truncate values by default', async () => {
      const longValue = 'Layer search test with a very long value that exceeds thirty characters limit';
      const adapter = getAdapter();

      await setDecision({
        key: 'truncate/layer-default',
        value: longValue,
        layer: 'data'
      });

      const result = await searchByLayer({ layer: 'data' }, adapter);
      const decision = result.decisions.find(d => d.key === 'truncate/layer-default');

      assert.ok(decision, 'Decision should exist');
      assert.strictEqual(decision.value, 'Layer search test with a very …');
    });

    it('should return full value when full_value=true', async () => {
      const longValue = 'Layer search test with a very long value that exceeds thirty characters limit';
      const adapter = getAdapter();

      await setDecision({
        key: 'truncate/layer-full',
        value: longValue,
        layer: 'infrastructure'
      });

      const result = await searchByLayer({ layer: 'infrastructure', full_value: true }, adapter);
      const decision = result.decisions.find(d => d.key === 'truncate/layer-full');

      assert.ok(decision, 'Decision should exist');
      assert.strictEqual(decision.value, longValue);
    });
  });

  describe('search_advanced action', () => {
    it('should truncate values by default', async () => {
      const longValue = 'Advanced search test with a very long value exceeding thirty characters limit here';
      const adapter = getAdapter();

      await setDecision({
        key: 'truncate/advanced-default',
        value: longValue,
        layer: 'cross-cutting',
        tags: ['advanced-truncate']
      });

      const result = await searchAdvanced({ tags_any: ['advanced-truncate'] }, adapter);
      const decision = result.decisions.find(d => d.key === 'truncate/advanced-default');

      assert.ok(decision, 'Decision should exist');
      assert.strictEqual(decision.value, 'Advanced search test with a ve…');
    });

    it('should return full value when full_value=true', async () => {
      const longValue = 'Advanced search test with a very long value exceeding thirty characters limit here';
      const adapter = getAdapter();

      await setDecision({
        key: 'truncate/advanced-full',
        value: longValue,
        layer: 'presentation',
        tags: ['advanced-full-truncate']
      });

      const result = await searchAdvanced({ tags_any: ['advanced-full-truncate'], full_value: true }, adapter);
      const decision = result.decisions.find(d => d.key === 'truncate/advanced-full');

      assert.ok(decision, 'Decision should exist');
      assert.strictEqual(decision.value, longValue);
    });
  });
});
