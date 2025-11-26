/**
 * Database update operations module
 */

import { Knex } from 'knex';
import type { DatabaseAdapter } from '../../adapters/index.js';

/**
 * Update agent activity timestamp
 * @deprecated Agent tracking removed in v4.0
 */
export async function updateAgentActivity(
  _adapter: DatabaseAdapter,
  _agentId: number,
  _trx?: Knex.Transaction
): Promise<void> {
  // Agent tracking removed in v4.0 - no-op
}
