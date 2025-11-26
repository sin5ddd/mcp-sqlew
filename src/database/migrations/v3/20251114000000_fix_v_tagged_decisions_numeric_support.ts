/**
 * Converted from: src/config/knex/enhancements/20251114000000_fix_v_tagged_decisions_numeric_support.ts
 * Line count: 104 → 82 (21% reduction)
 *
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
import { UniversalKnex } from '../../utils/universal-knex.js';

export async function up(knex: Knex): Promise<void> {
  const db = new UniversalKnex(knex);
  console.log('🔄 Updating v_tagged_decisions view to support numeric decisions...');

  // Database-specific CAST syntax for numeric to string conversion
  // - PostgreSQL: CAST(... AS TEXT)
  // - MySQL/MariaDB: CAST(... AS CHAR)
  // - SQLite: No CAST needed (accepts mixed types)
  const castNumericToText = db.isPostgreSQL ? 'CAST(dn.value AS TEXT)' :
                           db.isSQLite ? 'dn.value' :
                           'CAST(dn.value AS CHAR)'; // MySQL/MariaDB

  // Database-specific string aggregation
  const stringAgg = db.stringAgg('t2.name', ',');

  // Database-specific timestamp conversion
  const timestampConv = db.dateFunction('d.ts');

  // Drop and recreate view with numeric support
  await db.createViewSafe('v_tagged_decisions', `
    SELECT
        k.key,
        COALESCE(NULLIF(d.value, ''), ${castNumericToText}) as value,
        d.version,
        CASE d.status WHEN 1 THEN 'active' WHEN 2 THEN 'deprecated' ELSE 'draft' END as status,
        d.project_id,
        l.name as layer,
        (SELECT ${stringAgg} FROM t_decision_tags dt2
         JOIN m_tags t2 ON dt2.tag_id = t2.id
         WHERE dt2.decision_key_id = d.key_id AND dt2.project_id = d.project_id) as tags,
        (SELECT ${db.stringAgg('s2.name', ',')} FROM t_decision_scopes ds2
         JOIN m_scopes s2 ON ds2.scope_id = s2.id
         WHERE ds2.decision_key_id = d.key_id AND ds2.project_id = d.project_id) as scopes,
        a.name as decided_by,
        ${timestampConv} as updated
    FROM t_decisions d
    JOIN m_context_keys k ON d.key_id = k.id
    LEFT JOIN m_layers l ON d.layer_id = l.id
    LEFT JOIN m_agents a ON d.agent_id = a.id
    LEFT JOIN t_decisions_numeric dn ON dn.key_id = d.key_id AND dn.project_id = d.project_id
  `);

  console.log('✅ v_tagged_decisions view updated with numeric support');
}

export async function down(knex: Knex): Promise<void> {
  const db = new UniversalKnex(knex);
  console.log('🔄 Reverting v_tagged_decisions view to original...');

  const stringAgg = db.stringAgg('t2.name', ',');
  const timestampConv = db.dateFunction('d.ts');

  // Recreate original view (without numeric support)
  await db.createViewSafe('v_tagged_decisions', `
    SELECT
        k.key,
        d.value,
        d.version,
        CASE d.status WHEN 1 THEN 'active' WHEN 2 THEN 'deprecated' ELSE 'draft' END as status,
        d.project_id,
        l.name as layer,
        (SELECT ${stringAgg} FROM t_decision_tags dt2
         JOIN m_tags t2 ON dt2.tag_id = t2.id
         WHERE dt2.decision_key_id = d.key_id AND dt2.project_id = d.project_id) as tags,
        (SELECT ${db.stringAgg('s2.name', ',')} FROM t_decision_scopes ds2
         JOIN m_scopes s2 ON ds2.scope_id = s2.id
         WHERE ds2.decision_key_id = d.key_id AND ds2.project_id = d.project_id) as scopes,
        a.name as decided_by,
        ${timestampConv} as updated
    FROM t_decisions d
    JOIN m_context_keys k ON d.key_id = k.id
    LEFT JOIN m_layers l ON d.layer_id = l.id
    LEFT JOIN m_agents a ON d.agent_id = a.id
  `);

  console.log('✅ v_tagged_decisions view reverted to original');
}
