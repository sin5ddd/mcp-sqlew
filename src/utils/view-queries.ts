// src/utils/view-queries.ts
import { Knex } from 'knex';

/**
 * View query functions - replacements for SQL views
 * These provide portable query builders that work across databases
 */

/**
 * v_tagged_decisions - Decisions with metadata (tags, layers, scopes)
 */
export async function getTaggedDecisions(knex: Knex): Promise<any[]> {
  // Use subqueries for tag/scope aggregation (SQLite GROUP_CONCAT)
  const result = await knex('t_decisions as d')
    .join('m_context_keys as k', 'd.key_id', 'k.id')
    .leftJoin('m_layers as l', 'd.layer_id', 'l.id')
    .leftJoin('m_agents as a', 'd.agent_id', 'a.id')
    .select([
      'k.key',
      'd.value',
      'd.version',
      knex.raw(`CASE d.status
        WHEN 1 THEN 'active'
        WHEN 2 THEN 'deprecated'
        ELSE 'draft'
      END as status`),
      'l.name as layer',
      'a.name as decided_by',
      knex.raw(`datetime(d.ts, 'unixepoch') as updated`),
      // Tags subquery
      knex.raw(`(
        SELECT GROUP_CONCAT(t2.name, ',')
        FROM t_decision_tags dt2
        JOIN m_tags t2 ON dt2.tag_id = t2.id
        WHERE dt2.decision_key_id = d.key_id
      ) as tags`),
      // Scopes subquery
      knex.raw(`(
        SELECT GROUP_CONCAT(s2.name, ',')
        FROM t_decision_scopes ds2
        JOIN m_scopes s2 ON ds2.scope_id = s2.id
        WHERE ds2.decision_key_id = d.key_id
      ) as scopes`),
    ]);

  return result;
}

/**
 * v_active_context - Recently active decisions (last hour)
 */
export async function getActiveContext(knex: Knex): Promise<any[]> {
  const oneHourAgo = knex.raw('unixepoch() - 3600');

  return knex('t_decisions as d')
    .join('m_context_keys as k', 'd.key_id', 'k.id')
    .leftJoin('m_layers as l', 'd.layer_id', 'l.id')
    .leftJoin('m_agents as a', 'd.agent_id', 'a.id')
    .where('d.ts', '>=', oneHourAgo)
    .andWhere('d.status', 1) // active only
    .select([
      'k.key',
      'd.value',
      'd.version',
      'l.name as layer',
      'a.name as decided_by',
      knex.raw(`datetime(d.ts, 'unixepoch') as updated`),
    ])
    .orderBy('d.ts', 'desc');
}

/**
 * v_layer_summary - Aggregated stats per layer
 */
export async function getLayerSummary(knex: Knex): Promise<any[]> {
  const oneHourAgo = knex.raw('unixepoch() - 3600');

  return knex('m_layers as l')
    .leftJoin('t_decisions as d', 'l.id', 'd.layer_id')
    .leftJoin('t_constraints as c', 'l.id', 'c.layer_id')
    .leftJoin('t_file_changes as f', 'l.id', 'f.layer_id')
    .select([
      'l.name as layer',
      knex.raw('COUNT(DISTINCT d.key_id) as decision_count'),
      knex.raw('COUNT(DISTINCT CASE WHEN c.active = 1 THEN c.id END) as constraint_count'),
      knex.raw(`COUNT(DISTINCT CASE WHEN f.ts >= ${oneHourAgo.toQuery()} THEN f.id END) as recent_changes`),
    ])
    .groupBy('l.id', 'l.name')
    .orderBy('l.name');
}

/**
 * v_unread_messages_by_priority - Unread messages grouped by priority
 */
