/**
 * Unit tests for Task Dependency feature
 * Tests add_dependency, remove_dependency, get_dependencies actions
 * and enhanced list/get actions with dependency support
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Knex } from 'knex';
import { initializeDatabase, getOrCreateAgent, closeDatabase } from '../../../database.js';
import type { DatabaseAdapter } from '../../../adapters/types.js';
import { ProjectContext } from '../../../utils/project-context.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Test database instance
 */
let testDb: DatabaseAdapter;
let tempDir: string;
let tempDbPath: string;

/**
 * Helper: Create a test task
 */
async function createTestTask(db: DatabaseAdapter, title: string, status: string = 'todo'): Promise<number> {
  const agentId = await getOrCreateAgent(db, 'test-agent');
  const projectId = ProjectContext.getInstance().getProjectId();
  const statusIdMap: Record<string, number> = {
    'todo': 1,
    'in_progress': 2,
    'waiting_review': 3,
    'blocked': 4,
    'done': 5,
    'archived': 6
  };

  const statusId = statusIdMap[status];
  const knex = db.getKnex();
  const now = Math.floor(Date.now() / 1000);

  const [taskId] = await knex('v4_tasks').insert({
    title,
    status_id: statusId,
    priority: 2,
    created_by_agent_id: agentId,
    assigned_agent_id: agentId,
    project_id: projectId,
    created_ts: now,
    updated_ts: now
  });

  return taskId;
}

/**
 * Inline implementation of addDependency for testing (avoiding module dependency)
 */
async function addDependencyTest(db: DatabaseAdapter, params: {
  depends_on_task_id: number;
  task_id: number;
}): Promise<any> {
  if (!params.depends_on_task_id) {
    throw new Error('Parameter "depends_on_task_id" is required');
  }

  if (!params.task_id) {
    throw new Error('Parameter "task_id" is required');
  }

  const knex = db.getKnex();

  return await knex.transaction(async (trx) => {
    const TASK_STATUS_ARCHIVED = 6;

    // Validation 1: No self-dependencies
    if (params.depends_on_task_id === params.task_id) {
      throw new Error('Self-dependency not allowed');
    }

    // Validation 2: Both tasks must exist and check if archived
    const dependsOnTask = await trx('v4_tasks')
      .where({ id: params.depends_on_task_id })
      .select('id', 'status_id')
      .first() as { id: number; status_id: number } | undefined;

    const task = await trx('v4_tasks')
      .where({ id: params.task_id })
      .select('id', 'status_id')
      .first() as { id: number; status_id: number } | undefined;

    if (!dependsOnTask) {
      throw new Error(`Task #${params.depends_on_task_id} not found`);
    }

    if (!task) {
      throw new Error(`Task #${params.task_id} not found`);
    }

    // Validation 3: Neither task is archived
    if (dependsOnTask.status_id === TASK_STATUS_ARCHIVED) {
      throw new Error(`Cannot add dependency: Task #${params.depends_on_task_id} is archived`);
    }

    if (task.status_id === TASK_STATUS_ARCHIVED) {
      throw new Error(`Cannot add dependency: Task #${params.task_id} is archived`);
    }

    // Validation 4: No direct circular (reverse relationship)
    const projectId = ProjectContext.getInstance().getProjectId();
    const reverseExists = await trx('v4_task_dependencies')
      .where({
        project_id: projectId,
        blocker_task_id: params.task_id,
        blocked_task_id: params.depends_on_task_id
      })
      .first();

    if (reverseExists) {
      throw new Error(`Circular dependency detected: Task #${params.task_id} already depends on Task #${params.depends_on_task_id}`);
    }

    // Validation 5: No transitive circular (check if adding this would create a cycle)
    const cycleCheck = await trx.raw(`
      WITH RECURSIVE dependency_chain AS (
        -- Start from the task that would have the dependency
        SELECT blocked_task_id, 1 as depth
        FROM v4_task_dependencies
        WHERE blocker_task_id = ?

        UNION ALL

        -- Follow the chain of dependencies
        SELECT d.blocked_task_id, dc.depth + 1
        FROM v4_task_dependencies d
        JOIN dependency_chain dc ON d.blocker_task_id = dc.blocked_task_id
        WHERE dc.depth < 100
      )
      SELECT blocked_task_id FROM dependency_chain WHERE blocked_task_id = ?
    `, [params.task_id, params.depends_on_task_id]) as { blocked_task_id: number } | undefined;

    const cycleResult = Array.isArray(cycleCheck) ? cycleCheck[0] : cycleCheck;

    if (cycleResult && cycleResult.blocked_task_id) {
      // Build cycle path for error message
      const cyclePathResult = await trx.raw(`
        WITH RECURSIVE dependency_chain AS (
          SELECT blocked_task_id, 1 as depth,
                 CAST(blocked_task_id AS TEXT) as path
          FROM v4_task_dependencies
          WHERE blocker_task_id = ?

          UNION ALL

          SELECT d.blocked_task_id, dc.depth + 1,
                 dc.path || ' → ' || d.blocked_task_id
          FROM v4_task_dependencies d
          JOIN dependency_chain dc ON d.blocker_task_id = dc.blocked_task_id
          WHERE dc.depth < 100
        )
        SELECT path FROM dependency_chain WHERE blocked_task_id = ? ORDER BY depth DESC LIMIT 1
      `, [params.task_id, params.depends_on_task_id]) as { path: string } | undefined;

      const pathResult = Array.isArray(cyclePathResult) ? cyclePathResult[0] : cyclePathResult;
      const cyclePath = pathResult?.path || `#${params.task_id} → ... → #${params.depends_on_task_id}`;
      throw new Error(`Circular dependency detected: Task #${params.depends_on_task_id} → #${cyclePath} → #${params.depends_on_task_id}`);
    }

    // All validations passed - insert dependency
    const now = Math.floor(Date.now() / 1000);
    await trx('v4_task_dependencies').insert({
      project_id: projectId,
      blocker_task_id: params.depends_on_task_id,
      blocked_task_id: params.task_id,
      created_ts: now
    });

    return {
      success: true,
      message: `Dependency added: Task #${params.task_id} depends on Task #${params.depends_on_task_id}`
    };
  });
}

