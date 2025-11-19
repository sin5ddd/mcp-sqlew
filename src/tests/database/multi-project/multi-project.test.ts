/**
 * Phase 7 Integration Tests - Multi-Project Support v3.7.0
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { initializeDatabase, closeDatabase } from '../../../database.js';
import type { DatabaseAdapter } from '../../../adapters/types.js';
import { ProjectContext } from '../../../utils/project-context.js';
import { setDecision, getContext, searchByLayer } from '../../../tools/context/index.js';
import { createTask, listTasks } from '../../../tools/tasks.js';
import { recordFileChange } from '../../../tools/files/index.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

let testDb: DatabaseAdapter;
let tempDir: string;
let tempDbPath: string;

beforeEach(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlew-test-'));
  tempDbPath = path.join(tempDir, 'test.db');
  testDb = await initializeDatabase({ connection: { filename: tempDbPath } });
});

afterEach(async () => {
  ProjectContext.reset();
  await closeDatabase();
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe('Multi-Project Data Isolation', () => {
  it('should isolate decisions between projects', async () => {
    const knex = testDb.getKnex();

    // Setup Project A
    const projectContextA = ProjectContext.getInstance();
    await projectContextA.ensureProject(knex, 'project-a', 'config');

    await setDecision({
      key: 'auth-method',
      value: 'OAuth2',
      layer: 'infrastructure',
      status: 'active'
    }, testDb);

    const decisionsA = await getContext({}, testDb);
    assert.strictEqual(decisionsA.decisions.length, 1);
    assert.strictEqual(decisionsA.decisions[0].value, 'OAuth2');

    // Reset and switch to Project B
    ProjectContext.reset();
    const projectContextB = ProjectContext.getInstance();
    await projectContextB.ensureProject(knex, 'project-b', 'config');

    await setDecision({
      key: 'auth-method',
      value: 'JWT',
      layer: 'infrastructure',
      status: 'active'
    }, testDb);

    const decisionsB = await getContext({}, testDb);
    assert.strictEqual(decisionsB.decisions.length, 1);
    assert.strictEqual(decisionsB.decisions[0].value, 'JWT');
  });

  it('should isolate tasks between projects', async () => {
    const knex = testDb.getKnex();

    // Project A
    const projectContextA = ProjectContext.getInstance();
    await projectContextA.ensureProject(knex, 'frontend', 'config');

    await createTask({
      title: 'Build login component',
      status: 'in_progress',
      priority: 3
    }, testDb);

    const tasksA = await listTasks({}, testDb);
    assert.strictEqual(tasksA.tasks.length, 1);

    // Project B
    ProjectContext.reset();
    const projectContextB = ProjectContext.getInstance();
    await projectContextB.ensureProject(knex, 'backend', 'config');

    await createTask({
      title: 'Design API schema',
      status: 'todo',
      priority: 4
    }, testDb);

    const tasksB = await listTasks({}, testDb);
    assert.strictEqual(tasksB.tasks.length, 1);
    assert.strictEqual(tasksB.tasks[0].title, 'Design API schema');
  });

  it('should isolate file changes between projects', async () => {
    const knex = testDb.getKnex();

    // Project A
    const projectContextA = ProjectContext.getInstance();
    await projectContextA.ensureProject(knex, 'web-app', 'config');

    await recordFileChange({
      file_path: 'src/index.ts',
      agent_name: 'developer-1',
      layer: 'infrastructure',
      change_type: 'modified',
      description: 'Updated imports'
    }, testDb);

    const changesA = await knex('t_file_changes')
      .where({ project_id: projectContextA.getProjectId() })
      .select('*');
    assert.strictEqual(changesA.length, 1);

    // Project B
    ProjectContext.reset();
    const projectContextB = ProjectContext.getInstance();
    await projectContextB.ensureProject(knex, 'api-server', 'config');

    await recordFileChange({
      file_path: 'src/index.ts',
      agent_name: 'developer-2',
      layer: 'business',
      change_type: 'created',
      description: 'Added endpoint'
    }, testDb);

    const changesB = await knex('t_file_changes')
      .where({ project_id: projectContextB.getProjectId() })
      .select('*');
    assert.strictEqual(changesB.length, 1);
  });
});

describe('Cross-Project Queries', () => {
  it('should query decisions from another project', async () => {
    const knex = testDb.getKnex();

    // Project A
    const projectContextA = ProjectContext.getInstance();
    await projectContextA.ensureProject(knex, 'legacy-app', 'config');

    await setDecision({
      key: 'database',
      value: 'PostgreSQL',
      layer: 'data',
      status: 'active'
    }, testDb);

    // Project B
    ProjectContext.reset();
    const projectContextB = ProjectContext.getInstance();
    await projectContextB.ensureProject(knex, 'new-app', 'config');

    await setDecision({
      key: 'database',
      value: 'MySQL',
      layer: 'data',
      status: 'active'
    }, testDb);

    // Query current project
    const currentDecisions = await getContext({}, testDb);
    assert.strictEqual(currentDecisions.decisions[0].value, 'MySQL');

    // Cross-project query
    const crossProjectDecisions = await getContext({
      _reference_project: 'legacy-app'
    }, testDb);

    assert.strictEqual(crossProjectDecisions.decisions.length, 1);
    assert.strictEqual(crossProjectDecisions.decisions[0].value, 'PostgreSQL');
  });

  it('should query by layer from another project', async () => {
    const knex = testDb.getKnex();

    // Project A
    const projectContextA = ProjectContext.getInstance();
    await projectContextA.ensureProject(knex, 'backend-v1', 'config');

    await setDecision({
      key: 'rest-framework',
      value: 'Express',
      layer: 'business',
      status: 'active'
    }, testDb);

    // Project B
    ProjectContext.reset();
    const projectContextB = ProjectContext.getInstance();
    await projectContextB.ensureProject(knex, 'backend-v2', 'config');

    await setDecision({
      key: 'rest-framework',
      value: 'Fastify',
      layer: 'business',
      status: 'active'
    }, testDb);

    // Current project query
    const currentBiz = await searchByLayer({ layer: 'business' }, testDb);
    assert.strictEqual(currentBiz.decisions[0].value, 'Fastify');

    // Cross-project query
    const crossBiz = await searchByLayer({
      layer: 'business',
      _reference_project: 'backend-v1'
    }, testDb);

    assert.strictEqual(crossBiz.decisions[0].value, 'Express');
  });

  it('should throw error for non-existent project', async () => {
    const knex = testDb.getKnex();
    const projectContext = ProjectContext.getInstance();
    await projectContext.ensureProject(knex, 'my-app', 'config');

    await assert.rejects(
      getContext({ _reference_project: 'non-existent' }, testDb),
      /Referenced project "non-existent" not found/
    );
  });
});

describe('Project Detection', () => {
  it('should create project with correct detection source', async () => {
    const knex = testDb.getKnex();

    const projectContext = ProjectContext.getInstance();
    await projectContext.ensureProject(knex, 'test-project', 'cli');

    const dbProject = await knex('m_projects')
      .where({ name: 'test-project' })
      .first();

    assert.ok(dbProject);
    assert.strictEqual(dbProject.detection_source, 'cli');
  });

  it('should reuse existing project', async () => {
    const knex = testDb.getKnex();

    const projectContext = ProjectContext.getInstance();
    await projectContext.ensureProject(knex, 'reusable', 'config');

    const id1 = projectContext.getProjectId();

    // Second call should return same ID
    const id2 = projectContext.getProjectId();
    assert.strictEqual(id1, id2);

    // Verify only one project in database
    const projects = await knex('m_projects')
      .where({ name: 'reusable' })
      .select('*');

    assert.strictEqual(projects.length, 1);
  });
});

describe('Migration Verification', () => {
  it('should have m_projects table with correct schema', async () => {
    const knex = testDb.getKnex();

    const hasTable = await knex.schema.hasTable('m_projects');
    assert.ok(hasTable);

    const hasId = await knex.schema.hasColumn('m_projects', 'id');
    const hasName = await knex.schema.hasColumn('m_projects', 'name');
    const hasDetectionSource = await knex.schema.hasColumn('m_projects', 'detection_source');

    assert.ok(hasId);
    assert.ok(hasName);
    assert.ok(hasDetectionSource);
  });

  it('should have project_id in transaction tables', async () => {
    const knex = testDb.getKnex();

    const tables = [
      't_decisions',
      't_file_changes',
      't_constraints',
      't_tasks'
    ];

    for (const table of tables) {
      const hasColumn = await knex.schema.hasColumn(table, 'project_id');
      assert.ok(hasColumn, `${table} should have project_id column`);
    }
  });
});
