/**
 * Connection Manager for MCP Shared Context Server
 *
 * Handles runtime database connection losses with exponential backoff retry logic.
 *
 * Features:
 * - Exponential backoff: 1s, 2s, 4s, 8s, 16s (total 31 seconds)
 * - Max 5 retries before process.exit(1)
 * - Connection error detection for SQLite, MySQL, PostgreSQL
 * - Automatic retry on connection failures
 * - Success resets retry counter
 *
 * Usage:
 *   import connectionManager from './utils/connection-manager.js';
 *
 *   const result = await connectionManager.executeWithRetry(async () => {
 *     return await db.query('SELECT * FROM table');
 *   });
 */

import { debugLog } from './debug-logger.js';

/**
 * ConnectionManager class for handling database connection failures
 * with exponential backoff retry logic
 */
export class ConnectionManager {
  private retryCount = 0;
  private readonly maxRetries = 5;
  private readonly baseDelay = 1000; // 1 second

  /**
   * Execute a database operation with automatic retry on connection failure
   * @param operation - Async function to execute
   * @returns Result of the operation
   * @throws Error if non-connection error or max retries exceeded
   */
  async executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    try {
      const result = await operation();
      // Success - reset retry counter
      if (this.retryCount > 0) {
        debugLog('INFO', `Operation successful after ${this.retryCount} retries`);
        this.retryCount = 0;
      }
      return result;
    } catch (error) {
      // Check if this is a connection error
      if (this.isConnectionError(error)) {
        debugLog('WARN', 'Connection error detected', { error: error instanceof Error ? error.message : String(error) });
        return await this.retryWithBackoff(operation);
      }

      // Not a connection error - rethrow immediately
      throw error;
    }
  }

  /**
   * Retry operation with exponential backoff
   * @param operation - Async function to retry
   * @returns Result of the operation
   * @throws Error if max retries exceeded
   */
  private async retryWithBackoff<T>(operation: () => Promise<T>): Promise<T> {
    while (this.retryCount < this.maxRetries) {
      const delay = this.baseDelay * Math.pow(2, this.retryCount);
      this.retryCount++;

      debugLog(
        'WARN',
        `Connection lost, retry ${this.retryCount}/${this.maxRetries} in ${delay}ms`
      );

      // Wait for exponential backoff delay
      await new Promise(resolve => setTimeout(resolve, delay));

      try {
        const result = await operation();
        // Success - reset counter and return
        debugLog('INFO', `Connection restored after ${this.retryCount} retries`);
        this.retryCount = 0;
        return result;
      } catch (error) {
        // Check if still connection error
        if (!this.isConnectionError(error)) {
          // Different error type - reset counter and rethrow
          this.retryCount = 0;
          throw error;
        }

        // Still connection error - check if we should continue retrying
        if (this.retryCount >= this.maxRetries) {
          debugLog('ERROR', 'Max retries exceeded', {
            retries: this.retryCount,
            error: error instanceof Error ? error.message : String(error)
          });
          console.error('❌ Database connection lost. Max retries exceeded. Exiting...');
          process.exit(1);
        }

        // Continue to next retry iteration
        debugLog('DEBUG', `Retry ${this.retryCount} failed, will retry again`, {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    // Should never reach here due to process.exit(1) above
    throw new Error('Max retries exceeded');
  }

  /**
   * Detect if an error is a connection-related error
   * @param error - Error to check
   * @returns true if connection error, false otherwise
   */
  private isConnectionError(error: any): boolean {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode = (error as any)?.code;

    // Network error codes
    const networkErrorCodes = [
      'ECONNREFUSED',   // Connection refused
      'ENOTFOUND',      // DNS lookup failed
      'ETIMEDOUT',      // Connection timeout
      'ECONNRESET',     // Connection reset by peer
      'EPIPE',          // Broken pipe
      'EHOSTUNREACH',   // Host unreachable
      'ENETUNREACH',    // Network unreachable
    ];

    // Check error code
    if (errorCode && networkErrorCodes.includes(errorCode)) {
      return true;
    }

    // Connection error message patterns
    const connectionPatterns = [
      // Generic
      'connection lost',
      'lost connection',
      'connection refused',
      'connection timeout',
      'connection reset',
      'cannot connect',
      'unable to connect',
      'connection failed',
      'connection error',
      'connection closed',
      'connection terminated',

      // SQLite
      'database is locked',
      'database disk image is malformed',
      'unable to open database',
      'disk i/o error',

      // MySQL/MariaDB
      'mysql server has gone away',
      'lost connection to mysql server',
      'error connecting to mysql',
      'too many connections',
      'can\'t connect to mysql server',

      // PostgreSQL
      'connection to server was lost',
      'could not connect to server',
      'server closed the connection',
      'connection refused',
      'no route to host',
      'connection timed out',

      // Knex-specific
      'knex: timeout acquiring a connection',
      'pool is destroyed',
      'connection pool destroyed',
    ];

    const lowerMessage = errorMessage.toLowerCase();
    return connectionPatterns.some(pattern => lowerMessage.includes(pattern.toLowerCase()));
  }

  /**
   * Get current retry count (for testing/monitoring)
   */
  getRetryCount(): number {
    return this.retryCount;
  }

  /**
   * Reset retry count (for testing)
   */
  resetRetryCount(): void {
    this.retryCount = 0;
  }
}

// Singleton instance
const connectionManager = new ConnectionManager();

export default connectionManager;
