/**
 * Force WAL checkpoint to flush pending transactions to main database file
 * Uses TRUNCATE mode for complete flush - useful before git commits
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter } from '../../../database.js';
import connectionManager from '../../../utils/connection-manager.js';
import { validateActionParams } from '../../../utils/parameter-validator.js';
import type { FlushWALResponse } from '../types.js';

/**
 * Force WAL checkpoint to flush pending transactions to main database file
 *
 * @param adapter - Optional database adapter (for testing)
 * @returns Checkpoint result with pages flushed
 */
export async function flushWAL(
  adapter?: DatabaseAdapter
): Promise<FlushWALResponse> {
  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  try {
    // Validate parameters
    validateActionParams('stats', 'flush', {});

    return await connectionManager.executeWithRetry(async () => {
      // Execute TRUNCATE checkpoint - most aggressive mode
      // Blocks until complete, ensures all WAL data written to main DB file
      // Returns array: [[busy, log, checkpointed]]
      // - busy: number of frames not checkpointed due to locks
      // - log: total number of frames in WAL file
      // - checkpointed: number of frames checkpointed
      const result = await knex.raw('PRAGMA wal_checkpoint(TRUNCATE)') as any;

      // Parse result array format from Knex
      const pagesFlushed = result?.[0]?.[0]?.[2] || 0;

      return {
        success: true,
        mode: 'TRUNCATE',
        pages_flushed: pagesFlushed,
        message: `WAL checkpoint completed successfully. ${pagesFlushed} pages flushed to main database file.`
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to flush WAL: ${message}`);
  }
}
