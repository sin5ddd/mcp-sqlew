import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // ============================================================================
  // Token-Efficient Views (v_ prefix)
  // ============================================================================

  // Tagged Decisions (Most Efficient View)
  await knex.raw(`
    CREATE VIEW IF NOT EXISTS v_tagged_decisions AS
    SELECT
        k.key,
        d.value,
        d.version,
        CASE d.status WHEN 1 THEN 'active' WHEN 2 THEN 'deprecated' ELSE 'draft' END as status,
        l.name as layer,
        (SELECT GROUP_CONCAT(t2.name, ',') FROM t_decision_tags dt2
         JOIN m_tags t2 ON dt2.tag_id = t2.id
         WHERE dt2.decision_key_id = d.key_id) as tags,
        (SELECT GROUP_CONCAT(s2.name, ',') FROM t_decision_scopes ds2
         JOIN m_scopes s2 ON ds2.scope_id = s2.id
         WHERE ds2.decision_key_id = d.key_id) as scopes,
        a.name as decided_by,
        datetime(d.ts, 'unixepoch') as updated
    FROM t_decisions d
    JOIN m_context_keys k ON d.key_id = k.id
    LEFT JOIN m_layers l ON d.layer_id = l.id
    LEFT JOIN m_agents a ON d.agent_id = a.id
  `);

  // Active Context (Last Hour, Active Only)
  await knex.raw(`
    CREATE VIEW IF NOT EXISTS v_active_context AS
    SELECT
        k.key,
        d.value,
        d.version,
        l.name as layer,
        a.name as decided_by,
        datetime(d.ts, 'unixepoch') as updated
    FROM t_decisions d
    JOIN m_context_keys k ON d.key_id = k.id
    LEFT JOIN m_layers l ON d.layer_id = l.id
    LEFT JOIN m_agents a ON d.agent_id = a.id
    WHERE d.status = 1 AND d.ts > unixepoch() - 3600
    ORDER BY d.ts DESC
  `);

  // Layer Summary
  await knex.raw(`
    CREATE VIEW IF NOT EXISTS v_layer_summary AS
    SELECT
        l.name as layer,
        COUNT(DISTINCT d.key_id) as decisions_count,
        COUNT(DISTINCT fc.id) as file_changes_count,
        COUNT(DISTINCT c.id) as constraints_count
    FROM m_layers l
    LEFT JOIN t_decisions d ON l.id = d.layer_id AND d.status = 1
    LEFT JOIN t_file_changes fc ON l.id = fc.layer_id AND fc.ts > unixepoch() - 3600
    LEFT JOIN t_constraints c ON l.id = c.layer_id AND c.active = 1
    GROUP BY l.id
  `);

  // Unread Messages by Priority
  await knex.raw(`
    CREATE VIEW IF NOT EXISTS v_unread_messages_by_priority AS
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

  // Recent File Changes (With Layer)
  await knex.raw(`
    CREATE VIEW IF NOT EXISTS v_recent_file_changes AS
    SELECT
        f.path,
        a.name as changed_by,
        l.name as layer,
        CASE fc.change_type WHEN 1 THEN 'created' WHEN 2 THEN 'modified' ELSE 'deleted' END as change_type,
        fc.description,
        datetime(fc.ts, 'unixepoch') as changed_at
    FROM t_file_changes fc
    JOIN m_files f ON fc.file_id = f.id
    JOIN m_agents a ON fc.agent_id = a.id
    LEFT JOIN m_layers l ON fc.layer_id = l.id
    WHERE fc.ts > unixepoch() - 3600
    ORDER BY fc.ts DESC
  `);

  // Tagged Constraints
  await knex.raw(`
    CREATE VIEW IF NOT EXISTS v_tagged_constraints AS
    SELECT
        c.id,
        cc.name as category,
        l.name as layer,
        c.constraint_text,
        CASE c.priority WHEN 4 THEN 'critical' WHEN 3 THEN 'high' WHEN 2 THEN 'medium' ELSE 'low' END as priority,
        (SELECT GROUP_CONCAT(t2.name, ',') FROM t_constraint_tags ct2
         JOIN m_tags t2 ON ct2.tag_id = t2.id
         WHERE ct2.constraint_id = c.id) as tags,
        a.name as created_by,
        datetime(c.ts, 'unixepoch') as created_at
    FROM t_constraints c
    JOIN m_constraint_categories cc ON c.category_id = cc.id
    LEFT JOIN m_layers l ON c.layer_id = l.id
    LEFT JOIN m_agents a ON c.agent_id = a.id
    WHERE c.active = 1
    ORDER BY c.priority DESC, cc.name, c.ts DESC
  `);

  // Task Board View (Token-efficient)
  await knex.raw(`
    CREATE VIEW IF NOT EXISTS v_task_board AS
    SELECT
        t.id,
        t.title,
        s.name as status,
        t.priority,
        a.name as assigned_to,
        l.name as layer,
        t.created_ts,
        t.updated_ts,
        t.completed_ts,
        (SELECT GROUP_CONCAT(tg2.name, ', ')
         FROM t_task_tags tt2
         JOIN m_tags tg2 ON tt2.tag_id = tg2.id
         WHERE tt2.task_id = t.id) as tags
    FROM t_tasks t
    LEFT JOIN m_task_statuses s ON t.status_id = s.id
    LEFT JOIN m_agents a ON t.assigned_agent_id = a.id
    LEFT JOIN m_layers l ON t.layer_id = l.id
  `);

  console.log('✅ Views created successfully');
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
