/**
 * Database cleanup and shutdown module
 */

import { debugLog } from '../../utils/debug-logger.js';
import { getAdapterInstance, setAdapterInstance } from './init.js';
import { FileWatcher } from '../../watcher/file-watcher.js';

/**
 * Close database connection and clean up resources
 */
export async function closeDatabase(): Promise<void> {
  // Stop file watcher if running (prevents setInterval keeping process alive)
  try {
    const fileWatcher = FileWatcher.getInstance();
    if (fileWatcher) {
      await fileWatcher.stop();
      debugLog('INFO', 'File watcher stopped');
    }
  } catch (error) {
    // File watcher might not be initialized, that's okay
    debugLog('DEBUG', 'File watcher cleanup skipped (not initialized)');
  }

  // Close database connection
  const adapterInstance = getAdapterInstance();
  if (adapterInstance) {
    await adapterInstance.disconnect();
    setAdapterInstance(null);
    debugLog('INFO', 'Database connection closed');
  }
}