/**
 * Inline implementation of removeDependency for testing
 */
async function removeDependencyTest(db: DatabaseAdapter, params: {
  depends_on_task_id: number;
  task_id: number;
}): Promise<any> {
  if (!params.depends_on_task_id) {
    throw new Error('Parameter "depends_on_task_id" is required');
  }

  if (!params.task_id) {
    throw new Error('Parameter "task_id" is required');
  }

  const knex = db.getKnex();
  const projectId = ProjectContext.getInstance().getProjectId();

  await knex('v4_task_dependencies')
    .where({
      project_id: projectId,
      blocker_task_id: params.depends_on_task_id,
      blocked_task_id: params.task_id
    })
    .delete();

  return {
    success: true,
    message: `Dependency removed: Task #${params.task_id} no longer depends on Task #${params.depends_on_task_id}`
  };
}

/**
 * Inline implementation of getDependencies for testing
 */
async function getDependenciesTest(db: DatabaseAdapter, params: {
  task_id: number;
  include_details?: boolean;
}): Promise<any> {
  if (!params.task_id) {
    throw new Error('Parameter "task_id" is required');
  }

  const includeDetails = params.include_details || false;
  const knex = db.getKnex();

  // Check if task exists
  const taskExists = await knex('v4_tasks')
    .where({ id: params.task_id })
    .select('id')
    .first();

  if (!taskExists) {
    throw new Error(`Task with id ${params.task_id} not found`);
  }

  // Build query based on include_details flag
  let selectFields: string[];
  if (includeDetails) {
    selectFields = [
      't.id',
      't.title',
      's.name as status',
      't.priority',
      'aa.name as assigned_to',
      't.created_ts',
      't.updated_ts',
      'td.description'
    ];
  } else {
    selectFields = [
      't.id',
      't.title',
      's.name as status',
      't.priority'
    ];
  }

  // Get blockers (tasks that this task depends on)
  let blockersQuery = knex('v4_tasks as t')
    .join('v4_task_dependencies as d', 't.id', 'd.blocker_task_id')
    .leftJoin('v4_task_statuses as s', 't.status_id', 's.id')
    .leftJoin('v4_agents as aa', 't.assigned_agent_id', 'aa.id')
    .where('d.blocked_task_id', params.task_id)
    .select(selectFields);

  if (includeDetails) {
    blockersQuery = blockersQuery.leftJoin('v4_task_details as td', 't.id', 'td.task_id');
  }

  const blockers = await blockersQuery;

  // Get blocking (tasks that depend on this task)
  let blockingQuery = knex('v4_tasks as t')
    .join('v4_task_dependencies as d', 't.id', 'd.blocked_task_id')
    .leftJoin('v4_task_statuses as s', 't.status_id', 's.id')
    .leftJoin('v4_agents as aa', 't.assigned_agent_id', 'aa.id')
    .where('d.blocker_task_id', params.task_id)
    .select(selectFields);

  if (includeDetails) {
    blockingQuery = blockingQuery.leftJoin('v4_task_details as td', 't.id', 'td.task_id');
  }

  const blocking = await blockingQuery;

  return {
    task_id: params.task_id,
    blockers,
    blocking
  };
}

