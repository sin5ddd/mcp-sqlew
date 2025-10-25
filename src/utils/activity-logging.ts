// src/utils/activity-logging.ts
import { Knex } from 'knex';

/**
 * Activity log helper functions
 * Replaces database triggers for cross-DB compatibility
 */

interface ActivityLogEntry {
  agent_id: number;
  action_type: string;
  target: string;
  layer_id?: number;
  details?: Record<string, any>;
}

/**
 * Insert activity log entry
 */
export async function logActivity(
  knex: Knex | Knex.Transaction,
  entry: ActivityLogEntry
): Promise<void> {
  await knex('t_activity_log').insert({
    agent_id: entry.agent_id,
    action_type: entry.action_type,
    target: entry.target,
    layer_id: entry.layer_id,
    details: entry.details ? JSON.stringify(entry.details) : null,
    ts: Math.floor(Date.now() / 1000), // Current Unix epoch
  });
}

/**
 * Log decision set (replaces trg_log_decision_set)
 */
export async function logDecisionSet(
  knex: Knex | Knex.Transaction,
  params: {
    key: string;
    value: string;
    version: string;
    status: number;
    agent_id: number;
    layer_id?: number;
  }
): Promise<void> {
  await logActivity(knex, {
    agent_id: params.agent_id,
    action_type: 'decision_set',
    target: params.key,
    layer_id: params.layer_id,
    details: {
      value: params.value,
      version: params.version,
      status: params.status,
    },
  });
}

/**
 * Log decision update (replaces trg_log_decision_update)
 */
export async function logDecisionUpdate(
  knex: Knex | Knex.Transaction,
  params: {
    key: string;
    old_value: string;
    new_value: string;
    old_version: string;
    new_version: string;
    agent_id: number;
    layer_id?: number;
  }
): Promise<void> {
  await logActivity(knex, {
    agent_id: params.agent_id,
    action_type: 'decision_update',
    target: params.key,
    layer_id: params.layer_id,
    details: {
      old_value: params.old_value,
      new_value: params.new_value,
      old_version: params.old_version,
      new_version: params.new_version,
    },
  });
}

/**
 * Record decision history (replaces trg_record_decision_history)
 */
export async function recordDecisionHistory(
  knex: Knex | Knex.Transaction,
  params: {
    key_id: number;
    version: string;
    value: string;
    agent_id: number;
    ts: number;
  }
): Promise<void> {
  await knex('t_decision_history').insert({
    key_id: params.key_id,
    version: params.version,
    value: params.value,
    agent_id: params.agent_id,
    ts: params.ts,
  });
}

/**
 * Log message send (replaces trg_log_message_send)
 */
export async function logMessageSend(
  knex: Knex | Knex.Transaction,
  params: {
    from_agent_id: number;
    to_agent_id: number;
    msg_type: number;
    priority: number;
  }
): Promise<void> {
  // Get agent name for target
  const fromAgent = await knex('m_agents').where({ id: params.from_agent_id }).first();

  await logActivity(knex, {
    agent_id: params.from_agent_id,
    action_type: 'message_send',
    target: fromAgent?.name || `agent_${params.to_agent_id}`,
    details: {
      msg_type: params.msg_type,
      priority: params.priority,
    },
  });
}

/**
 * Log file record (replaces trg_log_file_record)
 */
export async function logFileRecord(
  knex: Knex | Knex.Transaction,
  params: {
    file_path: string;
    change_type: number;
    agent_id: number;
    layer_id?: number;
  }
): Promise<void> {
  await logActivity(knex, {
    agent_id: params.agent_id,
    action_type: 'file_record',
    target: params.file_path,
    layer_id: params.layer_id,
    details: {
      change_type: params.change_type,
    },
  });
}

/**
 * Log task create (replaces trg_log_task_create)
 */
export async function logTaskCreate(
  knex: Knex | Knex.Transaction,
  params: {
    task_id: number;
    title: string;
    agent_id: number;
    layer_id?: number;
  }
): Promise<void> {
  await logActivity(knex, {
    agent_id: params.agent_id,
    action_type: 'task_create',
    target: `task_${params.task_id}`,
    layer_id: params.layer_id,
    details: {
      title: params.title,
    },
  });
}

/**
 * Log task status change (replaces trg_log_task_status_change)
 */
export async function logTaskStatusChange(
  knex: Knex | Knex.Transaction,
  params: {
    task_id: number;
    old_status: number;
    new_status: number;
    agent_id: number;
  }
): Promise<void> {
  await logActivity(knex, {
    agent_id: params.agent_id,
    action_type: 'task_status_change',
    target: `task_${params.task_id}`,
    details: {
      old_status: params.old_status,
      new_status: params.new_status,
    },
  });
}

/**
 * Update task timestamp (replaces trg_update_task_timestamp)
 * This is now handled in application layer when updating tasks
 */
export function updateTaskTimestamp(data: any): any {
  return {
    ...data,
    updated_ts: Math.floor(Date.now() / 1000), // Current Unix epoch
  };
}

/**
 * Log constraint add (replaces trg_log_constraint_add)
 */
export async function logConstraintAdd(
  knex: Knex | Knex.Transaction,
  params: {
    constraint_id: number;
    category: string;
    constraint_text: string;
    priority: string;
    layer: string | null;
    created_by: string;
    agent_id: number;
  }
): Promise<void> {
  await logActivity(knex, {
    agent_id: params.agent_id,
    action_type: 'constraint_add',
    target: `constraint_${params.constraint_id}`,
    details: {
      category: params.category,
      constraint_text: params.constraint_text,
      priority: params.priority,
      layer: params.layer,
      created_by: params.created_by,
    },
  });
}

/**
 * Log file change (replaces trg_log_file_change)
 */
export async function logFileChange(
  knex: Knex | Knex.Transaction,
  params: {
    file_path: string;
    agent_name: string;
    change_type: string;
    layer: string | null;
    description: string | null;
  }
): Promise<void> {
  // Get agent_id from agent_name
  const agent = await knex('m_agents').where({ name: params.agent_name }).first();

  if (agent) {
    await logActivity(knex, {
      agent_id: agent.id,
      action_type: 'file_change',
      target: params.file_path,
      details: {
        change_type: params.change_type,
        description: params.description,
      },
    });
  }
}
