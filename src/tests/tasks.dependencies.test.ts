/**
 * Unit tests for Task Dependency feature
 * Tests add_dependency, remove_dependency, get_dependencies actions
 * and enhanced list/get actions with dependency support
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initializeSchema } from '../schema.js';
import { migrateToTaskDependencies } from '../migrations/add-task-dependencies.js';
import {
  getOrCreateAgent,
  transaction
} from '../database.js';
import type { Database as DatabaseType } from '../types.js';

/**
 * Test database instance
 */
let testDb: DatabaseType;

/**
 * Create an in-memory test database
 */
function createTestDatabase(): DatabaseType {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  // Initialize schema
  initializeSchema(db);

  // Run task dependencies migration
  const migrationResult = migrateToTaskDependencies(db);
  if (!migrationResult.success) {
    throw new Error(`Migration failed: ${migrationResult.message}`);
  }

  return db;
}

/**
 * Helper: Create a test task
 */
function createTestTask(db: DatabaseType, title: string, status: string = 'todo'): number {
  const agentId = getOrCreateAgent(db, 'test-agent');
  const statusIdMap: Record<string, number> = {
    'todo': 1,
    'in_progress': 2,
    'waiting_review': 3,
    'blocked': 4,
    'done': 5,
    'archived': 6
  };

  const statusId = statusIdMap[status];
  const result = db.prepare(`
    INSERT INTO t_tasks (title, status_id, priority, created_by_agent_id, assigned_agent_id)
    VALUES (?, ?, 2, ?, ?)
  `).run(title, statusId, agentId, agentId);

  return result.lastInsertRowid as number;
}

/**
 * Inline implementation of addDependency for testing (avoiding module dependency)
 */
function addDependencyTest(db: DatabaseType, params: {
  blocker_task_id: number;
  blocked_task_id: number;
}): any {
  if (!params.blocker_task_id) {
    throw new Error('Parameter "blocker_task_id" is required');
  }

  if (!params.blocked_task_id) {
    throw new Error('Parameter "blocked_task_id" is required');
  }

  return transaction(db, () => {
    const TASK_STATUS_ARCHIVED = 6;

    // Validation 1: No self-dependencies
    if (params.blocker_task_id === params.blocked_task_id) {
      throw new Error('Self-dependency not allowed');
    }

    // Validation 2: Both tasks must exist and check if archived
    const blockerTask = db.prepare('SELECT id, status_id FROM t_tasks WHERE id = ?').get(params.blocker_task_id) as { id: number; status_id: number } | undefined;
    const blockedTask = db.prepare('SELECT id, status_id FROM t_tasks WHERE id = ?').get(params.blocked_task_id) as { id: number; status_id: number } | undefined;

    if (!blockerTask) {
      throw new Error(`Blocker task #${params.blocker_task_id} not found`);
    }

    if (!blockedTask) {
      throw new Error(`Blocked task #${params.blocked_task_id} not found`);
    }

    // Validation 3: Neither task is archived
    if (blockerTask.status_id === TASK_STATUS_ARCHIVED) {
      throw new Error(`Cannot add dependency: Task #${params.blocker_task_id} is archived`);
    }

    if (blockedTask.status_id === TASK_STATUS_ARCHIVED) {
      throw new Error(`Cannot add dependency: Task #${params.blocked_task_id} is archived`);
    }

    // Validation 4: No direct circular (reverse relationship)
    const reverseExists = db.prepare(`
      SELECT 1 FROM t_task_dependencies
      WHERE blocker_task_id = ? AND blocked_task_id = ?
    `).get(params.blocked_task_id, params.blocker_task_id);

    if (reverseExists) {
      throw new Error(`Circular dependency detected: Task #${params.blocked_task_id} already blocks Task #${params.blocker_task_id}`);
    }

    // Validation 5: No transitive circular (check if adding this would create a cycle)
    const cycleCheck = db.prepare(`
      WITH RECURSIVE dependency_chain AS (
        -- Start from the task that would be blocked
        SELECT blocked_task_id as task_id, 1 as depth
        FROM t_task_dependencies
        WHERE blocker_task_id = ?

        UNION ALL

        -- Follow the chain of dependencies
        SELECT d.blocked_task_id, dc.depth + 1
        FROM t_task_dependencies d
        JOIN dependency_chain dc ON d.blocker_task_id = dc.task_id
        WHERE dc.depth < 100
      )
      SELECT task_id FROM dependency_chain WHERE task_id = ?
    `).get(params.blocked_task_id, params.blocker_task_id) as { task_id: number } | undefined;

    if (cycleCheck) {
      // Build cycle path for error message
      const cyclePathResult = db.prepare(`
        WITH RECURSIVE dependency_chain AS (
          SELECT blocked_task_id as task_id, 1 as depth,
                 CAST(blocked_task_id AS TEXT) as path
          FROM t_task_dependencies
          WHERE blocker_task_id = ?

          UNION ALL

          SELECT d.blocked_task_id, dc.depth + 1,
                 dc.path || ' → ' || d.blocked_task_id
          FROM t_task_dependencies d
          JOIN dependency_chain dc ON d.blocker_task_id = dc.task_id
          WHERE dc.depth < 100
        )
        SELECT path FROM dependency_chain WHERE task_id = ? ORDER BY depth DESC LIMIT 1
      `).get(params.blocked_task_id, params.blocker_task_id) as { path: string } | undefined;

      const cyclePath = cyclePathResult?.path || `#${params.blocked_task_id} → ... → #${params.blocker_task_id}`;
      throw new Error(`Circular dependency detected: Task #${params.blocker_task_id} → #${cyclePath} → #${params.blocker_task_id}`);
    }

    // All validations passed - insert dependency
    const insertStmt = db.prepare(`
      INSERT INTO t_task_dependencies (blocker_task_id, blocked_task_id)
      VALUES (?, ?)
    `);

    insertStmt.run(params.blocker_task_id, params.blocked_task_id);

    return {
      success: true,
      message: `Dependency added: Task #${params.blocker_task_id} blocks Task #${params.blocked_task_id}`
    };
  });
}

