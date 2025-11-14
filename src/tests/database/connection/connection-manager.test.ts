import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ConnectionManager } from '../../../utils/connection-manager.js';

describe('ConnectionManager', () => {
  let connectionManager: ConnectionManager;
  let originalSetTimeout: typeof setTimeout;
  let originalProcessExit: typeof process.exit;
  let originalConsoleError: typeof console.error;
  let mockSetTimeout: any;
  let processExitCalled: boolean;
  let processExitCode: number | undefined;

  // Helper to create connection error with proper error code
  function createConnectionError(code: string, message?: string): Error {
    const error: any = new Error(message || code);
    error.code = code;
    return error;
  }

  beforeEach(() => {
    connectionManager = new ConnectionManager();
    processExitCalled = false;
    processExitCode = undefined;

    // Mock setTimeout to execute immediately
    originalSetTimeout = global.setTimeout;
    mockSetTimeout = mock.fn((callback: () => void) => {
      callback();
      return {} as NodeJS.Timeout;
    });
    global.setTimeout = mockSetTimeout as any;

    // Mock process.exit
    originalProcessExit = process.exit;
    process.exit = mock.fn((code?: number) => {
      processExitCalled = true;
      processExitCode = code;
      throw new Error('process.exit called'); // Prevent actual exit
    }) as any;

    // Mock console.error to suppress output
    originalConsoleError = console.error;
    console.error = mock.fn();
  });

  afterEach(() => {
    global.setTimeout = originalSetTimeout;
    process.exit = originalProcessExit;
    console.error = originalConsoleError;
  });

  describe('executeWithRetry', () => {
    it('should execute operation successfully on first attempt', async () => {
      const operation = mock.fn(async () => 'success');

      const result = await connectionManager.executeWithRetry(operation);

      assert.strictEqual(result, 'success');
      assert.strictEqual(operation.mock.calls.length, 1);
      assert.strictEqual(mockSetTimeout.mock.calls.length, 0); // No retries
    });

    it('should retry and succeed on 2nd attempt', async () => {
      let attemptCount = 0;
      const operation = mock.fn(async () => {
        attemptCount++;
        if (attemptCount === 1) {
          throw createConnectionError('ECONNREFUSED', 'Connection refused');
        }
        return 'success';
      });

      const result = await connectionManager.executeWithRetry(operation);

      assert.strictEqual(result, 'success');
      assert.strictEqual(operation.mock.calls.length, 2);
      assert.strictEqual(mockSetTimeout.mock.calls.length, 1); // 1 retry
    });

    it('should retry and succeed on 3rd attempt', async () => {
      let attemptCount = 0;
      const operation = mock.fn(async () => {
        attemptCount++;
        if (attemptCount <= 2) {
          throw new Error('Connection lost to database');
        }
        return 'success';
      });

      const result = await connectionManager.executeWithRetry(operation);

      assert.strictEqual(result, 'success');
      assert.strictEqual(operation.mock.calls.length, 3);
      assert.strictEqual(mockSetTimeout.mock.calls.length, 2); // 2 retries
    });

    it('should call process.exit(1) after max retries exceeded', async () => {
      const operation = mock.fn(async () => {
        throw createConnectionError('ECONNREFUSED', 'Connection refused');
      });

      try {
        await connectionManager.executeWithRetry(operation);
        assert.fail('Should have thrown error from process.exit');
      } catch (error: any) {
        assert.strictEqual(error.message, 'process.exit called');
        assert.strictEqual(processExitCalled, true);
        assert.strictEqual(processExitCode, 1);
        assert.strictEqual(operation.mock.calls.length, 6); // Initial + 5 retries
        assert.strictEqual(mockSetTimeout.mock.calls.length, 5); // 5 retries
      }
    });

    it('should throw non-connection errors immediately without retry', async () => {
      const operation = mock.fn(async () => {
        throw new Error('Validation error: Invalid data');
      });

      await assert.rejects(
        async () => await connectionManager.executeWithRetry(operation),
        {
          name: 'Error',
          message: 'Validation error: Invalid data',
        }
      );

      assert.strictEqual(operation.mock.calls.length, 1);
      assert.strictEqual(mockSetTimeout.mock.calls.length, 0); // No retries
      assert.strictEqual(processExitCalled, false);
    });

    it('should reset retryCount to 0 after successful operation', async () => {
      let callCount = 0;

      const result1 = await connectionManager.executeWithRetry(async () => {
        callCount++;
        if (callCount === 1) {
          throw createConnectionError('ECONNREFUSED');
        }
        return 'success1';
      });

      assert.strictEqual(result1, 'success1');
      assert.strictEqual(callCount, 2); // First failed, second succeeded

      // Second operation should start fresh (no accumulated retries)
      const result2 = await connectionManager.executeWithRetry(async () => 'success2');

      assert.strictEqual(result2, 'success2');
    });

    it('should use exponential backoff delays', async () => {
      const delays: number[] = [];
      const mockSetTimeoutWithTracking = mock.fn((callback: () => void, delay: number) => {
        delays.push(delay);
        callback();
        return {} as NodeJS.Timeout;
      });
      global.setTimeout = mockSetTimeoutWithTracking as any;

      let attemptCount = 0;

      await connectionManager.executeWithRetry(async () => {
        attemptCount++;
        if (attemptCount <= 3) {
          throw createConnectionError('ETIMEDOUT');
        }
        return 'success';
      });

      // Verify exponential backoff: 1000ms, 2000ms, 4000ms
      assert.strictEqual(delays.length, 3);
      assert.strictEqual(delays[0], 1000); // 1s
      assert.strictEqual(delays[1], 2000); // 2s
      assert.strictEqual(delays[2], 4000); // 4s
    });
  });

  describe('isConnectionError', () => {
    it('should detect ECONNREFUSED errors', async () => {
      let attemptCount = 0;

      const result = await connectionManager.executeWithRetry(async () => {
        attemptCount++;
        if (attemptCount === 1) {
          throw createConnectionError('ECONNREFUSED', 'Connection refused');
        }
        return 'success';
      });

      assert.strictEqual(result, 'success');
      assert.strictEqual(attemptCount, 2);
      assert.strictEqual(mockSetTimeout.mock.calls.length, 1); // Retry occurred
    });

    it('should detect ENOTFOUND errors', async () => {
      let attemptCount = 0;

      const result = await connectionManager.executeWithRetry(async () => {
        attemptCount++;
        if (attemptCount === 1) {
          throw createConnectionError('ENOTFOUND', 'Host not found');
        }
        return 'success';
      });

      assert.strictEqual(result, 'success');
      assert.strictEqual(attemptCount, 2);
      assert.strictEqual(mockSetTimeout.mock.calls.length, 1); // Retry occurred
    });

    it('should detect ETIMEDOUT errors', async () => {
      let attemptCount = 0;

      const result = await connectionManager.executeWithRetry(async () => {
        attemptCount++;
        if (attemptCount === 1) {
          throw createConnectionError('ETIMEDOUT', 'Connection timed out');
        }
        return 'success';
      });

      assert.strictEqual(result, 'success');
      assert.strictEqual(attemptCount, 2);
      assert.strictEqual(mockSetTimeout.mock.calls.length, 1); // Retry occurred
    });

    it('should detect ECONNRESET errors', async () => {
      let attemptCount = 0;

      const result = await connectionManager.executeWithRetry(async () => {
        attemptCount++;
        if (attemptCount === 1) {
          throw createConnectionError('ECONNRESET', 'Connection reset by peer');
        }
        return 'success';
      });

      assert.strictEqual(result, 'success');
      assert.strictEqual(attemptCount, 2);
      assert.strictEqual(mockSetTimeout.mock.calls.length, 1); // Retry occurred
    });

    it('should detect "Connection lost" errors', async () => {
      let attemptCount = 0;

      const result = await connectionManager.executeWithRetry(async () => {
        attemptCount++;
        if (attemptCount === 1) {
          throw new Error('Connection lost to MySQL server');
        }
        return 'success';
      });

      assert.strictEqual(result, 'success');
      assert.strictEqual(attemptCount, 2);
      assert.strictEqual(mockSetTimeout.mock.calls.length, 1); // Retry occurred
    });

    it('should detect "Lost connection" errors', async () => {
      let attemptCount = 0;

      const result = await connectionManager.executeWithRetry(async () => {
        attemptCount++;
        if (attemptCount === 1) {
          throw new Error('Lost connection to database during query');
        }
        return 'success';
      });

      assert.strictEqual(result, 'success');
      assert.strictEqual(attemptCount, 2);
      assert.strictEqual(mockSetTimeout.mock.calls.length, 1); // Retry occurred
    });

    it('should NOT detect non-connection errors', async () => {
      const errors = [
        'Validation error',
        'NOT NULL constraint failed',
        'FOREIGN KEY constraint failed',
        'UNIQUE constraint failed',
        'Syntax error',
      ];

      for (const errorMsg of errors) {
        const operation = mock.fn(async () => {
          throw new Error(errorMsg);
        });

        await assert.rejects(
          async () => await connectionManager.executeWithRetry(operation),
          {
            message: errorMsg,
          }
        );

        assert.strictEqual(mockSetTimeout.mock.calls.length, 0); // No retries
      }
    });
  });

  describe('retry behavior', () => {
    it('should maintain retry count across failed attempts', async () => {
      const delays: number[] = [];
      const mockSetTimeoutWithTracking = mock.fn((callback: () => void, delay: number) => {
        delays.push(delay);
        callback();
        return {} as NodeJS.Timeout;
      });
      global.setTimeout = mockSetTimeoutWithTracking as any;

      try {
        await connectionManager.executeWithRetry(async () => {
          throw createConnectionError('ECONNREFUSED');
        });
      } catch (error: any) {
        assert.strictEqual(error.message, 'process.exit called');
      }

      // Should have delays: 1000, 2000, 4000, 8000, 16000
      assert.strictEqual(delays.length, 5);
      assert.strictEqual(delays[0], 1000);
      assert.strictEqual(delays[1], 2000);
      assert.strictEqual(delays[2], 4000);
      assert.strictEqual(delays[3], 8000);
      assert.strictEqual(delays[4], 16000);
    });

    it('should reset retry count to 0 only after successful operation', async () => {
      let attemptCount = 0;

      await connectionManager.executeWithRetry(async () => {
        attemptCount++;
        if (attemptCount <= 2) {
          throw createConnectionError('ECONNREFUSED');
        }
        return 'success';
      });

      assert.strictEqual(attemptCount, 3); // 2 failures + 1 success

      // After success, next operation should not have accumulated retries
      await connectionManager.executeWithRetry(async () => 'immediate success');
    });

    it('should handle mixed success and failure operations', async () => {
      // Operation 1: Succeeds on 2nd attempt
      let attempt1 = 0;

      const result1 = await connectionManager.executeWithRetry(async () => {
        attempt1++;
        if (attempt1 === 1) throw createConnectionError('ECONNREFUSED');
        return 'op1 success';
      });

      assert.strictEqual(result1, 'op1 success');
      assert.strictEqual(attempt1, 2);

      // Operation 2: Immediate success
      const result2 = await connectionManager.executeWithRetry(async () => 'op2 success');
      assert.strictEqual(result2, 'op2 success');

      // Operation 3: Succeeds on 3rd attempt
      let attempt3 = 0;

      const result3 = await connectionManager.executeWithRetry(async () => {
        attempt3++;
        if (attempt3 <= 2) throw new Error('Connection lost');
        return 'op3 success';
      });

      assert.strictEqual(result3, 'op3 success');
      assert.strictEqual(attempt3, 3);
    });
  });

  describe('edge cases', () => {
    it('should handle operations that return undefined', async () => {
      const operation = mock.fn(async () => undefined);

      const result = await connectionManager.executeWithRetry(operation);

      assert.strictEqual(result, undefined);
      assert.strictEqual(operation.mock.calls.length, 1);
    });

    it('should handle operations that return null', async () => {
      const operation = mock.fn(async () => null);

      const result = await connectionManager.executeWithRetry(operation);

      assert.strictEqual(result, null);
      assert.strictEqual(operation.mock.calls.length, 1);
    });

    it('should handle operations that return complex objects', async () => {
      const complexObject = {
        id: 123,
        data: { nested: 'value' },
        array: [1, 2, 3],
      };

      const operation = mock.fn(async () => complexObject);

      const result = await connectionManager.executeWithRetry(operation);

      assert.deepStrictEqual(result, complexObject);
      assert.strictEqual(operation.mock.calls.length, 1);
    });

    it('should handle errors without message property', async () => {
      let attemptCount = 0;

      const result = await connectionManager.executeWithRetry(async () => {
        attemptCount++;
        if (attemptCount === 1) {
          throw { code: 'ECONNREFUSED' }; // Error object without message
        }
        return 'success';
      });

      assert.strictEqual(result, 'success');
      assert.strictEqual(attemptCount, 2);
      assert.strictEqual(mockSetTimeout.mock.calls.length, 1); // Retry occurred
    });

    it('should handle string errors (not Error objects)', async () => {
      let attemptCount = 0;

      const result = await connectionManager.executeWithRetry(async () => {
        attemptCount++;
        if (attemptCount === 1) {
          throw 'Connection lost to server'; // String that matches pattern
        }
        return 'success';
      });

      assert.strictEqual(result, 'success');
      assert.strictEqual(attemptCount, 2);
      assert.strictEqual(mockSetTimeout.mock.calls.length, 1); // Retry occurred
    });
  });
});
