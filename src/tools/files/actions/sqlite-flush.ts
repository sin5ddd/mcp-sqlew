/**
 * Forces SQLite WAL (Write-Ahead Log) checkpoint to flush pending transactions
 * to the main database file. Essential for Git workflow to ensure .db file is
 * up-to-date before committing to version control.
 *
 * SQLite WAL Mode:
 * - Writes go to .db-wal file, not main .db file
 * - Without flush, .db file is stale, .db-wal has latest data
 * - Git commits should include up-to-date .db file for clean diffs
 *
 * Checkpoint Modes:
 * - TRUNCATE: Most aggressive, blocks until complete, ensures ALL data flushed
 * - This is the correct mode for Git workflow
 *
 * @returns FlushWALResponse with pages flushed count
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter } from '../../../database.js';
import connectionManager from '../../../utils/connection-manager.js';
import { validateActionParams } from '../../../utils/parameter-validator.js';
import type { FlushWALResponse } from '../../../types.js';

/**
 * Forces SQLite WAL checkpoint to flush pending transactions to main database file
 * SQLite-specific operation - returns error for MySQL/PostgreSQL
 *
 * @param adapter - Optional database adapter (for testing)
 * @returns Checkpoint result with pages flushed
 */
export async function sqliteFlush(
  adapter?: DatabaseAdapter
): Promise<FlushWALResponse> {
  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  try {
    // Validate parameters
    validateActionParams('file', 'sqlite_flush', {});

    // Check if using SQLite (WAL mode is SQLite-specific)
    const client = knex.client.config.client;
    if (!['better-sqlite3', 'sqlite3'].includes(client)) {
      return {
        success: false,
        mode: 'TRUNCATE',
        pages_flushed: 0,
        message: `WAL checkpoint is SQLite-specific. Current database: ${client}`
      };
    }

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