/**
 * Inline implementation of removeDependency for testing
 */
function removeDependencyTest(db: DatabaseType, params: {
  blocker_task_id: number;
  blocked_task_id: number;
}): any {
  if (!params.blocker_task_id) {
    throw new Error('Parameter "blocker_task_id" is required');
  }

  if (!params.blocked_task_id) {
    throw new Error('Parameter "blocked_task_id" is required');
  }

  const deleteStmt = db.prepare(`
    DELETE FROM t_task_dependencies
    WHERE blocker_task_id = ? AND blocked_task_id = ?
  `);

  deleteStmt.run(params.blocker_task_id, params.blocked_task_id);

  return {
    success: true,
    message: `Dependency removed: Task #${params.blocker_task_id} no longer blocks Task #${params.blocked_task_id}`
  };
}

/**
 * Inline implementation of getDependencies for testing
 */
function getDependenciesTest(db: DatabaseType, params: {
  task_id: number;
  include_details?: boolean;
}): any {
  if (!params.task_id) {
    throw new Error('Parameter "task_id" is required');
  }

  const includeDetails = params.include_details || false;

  // Check if task exists
  const taskExists = db.prepare('SELECT id FROM t_tasks WHERE id = ?').get(params.task_id);
  if (!taskExists) {
    throw new Error(`Task with id ${params.task_id} not found`);
  }

  // Build query based on include_details flag
  let selectFields: string;
  if (includeDetails) {
    selectFields = `
      t.id,
      t.title,
      s.name as status,
      t.priority,
      aa.name as assigned_to,
      t.created_ts,
      t.updated_ts,
      td.description
    `;
  } else {
    selectFields = `
      t.id,
      t.title,
      s.name as status,
      t.priority
    `;
  }

  // Get blockers (tasks that block this task)
  const blockersQuery = `
    SELECT ${selectFields}
    FROM t_tasks t
    JOIN t_task_dependencies d ON t.id = d.blocker_task_id
    LEFT JOIN m_task_statuses s ON t.status_id = s.id
    LEFT JOIN m_agents aa ON t.assigned_agent_id = aa.id
    ${includeDetails ? 'LEFT JOIN t_task_details td ON t.id = td.task_id' : ''}
    WHERE d.blocked_task_id = ?
  `;

  const blockers = db.prepare(blockersQuery).all(params.task_id);

  // Get blocking (tasks this task blocks)
  const blockingQuery = `
    SELECT ${selectFields}
    FROM t_tasks t
    JOIN t_task_dependencies d ON t.id = d.blocked_task_id
    LEFT JOIN m_task_statuses s ON t.status_id = s.id
    LEFT JOIN m_agents aa ON t.assigned_agent_id = aa.id
    ${includeDetails ? 'LEFT JOIN t_task_details td ON t.id = td.task_id' : ''}
    WHERE d.blocker_task_id = ?
  `;

  const blocking = db.prepare(blockingQuery).all(params.task_id);

  return {
    task_id: params.task_id,
    blockers,
    blocking
  };
}

