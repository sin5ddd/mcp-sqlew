import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ConnectionManager } from '../../../utils/connection-manager.js';

/**
 * Integration tests for ConnectionManager
 *
 * These tests verify that the ConnectionManager works correctly with
 * database-like operations, simulating real-world failure scenarios.
 */
describe('ConnectionManager Integration Tests', () => {
  let connectionManager: ConnectionManager;
  let originalSetTimeout: typeof setTimeout;
  let mockSetTimeout: any;

  beforeEach(() => {
    connectionManager = new ConnectionManager();

    // Mock setTimeout to execute immediately for faster tests
    originalSetTimeout = global.setTimeout;
    mockSetTimeout = mock.fn((callback: () => void) => {
      callback();
      return {} as NodeJS.Timeout;
    });
    global.setTimeout = mockSetTimeout as any;
  });

  afterEach(() => {
    global.setTimeout = originalSetTimeout;
  });

  describe('Database Operations', () => {
    it('should handle normal database query', async () => {
      const mockDb = {
        query: mock.fn(async () => ({ rows: [{ id: 1, name: 'test' }] })),
      };

      const result = await connectionManager.executeWithRetry(async () => {
        return await mockDb.query();
      });

      assert.deepStrictEqual(result, { rows: [{ id: 1, name: 'test' }] });
      assert.strictEqual(mockDb.query.mock.calls.length, 1);
      assert.strictEqual(mockSetTimeout.mock.calls.length, 0); // No retries
    });

    it('should retry database query on connection failure', async () => {
      let queryCount = 0;
      const mockDb = {
        query: mock.fn(async () => {
          queryCount++;
          if (queryCount === 1) {
            const error: any = new Error('Connection lost to MySQL server');
            error.code = 'PROTOCOL_CONNECTION_LOST';
            throw error;
          }
          return { rows: [{ id: 1, name: 'test' }] };
        }),
      };

      const result = await connectionManager.executeWithRetry(async () => {
        return await mockDb.query();
      });

      assert.deepStrictEqual(result, { rows: [{ id: 1, name: 'test' }] });
      assert.strictEqual(mockDb.query.mock.calls.length, 2); // Initial + 1 retry
      assert.strictEqual(mockSetTimeout.mock.calls.length, 1); // 1 retry delay
    });

    it('should handle multiple consecutive operations', async () => {
      const mockDb = {
        insert: mock.fn(async () => ({ insertId: 1 })),
        update: mock.fn(async () => ({ affectedRows: 1 })),
        select: mock.fn(async () => ({ rows: [{ id: 1 }] })),
      };

      // Operation 1: Insert
      const insertResult = await connectionManager.executeWithRetry(async () => {
        return await mockDb.insert();
      });
      assert.deepStrictEqual(insertResult, { insertId: 1 });

      // Operation 2: Update
      const updateResult = await connectionManager.executeWithRetry(async () => {
        return await mockDb.update();
      });
      assert.deepStrictEqual(updateResult, { affectedRows: 1 });

      // Operation 3: Select
      const selectResult = await connectionManager.executeWithRetry(async () => {
        return await mockDb.select();
      });
      assert.deepStrictEqual(selectResult, { rows: [{ id: 1 }] });

      // Verify all operations executed once
      assert.strictEqual(mockDb.insert.mock.calls.length, 1);
      assert.strictEqual(mockDb.update.mock.calls.length, 1);
      assert.strictEqual(mockDb.select.mock.calls.length, 1);
    });

    it('should handle transaction with connection failure', async () => {
      let transactionCount = 0;
      const mockDb = {
        transaction: mock.fn(async (callback: () => Promise<any>) => {
          transactionCount++;
          if (transactionCount === 1) {
            const error: any = new Error('Lost connection to database during query');
            throw error;
          }
          return await callback();
        }),
      };

      const result = await connectionManager.executeWithRetry(async () => {
        return await mockDb.transaction(async () => {
          return { success: true, data: { id: 1 } };
        });
      });

      assert.deepStrictEqual(result, { success: true, data: { id: 1 } });
      assert.strictEqual(mockDb.transaction.mock.calls.length, 2); // Initial + 1 retry
      assert.strictEqual(mockSetTimeout.mock.calls.length, 1);
    });
  });

  describe('Simulated Production Scenarios', () => {
    it('should handle intermittent network failures', async () => {
      let attemptCount = 0;
      const mockDb = {
        query: mock.fn(async () => {
          attemptCount++;
          // Simulate intermittent failure: fail on first attempt
          if (attemptCount === 1) {
            const error: any = new Error('ETIMEDOUT');
            error.code = 'ETIMEDOUT';
            throw error;
          }
          return { success: true };
        }),
      };

      const result = await connectionManager.executeWithRetry(async () => {
        return await mockDb.query();
      });

      assert.deepStrictEqual(result, { success: true });
      assert.strictEqual(mockDb.query.mock.calls.length, 2); // 1st fail, 2nd success
      assert.strictEqual(attemptCount, 2);
    });

    it('should handle database server restart', async () => {
      let serverRestarted = false;
      let attemptCount = 0;

      const mockDb = {
        query: mock.fn(async () => {
          attemptCount++;

          // Simulate server being down for first 2 attempts
          if (!serverRestarted && attemptCount <= 2) {
            const error: any = new Error('ECONNREFUSED: Connection refused');
            error.code = 'ECONNREFUSED';
            throw error;
          }

          // Server comes back online
          if (attemptCount === 3) {
            serverRestarted = true;
          }

          return { status: 'online', data: [] };
        }),
      };

      const result = await connectionManager.executeWithRetry(async () => {
        return await mockDb.query();
      });

      assert.deepStrictEqual(result, { status: 'online', data: [] });
      assert.strictEqual(attemptCount, 3);
      assert.strictEqual(serverRestarted, true);
    });

    it('should handle MySQL "server has gone away" error', async () => {
      let queryCount = 0;

      const mockDb = {
        query: mock.fn(async () => {
          queryCount++;
          if (queryCount === 1) {
            const error: any = new Error('MySQL server has gone away');
            error.code = 'PROTOCOL_CONNECTION_LOST';
            throw error;
          }
          return { rows: [{ count: 100 }] };
        }),
      };

      const result = await connectionManager.executeWithRetry(async () => {
        return await mockDb.query();
      });

      assert.deepStrictEqual(result, { rows: [{ count: 100 }] });
      assert.strictEqual(queryCount, 2);
    });

    it('should handle PostgreSQL connection timeout', async () => {
      let queryCount = 0;

      const mockDb = {
        query: mock.fn(async () => {
          queryCount++;
          if (queryCount === 1) {
            const error: any = new Error('Connection to server was lost');
            error.code = 'ECONNRESET';
            throw error;
          }
          return { rowCount: 5 };
        }),
      };

      const result = await connectionManager.executeWithRetry(async () => {
        return await mockDb.query();
      });

      assert.deepStrictEqual(result, { rowCount: 5 });
      assert.strictEqual(queryCount, 2);
    });

    it('should NOT retry on validation errors', async () => {
      const mockDb = {
        insert: mock.fn(async () => {
          const error: any = new Error('NOT NULL constraint failed: users.email');
          error.code = 'SQLITE_CONSTRAINT';
          throw error;
        }),
      };

      await assert.rejects(
        async () => {
          await connectionManager.executeWithRetry(async () => {
            return await mockDb.insert();
          });
        },
        {
          message: 'NOT NULL constraint failed: users.email',
        }
      );

      // Should only attempt once (no retries for validation errors)
      assert.strictEqual(mockDb.insert.mock.calls.length, 1);
      assert.strictEqual(mockSetTimeout.mock.calls.length, 0); // No retries
    });

    it('should NOT retry on foreign key constraint errors', async () => {
      const mockDb = {
        insert: mock.fn(async () => {
          throw new Error('FOREIGN KEY constraint failed');
        }),
      };

      await assert.rejects(
        async () => {
          await connectionManager.executeWithRetry(async () => {
            return await mockDb.insert();
          });
        },
        {
          message: 'FOREIGN KEY constraint failed',
        }
      );

      assert.strictEqual(mockDb.insert.mock.calls.length, 1);
      assert.strictEqual(mockSetTimeout.mock.calls.length, 0);
    });
  });

  describe('Tool Integration Scenarios', () => {
    it('should handle context.setDecision with connection failure', async () => {
      let operationCount = 0;

      const mockContextDb = {
        transaction: mock.fn(async (callback: () => Promise<any>) => {
          operationCount++;
          if (operationCount === 1) {
            throw new Error('Connection lost to database');
          }
          return await callback();
        }),
      };

      const result = await connectionManager.executeWithRetry(async () => {
        return await mockContextDb.transaction(async () => {
          // Simulate context.setDecision operations
          return {
            decision_id: 123,
            key: 'test-decision',
            created: true,
          };
        });
      });

      assert.deepStrictEqual(result, {
        decision_id: 123,
        key: 'test-decision',
        created: true,
      });
      assert.strictEqual(operationCount, 2);
    });

    it('should handle task.create with connection failure', async () => {
      let operationCount = 0;

      const mockTaskDb = {
        transaction: mock.fn(async (callback: () => Promise<any>) => {
          operationCount++;
          if (operationCount === 1) {
            const error: any = new Error('ECONNREFUSED');
            error.code = 'ECONNREFUSED';
            throw error;
          }
          return await callback();
        }),
      };

      const result = await connectionManager.executeWithRetry(async () => {
        return await mockTaskDb.transaction(async () => {
          // Simulate task.create operations
          return {
            task_id: 234,
            title: 'Test Task',
            status: 'pending',
          };
        });
      });

      assert.deepStrictEqual(result, {
        task_id: 234,
        title: 'Test Task',
        status: 'pending',
      });
      assert.strictEqual(operationCount, 2);
    });

    it('should handle file.record with connection failure', async () => {
      let operationCount = 0;

      const mockFileDb = {
        insert: mock.fn(async () => {
          operationCount++;
          if (operationCount === 1) {
            throw new Error('Lost connection to MySQL server');
          }
          return { file_change_id: 456 };
        }),
      };

      const result = await connectionManager.executeWithRetry(async () => {
        return await mockFileDb.insert();
      });

      assert.deepStrictEqual(result, { file_change_id: 456 });
      assert.strictEqual(operationCount, 2);
    });

    it('should handle constraint.add with connection failure', async () => {
      let operationCount = 0;

      const mockConstraintDb = {
        insert: mock.fn(async () => {
          operationCount++;
          if (operationCount === 1) {
            const error: any = new Error('Connection timeout');
            error.code = 'ETIMEDOUT';
            throw error;
          }
          return { constraint_id: 789 };
        }),
      };

      const result = await connectionManager.executeWithRetry(async () => {
        return await mockConstraintDb.insert();
      });

      assert.deepStrictEqual(result, { constraint_id: 789 });
      assert.strictEqual(operationCount, 2);
    });
  });

  describe('Retry Count Management', () => {
    it('should reset retry count between different operations', async () => {
      let op1Count = 0;
      let op2Count = 0;

      // Operation 1: Fails once, then succeeds
      await connectionManager.executeWithRetry(async () => {
        op1Count++;
        if (op1Count === 1) {
          const error: any = new Error('Connection lost');
          throw error;
        }
        return { op: 1 };
      });

      assert.strictEqual(op1Count, 2);

      // Operation 2: Should start with fresh retry count
      const result = await connectionManager.executeWithRetry(async () => {
        op2Count++;
        return { op: 2 };
      });

      assert.strictEqual(op2Count, 1); // No retries needed
      assert.deepStrictEqual(result, { op: 2 });
    });

    it('should track retry count correctly across multiple failures', async () => {
      const delays: number[] = [];
      const trackingMock = mock.fn((callback: () => void, delay: number) => {
        delays.push(delay);
        callback();
        return {} as NodeJS.Timeout;
      });
      global.setTimeout = trackingMock as any;

      let attemptCount = 0;

      await connectionManager.executeWithRetry(async () => {
        attemptCount++;
        if (attemptCount <= 3) {
          const error: any = new Error('Connection failed');
          throw error;
        }
        return { success: true };
      });

      // Verify exponential backoff was used
      assert.strictEqual(delays.length, 3); // 3 retries
      assert.strictEqual(delays[0], 1000); // 1s
      assert.strictEqual(delays[1], 2000); // 2s
      assert.strictEqual(delays[2], 4000); // 4s
      assert.strictEqual(attemptCount, 4); // 3 failures + 1 success
    });
  });

  describe('Complex Operation Patterns', () => {
    it('should handle batch operations with partial failures', async () => {
      const operations = [
        { id: 1, shouldFail: true },
        { id: 2, shouldFail: false },
        { id: 3, shouldFail: false },
      ];

      const results: any[] = [];

      for (const op of operations) {
        let attemptCount = 0;

        const result = await connectionManager.executeWithRetry(async () => {
          attemptCount++;

          if (op.shouldFail && attemptCount === 1) {
            throw new Error('Connection lost');
          }

          return { id: op.id, processed: true };
        });

        results.push(result);
      }

      assert.strictEqual(results.length, 3);
      assert.deepStrictEqual(results[0], { id: 1, processed: true });
      assert.deepStrictEqual(results[1], { id: 2, processed: true });
      assert.deepStrictEqual(results[2], { id: 3, processed: true });
    });

    it('should handle nested database operations', async () => {
      let outerCount = 0;
      let innerCount = 0;

      const result = await connectionManager.executeWithRetry(async () => {
        outerCount++;

        if (outerCount === 1) {
          throw new Error('Connection lost');
        }

        // Nested operation (simulating transaction within transaction)
        const innerResult = await connectionManager.executeWithRetry(async () => {
          innerCount++;
          return { inner: true };
        });

        return { outer: true, nested: innerResult };
      });

      assert.deepStrictEqual(result, {
        outer: true,
        nested: { inner: true },
      });
      assert.strictEqual(outerCount, 2); // Failed once, succeeded once
      assert.strictEqual(innerCount, 1); // Executed once (only in successful outer attempt)
    });

    it('should handle concurrent operations', async () => {
      const results = await Promise.all([
        connectionManager.executeWithRetry(async () => ({ id: 1, value: 'A' })),
        connectionManager.executeWithRetry(async () => ({ id: 2, value: 'B' })),
        connectionManager.executeWithRetry(async () => ({ id: 3, value: 'C' })),
      ]);

      assert.strictEqual(results.length, 3);
      assert.deepStrictEqual(results[0], { id: 1, value: 'A' });
      assert.deepStrictEqual(results[1], { id: 2, value: 'B' });
      assert.deepStrictEqual(results[2], { id: 3, value: 'C' });
    });
  });
});