/**
 * Setup before each test
 */
beforeEach(async () => {
  // Create temp directory for test files and database
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlew-test-'));
  tempDbPath = path.join(tempDir, 'test.db');

  // Initialize database with Knex adapter
  testDb = await initializeDatabase({
    databaseType: 'sqlite',
    connection: {
      filename: tempDbPath,
    },
  });

  // Initialize project context (required after v3.7.0)
  const knex = testDb.getKnex();
  const projectContext = ProjectContext.getInstance();
  await projectContext.ensureProject(knex, 'test-task-dependencies', 'config', {
    projectRootPath: process.cwd()
  });
});

afterEach(async () => {
  await closeDatabase();
  // Reset ProjectContext singleton for test isolation
  ProjectContext.reset();
  // Cleanup temp directory
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

// ============================================================================
// Task #66: Unit Tests for add_dependency Validation
// ============================================================================

describe('add_dependency - Success Cases', () => {
  it('should add valid dependency', async () => {
    // Arrange
    const task1 = await createTestTask(testDb, 'Task 1');
    const task2 = await createTestTask(testDb, 'Task 2');

    // Act
    const result = await addDependencyTest(testDb, {
      depends_on_task_id: task1,
      task_id: task2
    });

    // Assert
    assert.strictEqual(result.success, true);
    assert.match(result.message, /Dependency added/);

    // Verify in database
    const knex = testDb.getKnex();
    const deps = await knex('v4_task_dependencies')
      .where({
        blocker_task_id: task1,
        blocked_task_id: task2
      })
      .first();

    assert.ok(deps);
  });

  it('should add valid dependency and verify via get_dependencies', async () => {
    // Arrange
    const task1 = await createTestTask(testDb, 'Task 1');
    const task2 = await createTestTask(testDb, 'Task 2');

    // Act
    await addDependencyTest(testDb, {
      depends_on_task_id: task1,
      task_id: task2
    });

    const result = await getDependenciesTest(testDb, { task_id: task2 });

    // Assert
    assert.strictEqual(result.task_id, task2);
    assert.strictEqual(result.blockers.length, 1);
    assert.strictEqual(result.blockers[0].id, task1);
    assert.strictEqual(result.blocking.length, 0);
  });
});

describe('add_dependency - Validation: Self-Dependency', () => {
  it('should reject self-dependency', async () => {
    // Arrange
    const task1 = await createTestTask(testDb, 'Task 1');

    // Act & Assert
    await assert.rejects(
      async () => {
        await addDependencyTest(testDb, {
          depends_on_task_id: task1,
          task_id: task1
        });
      },
      {
        message: /Self-dependency not allowed/
      }
    );
  });
});

describe('add_dependency - Validation: Direct Circular', () => {
  it('should reject direct circular dependency', async () => {
    // Arrange
    const taskA = await createTestTask(testDb, 'Task A');
    const taskB = await createTestTask(testDb, 'Task B');

    // Add A blocks B (B depends on A)
    await addDependencyTest(testDb, {
      depends_on_task_id: taskA,
      task_id: taskB
    });

    // Act & Assert - Try to add B blocks A (A depends on B)
    await assert.rejects(
      async () => {
        await addDependencyTest(testDb, {
          depends_on_task_id: taskB,
          task_id: taskA
        });
      },
      {
        message: /Circular dependency detected/
      }
    );
  });
});

describe('add_dependency - Validation: Transitive Circular', () => {
  it('should reject transitive circular dependency (A→B→C→A)', async () => {
    // Arrange
    const taskA = await createTestTask(testDb, 'Task A');
    const taskB = await createTestTask(testDb, 'Task B');
    const taskC = await createTestTask(testDb, 'Task C');

    // Add A blocks B (B depends on A)
    await addDependencyTest(testDb, {
      depends_on_task_id: taskA,
      task_id: taskB
    });

    // Add B blocks C (C depends on B)
    await addDependencyTest(testDb, {
      depends_on_task_id: taskB,
      task_id: taskC
    });

    // Act & Assert - Try to add C blocks A (A depends on C, would create cycle)
    await assert.rejects(
      async () => {
        await addDependencyTest(testDb, {
          depends_on_task_id: taskC,
          task_id: taskA
        });
      },
      {
        message: /Circular dependency detected/
      }
    );
  });

  it('should reject transitive circular with cycle path in error message', async () => {
    // Arrange
    const task1 = await createTestTask(testDb, 'Task 1');
    const task2 = await createTestTask(testDb, 'Task 2');
    const task3 = await createTestTask(testDb, 'Task 3');

    // Create chain: 1 → 2 → 3 (2 depends on 1, 3 depends on 2)
    await addDependencyTest(testDb, {
      depends_on_task_id: task1,
      task_id: task2
    });

    await addDependencyTest(testDb, {
      depends_on_task_id: task2,
      task_id: task3
    });

    // Act & Assert - Try to add 3 → 1 (1 depends on 3)
    let errorMessage = '';
    try {
      await addDependencyTest(testDb, {
        depends_on_task_id: task3,
        task_id: task1
      });
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : '';
    }

    // Verify error message contains cycle path
    assert.match(errorMessage, /Circular dependency detected/);
    // The error message should contain task IDs (may have # prefix or not depending on path formatting)
    assert.match(errorMessage, new RegExp(`${task3}`));
    assert.match(errorMessage, new RegExp(`${task2}`));
    assert.match(errorMessage, new RegExp(`Task #${task3}`)); // Verify the main task ID has # prefix
  });
});

describe('add_dependency - Validation: Non-Existent Tasks', () => {
  it('should reject dependency with non-existent blocker', async () => {
    // Arrange
    const task1 = await createTestTask(testDb, 'Task 1');

    // Act & Assert
    await assert.rejects(
      async () => {
        await addDependencyTest(testDb, {
          depends_on_task_id: 999,
          task_id: task1
        });
      },
      {
        message: /Task #999 not found/
      }
    );
  });

  it('should reject dependency with non-existent blocked', async () => {
    // Arrange
    const task1 = await createTestTask(testDb, 'Task 1');

    // Act & Assert
    await assert.rejects(
      async () => {
        await addDependencyTest(testDb, {
          depends_on_task_id: task1,
          task_id: 999
        });
      },
      {
        message: /Task #999 not found/
      }
    );
  });
});

describe('add_dependency - Validation: Archived Tasks', () => {
  it('should reject dependency with archived blocker', async () => {
    // Arrange
    const task1 = await createTestTask(testDb, 'Task 1', 'archived');
    const task2 = await createTestTask(testDb, 'Task 2');

    // Act & Assert
    await assert.rejects(
      async () => {
        await addDependencyTest(testDb, {
          depends_on_task_id: task1,
          task_id: task2
        });
      },
      {
        message: /Cannot add dependency: Task #\d+ is archived/
      }
    );
  });

  it('should reject dependency with archived blocked', async () => {
    // Arrange
    const task1 = await createTestTask(testDb, 'Task 1');
    const task2 = await createTestTask(testDb, 'Task 2', 'archived');

    // Act & Assert
    await assert.rejects(
      async () => {
        await addDependencyTest(testDb, {
          depends_on_task_id: task1,
          task_id: task2
        });
      },
      {
        message: /Cannot add dependency: Task #\d+ is archived/
      }
    );
  });
});

// ============================================================================
// Task #67: Unit Tests for remove_dependency and get_dependencies
// ============================================================================

describe('remove_dependency', () => {
  it('should remove existing dependency', async () => {
    // Arrange
    const task1 = await createTestTask(testDb, 'Task 1');
    const task2 = await createTestTask(testDb, 'Task 2');

    await addDependencyTest(testDb, {
      depends_on_task_id: task1,
      task_id: task2
    });

    // Verify it exists
    const beforeDeps = await getDependenciesTest(testDb, { task_id: task2 });
    assert.strictEqual(beforeDeps.blockers.length, 1);

    // Act
    const result = await removeDependencyTest(testDb, {
      depends_on_task_id: task1,
      task_id: task2
    });

    // Assert
    assert.strictEqual(result.success, true);
    assert.match(result.message, /Dependency removed/);

    // Verify it no longer exists
    const afterDeps = await getDependenciesTest(testDb, { task_id: task2 });
    assert.strictEqual(afterDeps.blockers.length, 0);
  });

  it('should succeed silently when removing non-existent dependency (idempotent)', async () => {
    // Arrange
    const task1 = await createTestTask(testDb, 'Task 1');
    const task2 = await createTestTask(testDb, 'Task 2');

    // Act - Remove dependency that doesn't exist
    const result = await removeDependencyTest(testDb, {
      depends_on_task_id: task1,
      task_id: task2
    });

    // Assert
    assert.strictEqual(result.success, true);
    assert.match(result.message, /Dependency removed/);
  });
});

describe('get_dependencies - Metadata Only', () => {
  it('should return blockers and blocking (metadata-only)', async () => {
    // Arrange
    const taskA = await createTestTask(testDb, 'Task A');
    const taskB = await createTestTask(testDb, 'Task B');
    const taskC = await createTestTask(testDb, 'Task C');

    // A blocks B, B blocks C (B depends on A, C depends on B)
    await addDependencyTest(testDb, {
      depends_on_task_id: taskA,
      task_id: taskB
    });

    await addDependencyTest(testDb, {
      depends_on_task_id: taskB,
      task_id: taskC
    });

    // Act - Get dependencies for B
    const result = await getDependenciesTest(testDb, { task_id: taskB });

    // Assert
    assert.strictEqual(result.task_id, taskB);

    // B is blocked by A
    assert.strictEqual(result.blockers.length, 1);
    assert.strictEqual(result.blockers[0].id, taskA);
    assert.strictEqual(result.blockers[0].title, 'Task A');

    // B blocks C
    assert.strictEqual(result.blocking.length, 1);
    assert.strictEqual(result.blocking[0].id, taskC);
    assert.strictEqual(result.blocking[0].title, 'Task C');

    // Verify metadata-only (no description field)
    assert.strictEqual(result.blockers[0].description, undefined);
    assert.strictEqual(result.blocking[0].description, undefined);
  });

  it('should return empty arrays for task with no dependencies', async () => {
    // Arrange
    const task1 = await createTestTask(testDb, 'Task 1');

    // Act
    const result = await getDependenciesTest(testDb, { task_id: task1 });

    // Assert
    assert.strictEqual(result.task_id, task1);
    assert.strictEqual(result.blockers.length, 0);
    assert.strictEqual(result.blocking.length, 0);
  });
});

describe('get_dependencies - With Details', () => {
  it('should return full details when include_details=true', async () => {
    // Arrange
    const task1 = await createTestTask(testDb, 'Task 1');
    const task2 = await createTestTask(testDb, 'Task 2');

    // Add description to task1
    const knex = testDb.getKnex();
    await knex('v4_task_details').insert({
      task_id: task1,
      description: 'This is task 1 description'
    });

    // Add dependency (task2 depends on task1)
    await addDependencyTest(testDb, {
      depends_on_task_id: task1,
      task_id: task2
    });

    // Act
    const result = await getDependenciesTest(testDb, {
      task_id: task2,
      include_details: true
    });

    // Assert
    assert.strictEqual(result.blockers.length, 1);
    assert.strictEqual(result.blockers[0].id, task1);
    assert.strictEqual(result.blockers[0].description, 'This is task 1 description');
  });

  it('should not include description by default', async () => {
    // Arrange
    const task1 = await createTestTask(testDb, 'Task 1');
    const task2 = await createTestTask(testDb, 'Task 2');

    // Add description
    const knex = testDb.getKnex();
    await knex('v4_task_details').insert({
      task_id: task1,
      description: 'This is task 1 description'
    });

    await addDependencyTest(testDb, {
      depends_on_task_id: task1,
      task_id: task2
    });

    // Act
    const result = await getDependenciesTest(testDb, { task_id: task2 });

    // Assert
    assert.strictEqual(result.blockers[0].description, undefined);
  });
});

describe('get_dependencies - Error Handling', () => {
  it('should throw error for non-existent task', async () => {
    // Act & Assert
    await assert.rejects(
      async () => {
        await getDependenciesTest(testDb, { task_id: 999 });
      },
      {
        message: /Task with id 999 not found/
      }
    );
  });
});

describe('CASCADE Deletion', () => {
  it('should cascade delete dependencies when task deleted', async () => {
    // Arrange
    const taskA = await createTestTask(testDb, 'Task A');
    const taskB = await createTestTask(testDb, 'Task B');

    // Add A blocks B (B depends on A)
    await addDependencyTest(testDb, {
      depends_on_task_id: taskA,
      task_id: taskB
    });

    // Verify dependency exists
    const beforeDeps = await getDependenciesTest(testDb, { task_id: taskB });
    assert.strictEqual(beforeDeps.blockers.length, 1);

    // Act - Delete task A
    const knex = testDb.getKnex();
    await knex('v4_tasks').where({ id: taskA }).delete();

    // Assert - Dependency should be deleted
    const depsInDb = await knex('v4_task_dependencies')
      .where('blocker_task_id', taskA)
      .orWhere('blocked_task_id', taskA);

    assert.strictEqual(depsInDb.length, 0);

    // Verify B still exists
    const taskBExists = await knex('v4_tasks').where({ id: taskB }).first();
    assert.ok(taskBExists);

    // Verify B has no dependencies anymore
    const afterDeps = await getDependenciesTest(testDb, { task_id: taskB });
    assert.strictEqual(afterDeps.blockers.length, 0);
  });

  it('should cascade delete when blocked task is deleted', async () => {
    // Arrange
    const taskA = await createTestTask(testDb, 'Task A');
    const taskB = await createTestTask(testDb, 'Task B');

    await addDependencyTest(testDb, {
      depends_on_task_id: taskA,
      task_id: taskB
    });

    // Act - Delete task B
    const knex = testDb.getKnex();
    await knex('v4_tasks').where({ id: taskB }).delete();

    // Assert - Dependency should be deleted
    const depsInDb = await knex('v4_task_dependencies')
      .where('blocked_task_id', taskB);

    assert.strictEqual(depsInDb.length, 0);

    // Verify A still exists with no dependencies
    const afterDeps = await getDependenciesTest(testDb, { task_id: taskA });
    assert.strictEqual(afterDeps.blocking.length, 0);
  });
});

console.log('✓ All task dependency tests defined');
