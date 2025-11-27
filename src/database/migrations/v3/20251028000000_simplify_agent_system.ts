/**
 * Converted from: src/config/knex/enhancements/20251028000000_simplify_agent_system.ts
 * Line count: 66 → 48 (27% reduction)
 *
 * Migration: Simplify Agent System (v3.6.5)
 *
 * Removes unused messaging system. Agent pooling columns (in_use, is_reusable)
 * are left in schema but ignored by application code for backward compatibility.
 *
 * Changes:
 * - Drops t_agent_messages table (messaging system unused)
 * - Code no longer uses in_use/is_reusable columns (but columns remain in DB)
 *
 * Benefits:
 * - Eliminates agent pooling race conditions
 * - Removes UNIQUE constraint errors
 * - Simplifies agent management to basic name registry
 * - Maintains cross-RDBMS compatibility without raw SQL
 *
 * Note: Columns in_use and is_reusable are deprecated but left in m_agents table
 * for backward compatibility and to avoid complex SQLite FK constraint handling.
 */

import type { Knex } from 'knex';
import { UniversalKnex } from '../../utils/universal-knex.js';

export async function up(knex: Knex): Promise<void> {
  const db = new UniversalKnex(knex);

  // Drop t_agent_messages table (messaging system not used)
  // PostgreSQL requires CASCADE when dropping tables with foreign key dependencies
  if (db.isPostgreSQL) {
    await knex.raw('DROP TABLE IF EXISTS t_agent_messages CASCADE');
  } else {
    await knex.schema.dropTableIfExists('t_agent_messages');
  }

  // Note: in_use and is_reusable columns remain in m_agents table but are ignored by code
  // Dropping these columns would require complex table recreation on SQLite due to FK constraints
  // This approach maintains cross-RDBMS compatibility without raw SQL
}

export async function down(knex: Knex): Promise<void> {
  const db = new UniversalKnex(knex);

  // Recreate t_agent_messages table
  await db.createTableSafe('t_agent_messages', (table) => {
    table.increments('id').primary();
    table.integer('from_agent_id').references('id').inTable('m_agents');
    table.integer('to_agent_id').references('id').inTable('m_agents');
    table.integer('msg_type').notNullable();
    table.integer('priority').defaultTo(2);
    table.text('message').notNullable();
    table.text('payload');
    table.boolean('read').defaultTo(false);
    table.integer('ts').notNullable();
    table.index('ts', 'idx_agent_messages_ts');
    table.index(['to_agent_id', 'read'], 'idx_agent_messages_to_unread');
  });

  // Note: in_use and is_reusable columns were not dropped, so no need to restore
}
