/**
 * MCP Server - Shutdown Handlers
 * Graceful cleanup of resources on process termination
 */

import { closeDatabase } from '../database.js';
import { closeDebugLogger, debugLog } from '../utils/debug-logger.js';
import { FileWatcher } from '../watcher/index.js';
import { setupGlobalErrorHandlers } from '../utils/error-handler.js';

/**
 * Register signal handlers for graceful shutdown
 * Ensures database and file watcher are properly closed
 */
export function registerShutdownHandlers(): void {
  setupGlobalErrorHandlers(() => {
    debugLog('INFO', 'Shutting down gracefully');
    try {
      const watcher = FileWatcher.getInstance();
      watcher.stop();
    } catch (error) {
      // Ignore watcher errors during shutdown
    }
    closeDatabase();
    closeDebugLogger();
  });
}

/**
 * Perform cleanup on process exit
 * Should be called in catch blocks and fatal error handlers
 */
export function performCleanup(): void {
  try {
    const watcher = FileWatcher.getInstance();
    watcher.stop();
  } catch (error) {
    // Ignore watcher errors during cleanup
  }
  closeDatabase();
  closeDebugLogger();
}
