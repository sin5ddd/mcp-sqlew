/**
 * v4.0 Fresh Install Migration Test
 *
 * Tests that v4.0 migrations work correctly on a fresh database.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import knex, { Knex } from 'knex';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('v4.0 Fresh Install Migration', () => {
  let db: Knex;

  before(async () => {
    // Create in-memory SQLite database
    db = knex({
      client: 'better-sqlite3',
      connection: {
        filename: ':memory:',
      },
      useNullAsDefault: true,
      migrations: {
        directory: path.join(__dirname, '../../../database/migrations/v4'),
        extension: 'ts',
        loadExtensions: ['.ts'],
      },
    });

    // Run all migrations
    await db.migrate.latest();
  });

  after(async () => {
    if (db) {
      await db.destroy();
    }
  });

  describe('v4_ Table Creation', () => {
    it('should create v4_projects table', async () => {
      const hasTable = await db.schema.hasTable('v4_projects');
      assert.strictEqual(hasTable, true, 'v4_projects table should exist');
    });

    // v4_agents table removed in v4.0 - agent tracking no longer needed

    it('should create v4_decisions table', async () => {
      const hasTable = await db.schema.hasTable('v4_decisions');
      assert.strictEqual(hasTable, true, 'v4_decisions table should exist');
    });

    it('should create v4_tasks table', async () => {
      const hasTable = await db.schema.hasTable('v4_tasks');
      assert.strictEqual(hasTable, true, 'v4_tasks table should exist');
    });

    it('should create v4_constraints table', async () => {
      const hasTable = await db.schema.hasTable('v4_constraints');
      assert.strictEqual(hasTable, true, 'v4_constraints table should exist');
    });

    it('should create v4_file_changes table', async () => {
      const hasTable = await db.schema.hasTable('v4_file_changes');
      assert.strictEqual(hasTable, true, 'v4_file_changes table should exist');
    });

    it('should create v4_layers table', async () => {
      const hasTable = await db.schema.hasTable('v4_layers');
      assert.strictEqual(hasTable, true, 'v4_layers table should exist');
    });

    it('should create v4_tags table', async () => {
      const hasTable = await db.schema.hasTable('v4_tags');
      assert.strictEqual(hasTable, true, 'v4_tags table should exist');
    });

    it('should create v4_task_statuses table', async () => {
      const hasTable = await db.schema.hasTable('v4_task_statuses');
      assert.strictEqual(hasTable, true, 'v4_task_statuses table should exist');
    });

    it('should create v4_config table', async () => {
      const hasTable = await db.schema.hasTable('v4_config');
      assert.strictEqual(hasTable, true, 'v4_config table should exist');
    });
  });

  describe('v4_ Master Data Seeding', () => {
    it('should seed 9 layers', async () => {
      const layers = await db('v4_layers').select('*');
      assert.strictEqual(layers.length, 9, 'Should have 9 layers');

      const layerNames = layers.map((l: any) => l.name);
      assert.ok(layerNames.includes('presentation'), 'Should have presentation layer');
      assert.ok(layerNames.includes('business'), 'Should have business layer');
      assert.ok(layerNames.includes('data'), 'Should have data layer');
      assert.ok(layerNames.includes('infrastructure'), 'Should have infrastructure layer');
      assert.ok(layerNames.includes('cross-cutting'), 'Should have cross-cutting layer');
      assert.ok(layerNames.includes('documentation'), 'Should have documentation layer');
      assert.ok(layerNames.includes('planning'), 'Should have planning layer');
      assert.ok(layerNames.includes('coordination'), 'Should have coordination layer');
      assert.ok(layerNames.includes('review'), 'Should have review layer');
    });

    it('should seed 6 task statuses', async () => {
      const statuses = await db('v4_task_statuses').select('*');
      assert.strictEqual(statuses.length, 6, 'Should have 6 task statuses');

      const statusNames = statuses.map((s: any) => s.name);
      assert.ok(statusNames.includes('todo'), 'Should have todo status');
      assert.ok(statusNames.includes('in_progress'), 'Should have in_progress status');
      assert.ok(statusNames.includes('waiting_review'), 'Should have waiting_review status');
      assert.ok(statusNames.includes('blocked'), 'Should have blocked status');
      assert.ok(statusNames.includes('done'), 'Should have done status');
      assert.ok(statusNames.includes('archived'), 'Should have archived status');
    });

    it('should seed 5 constraint categories', async () => {
      const categories = await db('v4_constraint_categories').select('*');
      assert.strictEqual(categories.length, 5, 'Should have 5 constraint categories');
    });

    it('should seed default project', async () => {
      const projects = await db('v4_projects').where({ name: 'default' });
      assert.strictEqual(projects.length, 1, 'Should have default project');
      assert.strictEqual(projects[0].display_name, 'Default Project');
    });

    // System agent seed removed in v4.0 - agent tracking no longer needed

    it('should seed 8 common tags', async () => {
      const tags = await db('v4_tags').select('*');
      assert.strictEqual(tags.length, 8, 'Should have 8 tags');
    });

    it('should seed 4 config values', async () => {
      const config = await db('v4_config').select('*');
      assert.ok(config.length >= 4, 'Should have at least 4 config values');

      const schemaVersion = await db('v4_config').where({ config_key: 'schema_version' }).first();
      assert.strictEqual(schemaVersion?.config_value, '4.0.0', 'Schema version should be 4.0.0');
    });
  });

  describe('v4_ Index Creation', () => {
    it('should create indexes on v4_decisions', async () => {
      // Query SQLite sqlite_master for indexes
      const indexes = await db.raw(`
        SELECT name FROM sqlite_master
        WHERE type='index' AND tbl_name='v4_decisions' AND name LIKE 'idx_v4_%'
      `);
      assert.ok(indexes.length > 0, 'Should have indexes on v4_decisions');
    });

    it('should create indexes on v4_tasks', async () => {
      const indexes = await db.raw(`
        SELECT name FROM sqlite_master
        WHERE type='index' AND tbl_name='v4_tasks' AND name LIKE 'idx_v4_%'
      `);
      assert.ok(indexes.length > 0, 'Should have indexes on v4_tasks');
    });
  });

  describe('v4_ Foreign Key Constraints', () => {
    it('should enforce FK on v4_decisions.project_id', async () => {
      try {
        await db('v4_decisions').insert({
          project_id: 9999, // Non-existent project
          key_id: 1,
          value: 'test',
          version: '1.0.0',
          status: 'active',
          ts: Math.floor(Date.now() / 1000),
          layer_id: 1,
        });
        assert.fail('Should have thrown FK constraint error');
      } catch (error: any) {
        assert.ok(
          error.message.includes('FOREIGN KEY') || error.message.includes('foreign key'),
          `Should be FK error: ${error.message}`
        );
      }
    });

    it('should enforce FK on v4_tasks.project_id', async () => {
      try {
        await db('v4_tasks').insert({
          project_id: 9999, // Non-existent project
          title: 'Test Task',
          status_id: 1,
          created_ts: Math.floor(Date.now() / 1000),
          updated_ts: Math.floor(Date.now() / 1000),
        });
        assert.fail('Should have thrown FK constraint error');
      } catch (error: any) {
        assert.ok(
          error.message.includes('FOREIGN KEY') || error.message.includes('foreign key'),
          `Should be FK error: ${error.message}`
        );
      }
    });
  });

});
