// src/utils/view-queries.ts
import { Knex } from "knex";
import { UniversalKnex } from "./universal-knex.js";

/**
 * View query functions - cross-database replacements for SQL views
 *
 * These provide portable query builders that work across SQLite, MySQL, and PostgreSQL
 * using the UniversalKnex wrapper for database-specific syntax.
 *
 * Replaces deprecated database views (v_tagged_decisions, v_task_board, etc.)
 * eliminated in v3.9.0 for better cross-database compatibility.
 */

/**
 * v_tagged_decisions - Decisions with metadata (tags, layers, scopes)
 */
export async function getTaggedDecisions(knex: Knex): Promise<any[]> {
  const db = new UniversalKnex(knex);

  // Database-specific CAST syntax for numeric to string conversion
  const castNumericToText = db.isPostgreSQL
    ? "CAST(dn.value AS TEXT)"
    : db.isSQLite
      ? "dn.value"
      : "CAST(dn.value AS CHAR)"; // MySQL/MariaDB

  // Use subqueries for tag/scope aggregation
  const result = await knex("v4_decisions as d")
    .join("v4_context_keys as k", "d.key_id", "k.id")
    .leftJoin("v4_layers as l", "d.layer_id", "l.id")
    .leftJoin("v4_agents as a", "d.agent_id", "a.id")
    .leftJoin("v4_decisions_numeric as dn", function () {
      this.on("dn.key_id", "=", "d.key_id").andOn(
        "dn.project_id",
        "=",
        "d.project_id",
      );
    })
    .select([
      "k.key_name as key",
      // Prefer numeric value over empty string
      knex.raw(`COALESCE(NULLIF(d.value, ''), ${castNumericToText}) as value`),
      "d.version",
      knex.raw(`CASE d.status
        WHEN 1 THEN 'active'
        WHEN 2 THEN 'deprecated'
        ELSE 'draft'
      END as status`),
      "l.name as layer",
      "a.name as decided_by",
      "d.project_id",
      knex.raw(`${db.dateFunction("d.ts")} as updated`),
      // Tags subquery
      knex.raw(`(
        SELECT ${db.stringAgg("t2.name", ",")}
        FROM v4_decision_tags dt2
        JOIN v4_tags t2 ON dt2.tag_id = t2.id
        WHERE dt2.decision_key_id = d.key_id
      ) as tags`),
      // Scopes subquery
      knex.raw(`(
        SELECT ${db.stringAgg("s2.name", ",")}
        FROM v4_decision_scopes ds2
        JOIN v4_scopes s2 ON ds2.scope_id = s2.id
        WHERE ds2.decision_key_id = d.key_id
      ) as scopes`),
    ]);

  return result;
}

/**
 * v_active_context - Recently active decisions (last hour)
 */
export async function getActiveContext(knex: Knex): Promise<any[]> {
  const db = new UniversalKnex(knex);
  const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;

  return knex("v4_decisions as d")
    .join("v4_context_keys as k", "d.key_id", "k.id")
    .leftJoin("v4_layers as l", "d.layer_id", "l.id")
    .leftJoin("v4_agents as a", "d.agent_id", "a.id")
    .where("d.ts", ">=", oneHourAgo)
    .andWhere("d.status", 1) // active only
    .select([
      "k.key_name as key",
      "d.value",
      "d.version",
      "l.name as layer",
      "a.name as decided_by",
      knex.raw(`${db.dateFunction("d.ts")} as updated`),
    ])
    .orderBy("d.ts", "desc");
}

/**
 * v_layer_summary - Aggregated stats per layer
 */
export async function getLayerSummary(knex: Knex): Promise<any[]> {
  const db = new UniversalKnex(knex);
  const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;

  return knex("v4_layers as l")
    .leftJoin("v4_decisions as d", function () {
      this.on("l.id", "=", "d.layer_id").andOn("d.status", "=", knex.raw("1"));
    })
    .leftJoin("v4_constraints as c", function () {
      this.on("l.id", "=", "c.layer_id").andOn(
        "c.active",
        "=",
        knex.raw(db.boolTrue().toString()),
      );
    })
    .leftJoin("v4_file_changes as f", function () {
      this.on("l.id", "=", "f.layer_id").andOn(
        "f.ts",
        ">=",
        knex.raw(oneHourAgo.toString()),
      );
    })
    .select([
      "l.name as layer",
      knex.raw("COUNT(DISTINCT d.key_id) as decision_count"),
      knex.raw("COUNT(DISTINCT c.id) as constraint_count"),
      knex.raw("COUNT(DISTINCT f.id) as recent_changes"),
    ])
    .groupBy("l.id", "l.name")
    .orderBy("l.name");
}

