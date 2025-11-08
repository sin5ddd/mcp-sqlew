/**
 * Database cleanup and shutdown module
 */

import { debugLog } from '../../utils/debug-logger.js';
import { getAdapterInstance, setAdapterInstance } from './init.js';

/**
 * Close database connection
 */
export async function closeDatabase(): Promise<void> {
  const adapterInstance = getAdapterInstance();
  if (adapterInstance) {
    await adapterInstance.disconnect();
    setAdapterInstance(null);
    debugLog('INFO', 'Database connection closed');
  }
}
