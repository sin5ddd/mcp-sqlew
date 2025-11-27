/**
 * v4.0 Data Migration from v3.x Test (SQLite only)
 *
 * このテストでは、20251126000001_v4_migrate_data.ts の振る舞いを
 * - v3 テーブルなし(新規インストール)のスキップ挙動
 * - 代表的な v3 スキーマ + v4 スキーマ上でのデータコピー
 * - t_decisions の project_id 有無による分岐
 * - 冪等性 (up を2回実行しても行数が増えない)
 * - down() によるトランザクションテーブルのみ削除
 * を中心に検証する。
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import knex, { Knex } from 'knex';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import { up as migrateV4Data, down as rollbackV4Data } from '../../../database/migrations/v4/20251126000001_v4_migrate_data.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// シンプルな v4 スキーマ (必要なテーブルのみ) を定義
// Note: Agent tracking removed in v4.0 - no v4_agents table or agent_id columns
async function createV4Schema(db: Knex) {
  await db.schema.createTable('v4_projects', table => {
    table.integer('id').primary();
    table.string('name');
    table.string('display_name').nullable();
    table.string('detection_source').nullable();
    table.string('project_root_path').nullable();
    table.integer('created_ts').nullable();
    table.integer('last_active_ts').nullable();
    table.text('metadata').nullable();
  });

  await db.schema.createTable('v4_context_keys', table => {
    table.integer('id').primary();
    table.string('key_name');
  });

  await db.schema.createTable('v4_files', table => {
    table.integer('id').primary();
    table.integer('project_id');
    table.string('path');
  });

  // Note: v4_config removed in v4.0 - config is now in-memory

  await db.schema.createTable('v4_decisions', table => {
    table.string('key_id');
    table.integer('project_id');
    table.text('value');
    table.integer('layer_id').nullable();
    table.integer('version').nullable();
    table.string('status').nullable();
    table.integer('ts').nullable();
  });

  await db.schema.createTable('v4_decision_history', table => {
    table.increments('id').primary();
    table.string('key_id');
    table.integer('project_id');
    table.integer('version');
    table.text('value');
    table.integer('ts').nullable();
  });

  await db.schema.createTable('v4_tasks', table => {
    table.integer('id').primary();
    table.string('title');
    table.integer('project_id');
    table.integer('status_id');
    table.integer('priority').nullable();
    table.integer('layer_id').nullable();
    table.integer('created_ts').nullable();
    table.integer('updated_ts').nullable();
    table.integer('completed_ts').nullable();
  });
}

// 必要な v3 スキーマ (サブセット) を定義
async function createV3SchemaMinimal(db: Knex) {
  await db.schema.createTable('m_agents', table => {
    table.integer('id').primary();
    table.string('name');
    table.integer('last_active_ts').nullable();
  });

  await db.schema.createTable('m_projects', table => {
    table.integer('id').primary();
    table.string('name');
  });

  await db.schema.createTable('m_context_keys', table => {
    table.integer('id').primary();
    table.string('key');
  });

  await db.schema.createTable('m_files', table => {
    table.integer('id').primary();
    table.integer('project_id');
    table.string('path');
  });

  await db.schema.createTable('m_config', table => {
    table.string('key').primary();
    table.text('value').nullable();
  });

  // project_id を持たない古い t_decisions
  await db.schema.createTable('t_decisions', table => {
    table.string('key_id');
    table.text('value');
    table.integer('agent_id').nullable();
    table.integer('layer_id').nullable();
    table.integer('version').nullable();
    table.string('status').nullable();
    table.integer('ts').nullable();
  });

  await db.schema.createTable('t_decision_history', table => {
    table.increments('id').primary();
    table.string('key_id');
    table.integer('project_id').nullable();
    table.integer('version').nullable();
    table.text('value');
    table.integer('agent_id').nullable();
    table.integer('ts').nullable();
  });

  await db.schema.createTable('t_tasks', table => {
    table.integer('id').primary();
    table.string('title');
    table.integer('project_id');
    table.integer('status_id');
    table.integer('priority').nullable();
    table.integer('assigned_agent_id').nullable();
    table.integer('created_by_agent_id').nullable();
    table.integer('layer_id').nullable();
    table.integer('created_ts').nullable();
    table.integer('updated_ts').nullable();
    table.integer('completed_ts').nullable();
  });
}

// project_id を持つ新しい t_decisions を含んだ v3 スキーマサブセット
async function createV3SchemaWithProjectId(db: Knex) {
  await createV3SchemaMinimal(db);

  // t_decisions を作り直すことは難しいので、別 DB 用ユーティリティで使用する前提
}

describe('v4.0 Data Migration from v3.x', () => {
  let db: Knex;

  before(async () => {
    db = knex({
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    });
  });

  after(async () => {
    if (db) {
      await db.destroy();
    }
  });

  describe('fresh install behavior', () => {
    beforeEach(async () => {
      // すべてのテーブルをドロップ
      const tables = await db.raw("SELECT name FROM sqlite_master WHERE type='table'");
      for (const row of tables as any) {
        if (row.name.startsWith('sqlite_')) continue;
        await db.schema.dropTableIfExists(row.name);
      }
      // v4 スキーマのみ用意 (v3 テーブルなし)
      await createV4Schema(db);
    });

    it('should skip data migration when no v3 tables exist', async () => {
      // Note: v4_agents removed in v4.0 - check v4_projects instead
      const projectsBefore = await db('v4_projects').count<{ count: number }[]>('* as count');
      assert.strictEqual(Number(projectsBefore[0].count), 0);

      await migrateV4Data(db as any);

      const projectsAfter = await db('v4_projects').count<{ count: number }[]>('* as count');
      assert.strictEqual(Number(projectsAfter[0].count), 0, 'v4_projects should remain empty');
    });
  });

  describe('minimal v3 schema → v4 migration', () => {
    beforeEach(async () => {
      // すべてのテーブルをドロップ
      const tables = await db.raw("SELECT name FROM sqlite_master WHERE type='table'");
      for (const row of tables as any) {
        if (row.name.startsWith('sqlite_')) continue;
        await db.schema.dropTableIfExists(row.name);
      }

      await createV3SchemaMinimal(db);
      await createV4Schema(db);

      // v3 側にサンプルデータを投入
      await db('m_agents').insert([
        { id: 1, name: 'agent-1', last_active_ts: 100 },
        { id: 2, name: 'agent-2', last_active_ts: 200 },
      ]);

      await db('m_projects').insert([
        { id: 1, name: 'proj-1' },
      ]);

      await db('m_context_keys').insert([
        { id: 1, key: 'ctx-1' },
        { id: 2, key: 'ctx-2' },
      ]);

      await db('m_files').insert([
        { id: 1, project_id: 1, path: '/path/a' },
        { id: 2, project_id: 1, path: '/path/b' },
      ]);

      await db('m_config').insert([
        { key: 'schema_version', value: '3.0.0' },
        { key: 'other', value: 'x' },
      ]);

      await db('t_decisions').insert([
        { key_id: 'k1', value: 'v1', agent_id: 1, layer_id: 1, version: 1, status: 'open', ts: 111 },
        { key_id: 'k2', value: 'v2', agent_id: 2, layer_id: 1, version: 1, status: 'closed', ts: 222 },
      ]);

      await db('t_decision_history').insert([
        { key_id: 'k1', project_id: 1, version: 1, value: 'h1', agent_id: 1, ts: 333 },
      ]);

      await db('t_tasks').insert([
        { id: 1, title: 'task-1', project_id: 1, status_id: 1 },
      ]);
    });

    it('should migrate master and transaction data correctly', async () => {
      await migrateV4Data(db as any);

      // Note: v4_agents removed in v4.0 - m_agents data is NOT migrated

      const v4Projects = await db('v4_projects');
      assert.strictEqual(v4Projects.length, 1);
      assert.strictEqual(v4Projects[0].id, 1);
      assert.strictEqual(v4Projects[0].name, 'proj-1');

      const v4ContextKeys = await db('v4_context_keys').orderBy('id');
      assert.strictEqual(v4ContextKeys.length, 2);
      assert.deepStrictEqual(v4ContextKeys.map((r: any) => r.key_name), ['ctx-1', 'ctx-2']);

      const v4Files = await db('v4_files').orderBy('id');
      assert.strictEqual(v4Files.length, 2);
      assert.strictEqual(v4Files[0].path, '/path/a');

      // Note: v4_config removed in v4.0 - config is now in-memory

      const v4Decisions = await db('v4_decisions').orderBy('key_id');
      assert.strictEqual(v4Decisions.length, 2);
      // project_id を持たない t_decisions だったので、すべて project_id = 1 のはず
      assert.deepStrictEqual(v4Decisions.map((d: any) => d.project_id), [1, 1]);

      const v4History = await db('v4_decision_history');
      assert.strictEqual(v4History.length, 1);
      assert.strictEqual(v4History[0].key_id, 'k1');

      const v4Tasks = await db('v4_tasks');
      assert.strictEqual(v4Tasks.length, 1);
      assert.strictEqual(v4Tasks[0].title, 'task-1');
    });

    it('should be idempotent when running up() twice', async () => {
      // Note: v4_agents removed in v4.0
      await migrateV4Data(db as any);
      const counts1 = {
        projects: await db('v4_projects').count<{ count: number }[]>('* as count'),
        decisions: await db('v4_decisions').count<{ count: number }[]>('* as count'),
      };

      await migrateV4Data(db as any);

      const counts2 = {
        projects: await db('v4_projects').count<{ count: number }[]>('* as count'),
        decisions: await db('v4_decisions').count<{ count: number }[]>('* as count'),
      };

      assert.strictEqual(Number(counts1.projects[0].count), Number(counts2.projects[0].count));
      assert.strictEqual(Number(counts1.decisions[0].count), Number(counts2.decisions[0].count));
    });

    it('down() should clear only transaction tables', async () => {
      await migrateV4Data(db as any);

      const beforeDecisions = await db('v4_decisions').count<{ count: number }[]>('* as count');
      assert.ok(Number(beforeDecisions[0].count) > 0);

      await rollbackV4Data(db as any);

      const afterDecisions = await db('v4_decisions').count<{ count: number }[]>('* as count');
      assert.strictEqual(Number(afterDecisions[0].count), 0);

      // マスタテーブルは残っている (v4_agents removed in v4.0 - check v4_projects instead)
      const projects = await db('v4_projects').count<{ count: number }[]>('* as count');
      assert.ok(Number(projects[0].count) > 0);
    });
  });
});