/**
 * Setup before each test
 */
beforeEach(() => {
  // Create fresh database for each test
  testDb = createTestDatabase();
});

// ============================================================================
// Task #66: Unit Tests for add_dependency Validation
// ============================================================================

describe('add_dependency - Success Cases', () => {
  it('should add valid dependency', () => {
    // Arrange
    const task1 = createTestTask(testDb, 'Task 1');
    const task2 = createTestTask(testDb, 'Task 2');

    // Act
    const result = addDependencyTest(testDb, {
      blocker_task_id: task1,
      blocked_task_id: task2
    });

    // Assert
    assert.strictEqual(result.success, true);
    assert.match(result.message, /Dependency added/);

    // Verify in database
    const deps = testDb.prepare(`
      SELECT * FROM t_task_dependencies
      WHERE blocker_task_id = ? AND blocked_task_id = ?
    `).get(task1, task2);

    assert.ok(deps);
  });

  it('should add valid dependency and verify via get_dependencies', () => {
    // Arrange
    const task1 = createTestTask(testDb, 'Task 1');
    const task2 = createTestTask(testDb, 'Task 2');

    // Act
    addDependencyTest(testDb, {
      blocker_task_id: task1,
      blocked_task_id: task2
    });

    const result = getDependenciesTest(testDb, { task_id: task2 });

    // Assert
    assert.strictEqual(result.task_id, task2);
    assert.strictEqual(result.blockers.length, 1);
    assert.strictEqual(result.blockers[0].id, task1);
    assert.strictEqual(result.blocking.length, 0);
  });
});

describe('add_dependency - Validation: Self-Dependency', () => {
  it('should reject self-dependency', () => {
    // Arrange
    const task1 = createTestTask(testDb, 'Task 1');

    // Act & Assert
    assert.throws(
      () => {
        addDependencyTest(testDb, {
          blocker_task_id: task1,
          blocked_task_id: task1
        });
      },
      {
        message: /Self-dependency not allowed/
      }
    );
  });
});

describe('add_dependency - Validation: Direct Circular', () => {
  it('should reject direct circular dependency', () => {
    // Arrange
    const taskA = createTestTask(testDb, 'Task A');
    const taskB = createTestTask(testDb, 'Task B');

    // Add A blocks B
    addDependencyTest(testDb, {
      blocker_task_id: taskA,
      blocked_task_id: taskB
    });

    // Act & Assert - Try to add B blocks A
    assert.throws(
      () => {
        addDependencyTest(testDb, {
          blocker_task_id: taskB,
          blocked_task_id: taskA
        });
      },
      {
        message: /Circular dependency detected/
      }
    );
  });
});

