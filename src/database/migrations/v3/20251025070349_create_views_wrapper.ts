/**
 * Create database views (kept for v3.8.x compatibility)
 *
 * NOTE: These views will be dropped by migration 20251118000000_eliminate_views_v3_9_0.ts
 *
 * For fresh v3.9.0+ installs: Views created then immediately dropped (harmless)
 * For v3.8.x upgrades: Views exist, then get dropped (correct upgrade path)
 *
 * Do NOT remove this migration - it's required for upgrade compatibility.
 */

import type { Knex } from "knex";
import { UniversalKnex } from "../../utils/universal-knex.js";

export async function up(knex: Knex): Promise<void> {
  try {
    const db = new UniversalKnex(knex);

    // Use wrapper's database-agnostic timestamp helper
    const nowTs = db.nowTimestamp();

    console.log(`✅ Creating views for ${db.isMySQL ? 'MySQL' : db.isPostgreSQL ? 'PostgreSQL' : 'SQLite'}...`);

    // Tagged Decisions
    console.log('Creating v_tagged_decisions...');
    await db.createViewSafe('v_tagged_decisions', `
    SELECT
        k.key,
        d.value,
        d.version,
        CASE d.status WHEN 1 THEN 'active' WHEN 2 THEN 'deprecated' ELSE 'draft' END as status,
        l.name as layer,
        (SELECT ${db.stringAgg('t2.name', ',')} FROM t_decision_tags dt2
         JOIN m_tags t2 ON dt2.tag_id = t2.id
         WHERE dt2.decision_key_id = d.key_id) as tags,
        (SELECT ${db.stringAgg('s2.name', ',')} FROM t_decision_scopes ds2
         JOIN m_scopes s2 ON ds2.scope_id = s2.id
         WHERE ds2.decision_key_id = d.key_id) as scopes,
        a.name as decided_by,
        ${db.dateFunction('d.ts')} as updated
    FROM t_decisions d
    JOIN m_context_keys k ON d.key_id = k.id
    LEFT JOIN m_layers l ON d.layer_id = l.id
    LEFT JOIN m_agents a ON d.agent_id = a.id
  `);

  // Active Context (Last Hour, Active Only)
  await db.createViewSafe('v_active_context', `
    SELECT
        k.key,
        d.value,
        d.version,
        l.name as layer,
        a.name as decided_by,
        ${db.dateFunction('d.ts')} as updated
    FROM t_decisions d
    JOIN m_context_keys k ON d.key_id = k.id
    LEFT JOIN m_layers l ON d.layer_id = l.id
    LEFT JOIN m_agents a ON d.agent_id = a.id
    WHERE d.status = 1 AND d.ts > ${nowTs} - 3600
    ORDER BY d.ts DESC
  `);

  // Layer Summary
  await db.createViewSafe('v_layer_summary', `
    SELECT
        l.name as layer,
        COUNT(DISTINCT d.key_id) as decisions_count,
        COUNT(DISTINCT fc.id) as file_changes_count,
        COUNT(DISTINCT c.id) as constraints_count
    FROM m_layers l
    LEFT JOIN t_decisions d ON l.id = d.layer_id AND d.status = 1
    LEFT JOIN t_file_changes fc ON l.id = fc.layer_id AND fc.ts > ${nowTs} - 3600
    LEFT JOIN t_constraints c ON l.id = c.layer_id AND c.active = ${db.boolTrue()}
    GROUP BY l.id
  `);

  // Unread Messages by Priority
  await db.createViewSafe('v_unread_messages_by_priority', `
    SELECT
        a.name as agent,
        CASE m.priority WHEN 4 THEN 'critical' WHEN 3 THEN 'high' WHEN 2 THEN 'medium' ELSE 'low' END as priority,
        COUNT(*) as count
    FROM t_agent_messages m
    JOIN m_agents a ON m.to_agent_id = a.id
    WHERE m.read = ${db.boolFalse()}
    GROUP BY a.name, m.priority
    ORDER BY m.priority DESC
  `);

  // Recent File Changes
  await db.createViewSafe('v_recent_file_changes', `
    SELECT
        f.path,
        a.name as changed_by,
        l.name as layer,
        CASE fc.change_type WHEN 1 THEN 'created' WHEN 2 THEN 'modified' ELSE 'deleted' END as change_type,
        fc.description,
        ${db.dateFunction('fc.ts')} as changed_at
    FROM t_file_changes fc
    JOIN m_files f ON fc.file_id = f.id
    JOIN m_agents a ON fc.agent_id = a.id
    LEFT JOIN m_layers l ON fc.layer_id = l.id
    WHERE fc.ts > ${nowTs} - 3600
    ORDER BY fc.ts DESC
  `);

  // Tagged Constraints
  await db.createViewSafe('v_tagged_constraints', `
    SELECT
        c.id,
        cc.name as category,
        l.name as layer,
        c.constraint_text,
        CASE c.priority WHEN 4 THEN 'critical' WHEN 3 THEN 'high' WHEN 2 THEN 'medium' ELSE 'low' END as priority,
        (SELECT ${db.stringAgg('t2.name', ',')} FROM t_constraint_tags ct2
         JOIN m_tags t2 ON ct2.tag_id = t2.id
         WHERE ct2.constraint_id = c.id) as tags,
        a.name as created_by,
        ${db.dateFunction('c.ts')} as created_at
    FROM t_constraints c
    JOIN m_constraint_categories cc ON c.category_id = cc.id
    LEFT JOIN m_layers l ON c.layer_id = l.id
    LEFT JOIN m_agents a ON c.agent_id = a.id
    WHERE c.active = ${db.boolTrue()}
    ORDER BY c.priority DESC, cc.name, c.ts DESC
  `);

  // Task Board View
  await db.createViewSafe('v_task_board', `
    SELECT
        t.id as task_id,
        t.title,
        s.name as status,
        CASE t.priority
          WHEN 1 THEN 'low'
          WHEN 2 THEN 'medium'
          WHEN 3 THEN 'high'
          ELSE 'critical'
        END as priority,
        a.name as assigned_to,
        l.name as layer,
        ${db.dateFunction('t.created_ts')} as created,
        ${db.dateFunction('t.updated_ts')} as updated,
        (SELECT ${db.stringAgg('tg2.name', ',')}
         FROM t_task_tags tt2
         JOIN m_tags tg2 ON tt2.tag_id = tg2.id
         WHERE tt2.task_id = t.id) as tags
    FROM t_tasks t
    LEFT JOIN m_task_statuses s ON t.status_id = s.id
    LEFT JOIN m_agents a ON t.assigned_agent_id = a.id
    LEFT JOIN m_layers l ON t.layer_id = l.id
  `);

    console.log('✅ Views created successfully (will be dropped in v3.9.0 migration)');
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    console.error('Full error:', error);
    throw error; // Re-throw to let Knex handle it
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP VIEW IF EXISTS v_task_board');
  await knex.raw('DROP VIEW IF EXISTS v_tagged_constraints');
  await knex.raw('DROP VIEW IF EXISTS v_recent_file_changes');
  await knex.raw('DROP VIEW IF EXISTS v_unread_messages_by_priority');
  await knex.raw('DROP VIEW IF EXISTS v_layer_summary');
  await knex.raw('DROP VIEW IF EXISTS v_active_context');
  await knex.raw('DROP VIEW IF EXISTS v_tagged_decisions');

  console.log('✅ Views dropped successfully');
}
