/**
 * Migration: Fix v_tagged_decisions View to Support Numeric Decisions
 *
 * Problem:
 * - v_tagged_decisions view only queries t_decisions, not t_decisions_numeric
 * - This means numeric decisions don't appear in the view
 * - get Decision() returns wrong values for numeric decisions (empty string instead of number)
 *
 * Solution:
 * - Add LEFT JOIN to t_decisions_numeric
 * - Use COALESCE(NULLIF(d.value, ''), dn.value) to prefer numeric value over empty string
 *
 * Satisfies Constraints:
 * - Idempotent: Recreates view (DROP + CREATE)
 * - Data Preservation: N/A (view has no data)
 * - Cross-DB Compatible: Works with SQLite, MySQL, PostgreSQL
 */

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  console.log('🔄 Updating v_tagged_decisions view to support numeric decisions...');

  // Get database client type
  const client = knex.client.config.client;
  const isSQLite = client === 'better-sqlite3' || client === 'sqlite3';
  const isPostgres = client === 'pg' || client === 'postgres' || client === 'postgresql';

  // Database-specific CAST syntax for numeric to string conversion
  // - PostgreSQL: CAST(... AS TEXT)
  // - MySQL/MariaDB: CAST(... AS CHAR)
  // - SQLite: No CAST needed (accepts mixed types)
  const castNumericToText = isPostgres ? 'CAST(dn.value AS TEXT)' :
                           isSQLite ? 'dn.value' :
                           'CAST(dn.value AS CHAR)'; // MySQL/MariaDB

  // Drop existing view
  await knex.raw('DROP VIEW IF EXISTS v_tagged_decisions');

  // Recreate view with numeric support
  await knex.raw(`
    CREATE VIEW v_tagged_decisions AS
    SELECT
        k.key,
        COALESCE(NULLIF(d.value, ''), ${castNumericToText}) as value,
        d.version,
        CASE d.status WHEN 1 THEN 'active' WHEN 2 THEN 'deprecated' ELSE 'draft' END as status,
        d.project_id,
        l.name as layer,
        (SELECT ${isSQLite ? 'GROUP_CONCAT(t2.name, \',\')' : 'STRING_AGG(t2.name, \',\')'} FROM t_decision_tags dt2
         JOIN m_tags t2 ON dt2.tag_id = t2.id
         WHERE dt2.decision_key_id = d.key_id AND dt2.project_id = d.project_id) as tags,
        (SELECT ${isSQLite ? 'GROUP_CONCAT(s2.name, \',\')' : 'STRING_AGG(s2.name, \',\')'} FROM t_decision_scopes ds2
         JOIN m_scopes s2 ON ds2.scope_id = s2.id
         WHERE ds2.decision_key_id = d.key_id AND ds2.project_id = d.project_id) as scopes,
        a.name as decided_by,
        ${isSQLite ? 'datetime(d.ts, \'unixepoch\')' : 'TO_TIMESTAMP(d.ts)'} as updated
    FROM t_decisions d
    JOIN m_context_keys k ON d.key_id = k.id
    LEFT JOIN m_layers l ON d.layer_id = l.id
    LEFT JOIN m_agents a ON d.agent_id = a.id
    LEFT JOIN t_decisions_numeric dn ON dn.key_id = d.key_id AND dn.project_id = d.project_id
  `);

  console.log('✅ v_tagged_decisions view updated with numeric support');
}

export async function down(knex: Knex): Promise<void> {
  console.log('🔄 Reverting v_tagged_decisions view to original...');

  // Get database client type
  const client = knex.client.config.client;
  const isSQLite = client === 'better-sqlite3' || client === 'sqlite3';

  // Drop existing view
  await knex.raw('DROP VIEW IF EXISTS v_tagged_decisions');

  // Recreate original view (without numeric support)
  await knex.raw(`
    CREATE VIEW v_tagged_decisions AS
    SELECT
        k.key,
        d.value,
        d.version,
        CASE d.status WHEN 1 THEN 'active' WHEN 2 THEN 'deprecated' ELSE 'draft' END as status,
        d.project_id,
        l.name as layer,
        (SELECT ${isSQLite ? 'GROUP_CONCAT(t2.name, \',\')' : 'STRING_AGG(t2.name, \',\')'} FROM t_decision_tags dt2
         JOIN m_tags t2 ON dt2.tag_id = t2.id
         WHERE dt2.decision_key_id = d.key_id AND dt2.project_id = d.project_id) as tags,
        (SELECT ${isSQLite ? 'GROUP_CONCAT(s2.name, \',\')' : 'STRING_AGG(s2.name, \',\')'} FROM t_decision_scopes ds2
         JOIN m_scopes s2 ON ds2.scope_id = s2.id
         WHERE ds2.decision_key_id = d.key_id AND ds2.project_id = d.project_id) as scopes,
        a.name as decided_by,
        ${isSQLite ? 'datetime(d.ts, \'unixepoch\')' : 'TO_TIMESTAMP(d.ts)'} as updated
    FROM t_decisions d
    JOIN m_context_keys k ON d.key_id = k.id
    LEFT JOIN m_layers l ON d.layer_id = l.id
    LEFT JOIN m_agents a ON d.agent_id = a.id
  `);

  console.log('✅ v_tagged_decisions view reverted to original');
}
