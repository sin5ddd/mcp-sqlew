/**
 * Database adapter factory module
 */

import type { DatabaseAdapter } from '../../adapters/index.js';
import { getAdapterInstance } from '../initialization/init.js';

/**
 * Get current database adapter
 */
export function getAdapter(): DatabaseAdapter {
  const adapterInstance = getAdapterInstance();
  if (!adapterInstance) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return adapterInstance;
}

/**
 * Backwards compatibility alias for getAdapter
 */
export function getDatabase(): DatabaseAdapter {
  return getAdapter();
}