/**
 * v_unread_messages_by_priority - Unread messages grouped by priority
 *
 * NOTE: This function references t_agent_messages which was dropped in v3.6.5
 * Kept for backward compatibility but will fail if table doesn't exist
 */
export async function getUnreadMessagesByPriority(knex: Knex): Promise<any[]> {
  const db = new UniversalKnex(knex);

  return knex("v4_agent_messages as m")
    .leftJoin("v4_agents as a", "m.from_agent_id", "a.id")
    .where("m.read", db.boolFalse())
    .select([
      knex.raw(`CASE m.priority
        WHEN 1 THEN 'low'
        WHEN 2 THEN 'medium'
        WHEN 3 THEN 'high'
        ELSE 'critical'
      END as priority`),
      "m.message",
      "a.name as from_agent",
      knex.raw(`${db.dateFunction("m.ts")} as sent_at`),
    ])
    .orderBy("m.priority", "desc")
    .orderBy("m.ts", "desc");
}

/**
 * v_recent_file_changes - Recent file changes with layer info
 */
export async function getRecentFileChanges(knex: Knex): Promise<any[]> {
  const db = new UniversalKnex(knex);
  const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;

  return knex("v4_file_changes as fc")
    .join("v4_files as f", "fc.file_id", "f.id")
    .leftJoin("v4_layers as l", "fc.layer_id", "l.id")
    .leftJoin("v4_agents as a", "fc.agent_id", "a.id")
    .where("fc.ts", ">=", oneHourAgo)
    .select([
      "f.path",
      knex.raw(`CASE fc.change_type
        WHEN 1 THEN 'created'
        WHEN 2 THEN 'modified'
        ELSE 'deleted'
      END as change_type`),
      "l.name as layer",
      "a.name as changed_by",
      "fc.description",
      knex.raw(`${db.dateFunction("fc.ts")} as changed_at`),
    ])
    .orderBy("fc.ts", "desc");
}

/**
 * v_tagged_constraints - Active constraints with tags
 */
export async function getTaggedConstraints(knex: Knex): Promise<any[]> {
  const db = new UniversalKnex(knex);

  return knex("v4_constraints as c")
    .join("v4_constraint_categories as cat", "c.category_id", "cat.id")
    .leftJoin("v4_layers as l", "c.layer_id", "l.id")
    .leftJoin("v4_agents as a", "c.agent_id", "a.id")
    .where("c.active", db.boolTrue())
    .select([
      "c.id",
      "cat.name as category",
      "c.constraint_text",
      knex.raw(`CASE c.priority
        WHEN 1 THEN 'low'
        WHEN 2 THEN 'medium'
        WHEN 3 THEN 'high'
        ELSE 'critical'
      END as priority`),
      "l.name as layer",
      "a.name as added_by",
      knex.raw(`${db.dateFunction("c.ts")} as added_at`),
      // Tags subquery
      knex.raw(`(
        SELECT ${db.stringAgg("t2.name", ",")}
        FROM v4_constraint_tags ct2
        JOIN v4_tags t2 ON ct2.tag_id = t2.id
        WHERE ct2.constraint_id = c.id
      ) as tags`),
    ])
    .orderBy("c.priority", "desc")
    .orderBy("c.ts", "desc");
}

/**
 * v_task_board - Metadata-only task queries (v3.0.0)
 */
export async function getTaskBoard(knex: Knex): Promise<any[]> {
  const db = new UniversalKnex(knex);

  return knex("v4_tasks as t")
    .join("v4_task_statuses as ts", "t.status_id", "ts.id")
    .leftJoin("v4_layers as l", "t.layer_id", "l.id")
    .leftJoin("v4_agents as a", "t.assigned_agent_id", "a.id")
    .select([
      "t.id as task_id",
      "t.title",
      "ts.name as status",
      knex.raw(`CASE t.priority
        WHEN 1 THEN 'low'
        WHEN 2 THEN 'medium'
        WHEN 3 THEN 'high'
        ELSE 'critical'
      END as priority`),
      "l.name as layer",
      "a.name as assigned_to",
      "t.project_id",
      knex.raw(`${db.dateFunction("t.created_ts")} as created`),
      knex.raw(`${db.dateFunction("t.updated_ts")} as updated`),
      // Tags subquery
      knex.raw(`(
        SELECT ${db.stringAgg("tag.name", ",")}
        FROM v4_task_tags tt
        JOIN v4_tags tag ON tt.tag_id = tag.id
        WHERE tt.task_id = t.id
      ) as tags`),
    ])
    .orderBy("t.priority", "desc")
    .orderBy("t.updated_ts", "desc");
}