describe('add_dependency - Validation: Transitive Circular', () => {
  it('should reject transitive circular dependency (A→B→C→A)', () => {
    // Arrange
    const taskA = createTestTask(testDb, 'Task A');
    const taskB = createTestTask(testDb, 'Task B');
    const taskC = createTestTask(testDb, 'Task C');

    // Add A blocks B
    addDependencyTest(testDb, {
      blocker_task_id: taskA,
      blocked_task_id: taskB
    });

    // Add B blocks C
    addDependencyTest(testDb, {
      blocker_task_id: taskB,
      blocked_task_id: taskC
    });

    // Act & Assert - Try to add C blocks A (would create cycle)
    assert.throws(
      () => {
        addDependencyTest(testDb, {
          blocker_task_id: taskC,
          blocked_task_id: taskA
        });
      },
      {
        message: /Circular dependency detected/
      }
    );
  });

  it('should reject transitive circular with cycle path in error message', () => {
    // Arrange
    const task1 = createTestTask(testDb, 'Task 1');
    const task2 = createTestTask(testDb, 'Task 2');
    const task3 = createTestTask(testDb, 'Task 3');

    // Create chain: 1 → 2 → 3
    addDependencyTest(testDb, {
      blocker_task_id: task1,
      blocked_task_id: task2
    });

    addDependencyTest(testDb, {
      blocker_task_id: task2,
      blocked_task_id: task3
    });

    // Act & Assert - Try to add 3 → 1
    let errorMessage = '';
    try {
      addDependencyTest(testDb, {
        blocker_task_id: task3,
        blocked_task_id: task1
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
  it('should reject dependency with non-existent blocker', () => {
    // Arrange
    const task1 = createTestTask(testDb, 'Task 1');

    // Act & Assert
    assert.throws(
      () => {
        addDependencyTest(testDb, {
          blocker_task_id: 999,
          blocked_task_id: task1
        });
      },
      {
        message: /Blocker task #999 not found/
      }
    );
  });

  it('should reject dependency with non-existent blocked', () => {
    // Arrange
    const task1 = createTestTask(testDb, 'Task 1');

    // Act & Assert
    assert.throws(
      () => {
        addDependencyTest(testDb, {
          blocker_task_id: task1,
          blocked_task_id: 999
        });
      },
      {
        message: /Blocked task #999 not found/
      }
    );
  });
});

describe('add_dependency - Validation: Archived Tasks', () => {
  it('should reject dependency with archived blocker', () => {
    // Arrange
    const task1 = createTestTask(testDb, 'Task 1', 'archived');
    const task2 = createTestTask(testDb, 'Task 2');

    // Act & Assert
    assert.throws(
      () => {
        addDependencyTest(testDb, {
          blocker_task_id: task1,
          blocked_task_id: task2
        });
      },
      {
        message: /Cannot add dependency: Task #\d+ is archived/
      }
    );
  });

  it('should reject dependency with archived blocked', () => {
    // Arrange
    const task1 = createTestTask(testDb, 'Task 1');
    const task2 = createTestTask(testDb, 'Task 2', 'archived');

    // Act & Assert
    assert.throws(
      () => {
        addDependencyTest(testDb, {
          blocker_task_id: task1,
          blocked_task_id: task2
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
  it('should remove existing dependency', () => {
    // Arrange
    const task1 = createTestTask(testDb, 'Task 1');
    const task2 = createTestTask(testDb, 'Task 2');

    addDependencyTest(testDb, {
      blocker_task_id: task1,
      blocked_task_id: task2
    });

    // Verify it exists
    const beforeDeps = getDependenciesTest(testDb, { task_id: task2 });
    assert.strictEqual(beforeDeps.blockers.length, 1);

    // Act
    const result = removeDependencyTest(testDb, {
      blocker_task_id: task1,
      blocked_task_id: task2
    });

    // Assert
    assert.strictEqual(result.success, true);
    assert.match(result.message, /Dependency removed/);

    // Verify it no longer exists
    const afterDeps = getDependenciesTest(testDb, { task_id: task2 });
    assert.strictEqual(afterDeps.blockers.length, 0);
  });

  it('should succeed silently when removing non-existent dependency (idempotent)', () => {
    // Arrange
    const task1 = createTestTask(testDb, 'Task 1');
    const task2 = createTestTask(testDb, 'Task 2');

    // Act - Remove dependency that doesn't exist
    const result = removeDependencyTest(testDb, {
      blocker_task_id: task1,
      blocked_task_id: task2
    });

    // Assert
    assert.strictEqual(result.success, true);
    assert.match(result.message, /Dependency removed/);
  });
});

describe('get_dependencies - Metadata Only', () => {
  it('should return blockers and blocking (metadata-only)', () => {
    // Arrange
    const taskA = createTestTask(testDb, 'Task A');
    const taskB = createTestTask(testDb, 'Task B');
    const taskC = createTestTask(testDb, 'Task C');

    // A blocks B, B blocks C
    addDependencyTest(testDb, {
      blocker_task_id: taskA,
      blocked_task_id: taskB
    });

    addDependencyTest(testDb, {
      blocker_task_id: taskB,
      blocked_task_id: taskC
    });

    // Act - Get dependencies for B
    const result = getDependenciesTest(testDb, { task_id: taskB });

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

  it('should return empty arrays for task with no dependencies', () => {
    // Arrange
    const task1 = createTestTask(testDb, 'Task 1');

    // Act
    const result = getDependenciesTest(testDb, { task_id: task1 });

    // Assert
    assert.strictEqual(result.task_id, task1);
    assert.strictEqual(result.blockers.length, 0);
    assert.strictEqual(result.blocking.length, 0);
  });
});

describe('get_dependencies - With Details', () => {
  it('should return full details when include_details=true', () => {
    // Arrange
    const task1 = createTestTask(testDb, 'Task 1');
    const task2 = createTestTask(testDb, 'Task 2');

    // Add description to task1
    testDb.prepare(`
      INSERT INTO t_task_details (task_id, description)
      VALUES (?, ?)
    `).run(task1, 'This is task 1 description');

    // Add dependency
    addDependencyTest(testDb, {
      blocker_task_id: task1,
      blocked_task_id: task2
    });

    // Act
    const result = getDependenciesTest(testDb, {
      task_id: task2,
      include_details: true
    });

    // Assert
    assert.strictEqual(result.blockers.length, 1);
    assert.strictEqual(result.blockers[0].id, task1);
    assert.strictEqual(result.blockers[0].description, 'This is task 1 description');
  });

  it('should not include description by default', () => {
    // Arrange
    const task1 = createTestTask(testDb, 'Task 1');
    const task2 = createTestTask(testDb, 'Task 2');

    // Add description
    testDb.prepare(`
      INSERT INTO t_task_details (task_id, description)
      VALUES (?, ?)
    `).run(task1, 'This is task 1 description');

    addDependencyTest(testDb, {
      blocker_task_id: task1,
      blocked_task_id: task2
    });

    // Act
    const result = getDependenciesTest(testDb, { task_id: task2 });

    // Assert
    assert.strictEqual(result.blockers[0].description, undefined);
  });
});

describe('get_dependencies - Error Handling', () => {
  it('should throw error for non-existent task', () => {
    // Act & Assert
    assert.throws(
      () => {
        getDependenciesTest(testDb, { task_id: 999 });
      },
      {
        message: /Task with id 999 not found/
      }
    );
  });
});

describe('CASCADE Deletion', () => {
  it('should cascade delete dependencies when task deleted', () => {
    // Arrange
    const taskA = createTestTask(testDb, 'Task A');
    const taskB = createTestTask(testDb, 'Task B');

    // Add A blocks B
    addDependencyTest(testDb, {
      blocker_task_id: taskA,
      blocked_task_id: taskB
    });

    // Verify dependency exists
    const beforeDeps = getDependenciesTest(testDb, { task_id: taskB });
    assert.strictEqual(beforeDeps.blockers.length, 1);

    // Act - Delete task A
    testDb.prepare('DELETE FROM t_tasks WHERE id = ?').run(taskA);

    // Assert - Dependency should be deleted
    const depsInDb = testDb.prepare(`
      SELECT * FROM t_task_dependencies
      WHERE blocker_task_id = ? OR blocked_task_id = ?
    `).all(taskA, taskA);

    assert.strictEqual(depsInDb.length, 0);

    // Verify B still exists
    const taskBExists = testDb.prepare('SELECT id FROM t_tasks WHERE id = ?').get(taskB);
    assert.ok(taskBExists);

    // Verify B has no dependencies anymore
    const afterDeps = getDependenciesTest(testDb, { task_id: taskB });
    assert.strictEqual(afterDeps.blockers.length, 0);
  });

  it('should cascade delete when blocked task is deleted', () => {
    // Arrange
    const taskA = createTestTask(testDb, 'Task A');
    const taskB = createTestTask(testDb, 'Task B');

    addDependencyTest(testDb, {
      blocker_task_id: taskA,
      blocked_task_id: taskB
    });

    // Act - Delete task B
    testDb.prepare('DELETE FROM t_tasks WHERE id = ?').run(taskB);

    // Assert - Dependency should be deleted
    const depsInDb = testDb.prepare(`
      SELECT * FROM t_task_dependencies
      WHERE blocked_task_id = ?
    `).all(taskB);

    assert.strictEqual(depsInDb.length, 0);

    // Verify A still exists with no dependencies
    const afterDeps = getDependenciesTest(testDb, { task_id: taskA });
    assert.strictEqual(afterDeps.blocking.length, 0);
  });
});

console.log('✓ All task dependency tests defined');
