import type { Knex } from 'knex';

/**
 * Migration: Drop Orphaned Message View
 *
 * Drops v_unread_messages_by_priority view which references the dropped
 * t_agent_messages table (removed in 20251028000000_simplify_agent_system.ts).
 *
 * This view was not dropped when the messaging system was removed in v3.6.5,
 * leaving an orphaned view that references a non-existent table.
 */

export async function up(knex: Knex): Promise<void> {
  // Drop the orphaned view that references t_agent_messages
  await knex.raw('DROP VIEW IF EXISTS v_unread_messages_by_priority');
}

export async function down(knex: Knex): Promise<void> {
  // Recreate the view (for rollback compatibility)
  await knex.raw(`
    CREATE VIEW v_unread_messages_by_priority AS
    SELECT
        a.name as agent,
        CASE m.priority WHEN 4 THEN 'critical' WHEN 3 THEN 'high' WHEN 2 THEN 'medium' ELSE 'low' END as priority,
        COUNT(*) as count
    FROM t_agent_messages m
    JOIN m_agents a ON m.to_agent_id = a.id
    WHERE m.read = 0
    GROUP BY m.to_agent_id, m.priority
    ORDER BY m.priority DESC
  `);
}
