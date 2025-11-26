/**
 * Database update operations module
 */

import { Knex } from 'knex';
import type { DatabaseAdapter } from '../../adapters/index.js';

/**
 * Update agent activity timestamp
 */
export async function updateAgentActivity(
  adapter: DatabaseAdapter,
  agentId: number,
  trx?: Knex.Transaction
): Promise<void> {
  const knex = trx || adapter.getKnex();
  const now = Math.floor(Date.now() / 1000);

  await knex('v4_agents')
    .where({ id: agentId })
    .update({ last_active_ts: now });
}