export async function getUnreadMessagesByPriority(knex: Knex): Promise<any[]> {
  return knex('t_agent_messages as m')
    .leftJoin('m_agents as a', 'm.from_agent_id', 'a.id')
    .where('m.read', false)
    .select([
      knex.raw(`CASE m.priority
        WHEN 1 THEN 'low'
        WHEN 2 THEN 'medium'
        WHEN 3 THEN 'high'
        ELSE 'critical'
      END as priority`),
      'm.message',
      'a.name as from_agent',
      knex.raw(`datetime(m.ts, 'unixepoch') as sent_at`),
    ])
    .orderBy('m.priority', 'desc')
    .orderBy('m.ts', 'desc');
}

/**
 * v_recent_file_changes - Recent file changes with layer info
 */
export async function getRecentFileChanges(knex: Knex): Promise<any[]> {
  const oneHourAgo = knex.raw('unixepoch() - 3600');

  return knex('t_file_changes as fc')
    .join('m_files as f', 'fc.file_id', 'f.id')
    .leftJoin('m_layers as l', 'fc.layer_id', 'l.id')
    .leftJoin('m_agents as a', 'fc.agent_id', 'a.id')
    .where('fc.ts', '>=', oneHourAgo)
    .select([
      'f.path',
      knex.raw(`CASE fc.change_type
        WHEN 1 THEN 'created'
        WHEN 2 THEN 'modified'
        ELSE 'deleted'
      END as change_type`),
      'l.name as layer',
      'a.name as changed_by',
      'fc.description',
      knex.raw(`datetime(fc.ts, 'unixepoch') as changed_at`),
    ])
    .orderBy('fc.ts', 'desc');
}

/**
 * v_tagged_constraints - Active constraints with tags
 */
export async function getTaggedConstraints(knex: Knex): Promise<any[]> {
  return knex('t_constraints as c')
    .join('m_constraint_categories as cat', 'c.category_id', 'cat.id')
    .leftJoin('m_layers as l', 'c.layer_id', 'l.id')
    .leftJoin('m_agents as a', 'c.agent_id', 'a.id')
    .where('c.active', true)
    .select([
      'cat.name as category',
      'c.constraint_text',
      knex.raw(`CASE c.priority
        WHEN 1 THEN 'low'
        WHEN 2 THEN 'medium'
        WHEN 3 THEN 'high'
        ELSE 'critical'
      END as priority`),
      'l.name as layer',
      'a.name as added_by',
      knex.raw(`datetime(c.ts, 'unixepoch') as added_at`),
      // Tags subquery
      knex.raw(`(
        SELECT GROUP_CONCAT(t2.name, ',')
        FROM t_constraint_tags ct2
        JOIN m_tags t2 ON ct2.tag_id = t2.id
        WHERE ct2.constraint_id = c.id
      ) as tags`),
    ])
    .orderBy('c.priority', 'desc')
    .orderBy('c.ts', 'desc');
}

/**
 * v_task_board - Metadata-only task queries (v3.0.0)
 */
export async function getTaskBoard(knex: Knex): Promise<any[]> {
  return knex('t_tasks as t')
    .join('m_task_statuses as ts', 't.status_id', 'ts.id')
    .leftJoin('m_layers as l', 't.layer_id', 'l.id')
    .leftJoin('m_agents as a', 't.assigned_agent_id', 'a.id')
    .select([
      't.id as task_id',
      't.title',
      'ts.name as status',
      knex.raw(`CASE t.priority
        WHEN 1 THEN 'low'
        WHEN 2 THEN 'medium'
        WHEN 3 THEN 'high'
        ELSE 'critical'
      END as priority`),
      'l.name as layer',
      'a.name as assigned_to',
      knex.raw(`datetime(t.created_ts, 'unixepoch') as created`),
      knex.raw(`datetime(t.updated_ts, 'unixepoch') as updated`),
      // Tags subquery
      knex.raw(`(
        SELECT GROUP_CONCAT(tag.name, ',')
        FROM t_task_tags tt
        JOIN m_tags tag ON tt.tag_id = tag.id
        WHERE tt.task_id = t.id
      ) as tags`),
    ])
    .orderBy('t.priority', 'desc')
    .orderBy('t.updated_ts', 'desc');
}
