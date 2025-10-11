/**
 * Messaging Tools for MCP Shared Context Server
 * Agent-to-agent communication with priority and read tracking
 */

import { getDatabase, getOrCreateAgent } from '../database.js';
import {
  STRING_TO_MESSAGE_TYPE,
  STRING_TO_PRIORITY,
  MESSAGE_TYPE_TO_STRING,
  PRIORITY_TO_STRING,
  DEFAULT_PRIORITY,
} from '../constants.js';
import type {
  SendMessageParams,
  GetMessagesParams,
  MarkReadParams,
  SendMessageResponse,
  GetMessagesResponse,
  MarkReadResponse,
} from '../types.js';
import { performAutoCleanup } from '../utils/cleanup.js';

/**
 * Send a message from one agent to another (or broadcast)
 * Supports priority levels and optional JSON payload
 *
 * @param params - Message parameters
 * @returns Response with message ID and timestamp
 */
export function sendMessage(params: {
  from_agent: string;
  to_agent: string | null | undefined;
  msg_type: 'decision' | 'warning' | 'request' | 'info';
  message: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  payload?: any;
}): SendMessageResponse & { timestamp: string } {
  const db = getDatabase();

  // Cleanup old messages before inserting new one
  performAutoCleanup(db);

  // Validate msg_type
  if (!STRING_TO_MESSAGE_TYPE[params.msg_type]) {
    throw new Error(`Invalid msg_type: ${params.msg_type}. Must be one of: decision, warning, request, info`);
  }

  // Validate priority if provided
  const priority = params.priority || 'medium';
  if (!STRING_TO_PRIORITY[priority]) {
    throw new Error(`Invalid priority: ${priority}. Must be one of: low, medium, high, critical`);
  }

  // Auto-register from_agent
  const fromAgentId = getOrCreateAgent(db, params.from_agent);

  // Auto-register to_agent if provided (null = broadcast)
  const toAgentId = params.to_agent ? getOrCreateAgent(db, params.to_agent) : null;

  // Convert enums to integers
  const msgTypeInt = STRING_TO_MESSAGE_TYPE[params.msg_type];
  const priorityInt = STRING_TO_PRIORITY[priority];

  // Serialize payload if provided
  const payloadStr = params.payload ? JSON.stringify(params.payload) : null;

  // Insert message
  const stmt = db.prepare(`
    INSERT INTO t_agent_messages (from_agent_id, to_agent_id, msg_type, priority, payload, read)
    VALUES (?, ?, ?, ?, ?, 0)
  `);

  const result = stmt.run(fromAgentId, toAgentId, msgTypeInt, priorityInt, payloadStr);

  // Get timestamp
  const tsResult = db.prepare('SELECT ts FROM t_agent_messages WHERE id = ?').get(result.lastInsertRowid) as { ts: number };
  const timestamp = new Date(tsResult.ts * 1000).toISOString();

  return {
    success: true,
    message_id: Number(result.lastInsertRowid),
    timestamp,
  };
}

/**
 * Get messages for an agent with optional filtering
 * Returns messages addressed to agent or broadcast (to_agent_id IS NULL)
 *
 * @param params - Query parameters
 * @returns Array of messages with metadata
 */
export function getMessages(params: {
  agent_name: string;
  unread_only?: boolean;
  priority_filter?: 'low' | 'medium' | 'high' | 'critical';
  msg_type_filter?: 'decision' | 'warning' | 'request' | 'info';
  limit?: number;
}): GetMessagesResponse {
  const db = getDatabase();

  // Get or create agent to get ID
  const agentId = getOrCreateAgent(db, params.agent_name);

  // Build query dynamically based on filters
  let query = `
    SELECT
      m.id,
      a.name as from_agent,
      m.msg_type,
      m.priority,
      m.payload,
      m.ts,
      m.read
    FROM t_agent_messages m
    JOIN m_agents a ON m.from_agent_id = a.id
    WHERE (m.to_agent_id = ? OR m.to_agent_id IS NULL)
  `;

  const queryParams: any[] = [agentId];

  // Filter by read status
  if (params.unread_only) {
    query += ' AND m.read = 0';
  }

  // Filter by priority
  if (params.priority_filter) {
    if (!STRING_TO_PRIORITY[params.priority_filter]) {
      throw new Error(`Invalid priority_filter: ${params.priority_filter}`);
    }
    const priorityInt = STRING_TO_PRIORITY[params.priority_filter];
    query += ' AND m.priority = ?';
    queryParams.push(priorityInt);
  }

  // Filter by msg_type
  if (params.msg_type_filter) {
    if (!STRING_TO_MESSAGE_TYPE[params.msg_type_filter]) {
      throw new Error(`Invalid msg_type_filter: ${params.msg_type_filter}`);
    }
    const msgTypeInt = STRING_TO_MESSAGE_TYPE[params.msg_type_filter];
    query += ' AND m.msg_type = ?';
    queryParams.push(msgTypeInt);
  }

  // Order by priority DESC, then timestamp DESC
  query += ' ORDER BY m.priority DESC, m.ts DESC';

  // Limit results
  const limit = params.limit || 50;
  query += ' LIMIT ?';
  queryParams.push(limit);

  const stmt = db.prepare(query);
  const rows = stmt.all(...queryParams) as Array<{
    id: number;
    from_agent: string;
    msg_type: number;
    priority: number;
    payload: string | null;
    ts: number;
    read: number;
  }>;

  // Transform results
  const messages = rows.map(row => ({
    id: row.id,
    from_agent: row.from_agent,
    msg_type: MESSAGE_TYPE_TO_STRING[row.msg_type as keyof typeof MESSAGE_TYPE_TO_STRING],
    priority: PRIORITY_TO_STRING[row.priority as keyof typeof PRIORITY_TO_STRING],
    payload: row.payload ? JSON.parse(row.payload) : null,
    timestamp: new Date(row.ts * 1000).toISOString(),
    read: row.read === 1,
  }));

  return {
    messages,
    count: messages.length,
  };
}

/**
 * Mark messages as read
 * Only marks messages addressed to the specified agent (security check)
 *
 * @param params - Message IDs and agent name
 * @returns Success status and count of marked messages
 */
export function markRead(params: {
  message_ids: number[];
  agent_name: string;
}): MarkReadResponse & { marked_count: number } {
  const db = getDatabase();

  // Validate message_ids array
  if (!params.message_ids || params.message_ids.length === 0) {
    throw new Error('message_ids array cannot be empty');
  }

  // Get agent ID
  const agentId = getOrCreateAgent(db, params.agent_name);

  // Build placeholders for IN clause
  const placeholders = params.message_ids.map(() => '?').join(',');

  // Update only messages addressed to this agent (security check)
  // Also allow broadcast messages (to_agent_id IS NULL)
  const stmt = db.prepare(`
    UPDATE t_agent_messages
    SET read = 1
    WHERE id IN (${placeholders})
      AND (to_agent_id = ? OR to_agent_id IS NULL)
  `);

  const result = stmt.run(...params.message_ids, agentId);

  return {
    success: true,
    marked_count: result.changes,
  };
}
