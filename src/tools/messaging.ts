/**
 * Messaging Tools for MCP Shared Context Server
 * Agent-to-agent communication with priority and read tracking
 */

import { getDatabase, getOrCreateAgent, transaction } from '../database.js';
import {
  STRING_TO_MESSAGE_TYPE,
  STRING_TO_PRIORITY,
  MESSAGE_TYPE_TO_STRING,
  PRIORITY_TO_STRING,
  DEFAULT_PRIORITY,
} from '../constants.js';
import { validateMessageType, validatePriority } from '../utils/validators.js';
import type {
  SendMessageParams,
  GetMessagesParams,
  MarkReadParams,
  SendMessageResponse,
  GetMessagesResponse,
  MarkReadResponse,
  SendMessageBatchParams,
  SendMessageBatchResponse,
  Database
} from '../types.js';
import { performAutoCleanup } from '../utils/cleanup.js';
import { processBatch } from '../utils/batch.js';

/**
 * Internal helper: Send message without cleanup or transaction wrapper
 * Used by sendMessage (with cleanup) and sendMessageBatch (manages its own transaction)
 *
 * @param params - Message parameters
 * @param db - Database instance
 * @returns Response with message ID and timestamp
 */
function sendMessageInternal(params: SendMessageParams, db: Database): SendMessageResponse & { timestamp: string } {
  // Validate msg_type
  validateMessageType(params.msg_type);

  // Validate priority if provided
  const priority = params.priority || 'medium';
  validatePriority(priority);

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
 * Send a message from one agent to another (or broadcast)
 * Supports priority levels and optional JSON payload
 *
 * @param params - Message parameters
 * @param db - Optional database instance (for testing)
 * @returns Response with message ID and timestamp
 */
export function sendMessage(params: SendMessageParams, db?: Database): SendMessageResponse & { timestamp: string } {
  const actualDb = db ?? getDatabase();

  // Cleanup old messages before inserting new one
  performAutoCleanup(actualDb);

  return sendMessageInternal(params, actualDb);
}

/**
 * Get messages for an agent with optional filtering
 * Returns messages addressed to agent or broadcast (to_agent_id IS NULL)
 *
 * @param params - Query parameters
 * @param db - Optional database instance (for testing)
 * @returns Array of messages with metadata
 */
export function getMessages(params: {
  agent_name: string;
  unread_only?: boolean;
  priority_filter?: 'low' | 'medium' | 'high' | 'critical';
  msg_type_filter?: 'decision' | 'warning' | 'request' | 'info';
  limit?: number;
}, db?: Database): GetMessagesResponse {
  const actualDb = db ?? getDatabase();

  // Get or create agent to get ID
  const agentId = getOrCreateAgent(actualDb, params.agent_name);

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
    validatePriority(params.priority_filter);
    const priorityInt = STRING_TO_PRIORITY[params.priority_filter];
    query += ' AND m.priority = ?';
    queryParams.push(priorityInt);
  }

  // Filter by msg_type
  if (params.msg_type_filter) {
    validateMessageType(params.msg_type_filter);
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

  const stmt = actualDb.prepare(query);
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
 * @param db - Optional database instance (for testing)
 * @returns Success status and count of marked messages
 */
export function markRead(params: {
  message_ids: number[];
  agent_name: string;
}, db?: Database): MarkReadResponse & { marked_count: number } {
  const actualDb = db ?? getDatabase();

  // Validate message_ids array
  if (!params.message_ids || params.message_ids.length === 0) {
    throw new Error('message_ids array cannot be empty');
  }

  // Get agent ID
  const agentId = getOrCreateAgent(actualDb, params.agent_name);

  // Build placeholders for IN clause
  const placeholders = params.message_ids.map(() => '?').join(',');

  // Update only messages addressed to this agent (security check)
  // Also allow broadcast messages (to_agent_id IS NULL)
  const stmt = actualDb.prepare(`
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

/**
 * Send multiple messages in a single batch operation (FR-005)
 * Supports atomic (all succeed or all fail) and non-atomic modes
 * Limit: 50 items per batch (constraint #3)
 *
 * @param params - Batch parameters with array of messages and atomic flag
 * @param db - Optional database instance (for testing)
 * @returns Response with success status and detailed results for each item
 */
export function sendMessageBatch(params: SendMessageBatchParams, db?: Database): SendMessageBatchResponse {
  const actualDb = db ?? getDatabase();

  // Validate required parameters
  if (!params.messages || !Array.isArray(params.messages)) {
    throw new Error('Parameter "messages" is required and must be an array');
  }

  // Cleanup old messages before processing batch
  performAutoCleanup(actualDb);

  const atomic = params.atomic !== undefined ? params.atomic : true;

  // Use processBatch utility
  const batchResult = processBatch(
    actualDb,
    params.messages,
    (message, db) => {
      const result = sendMessageInternal(message, db);
      return {
        from_agent: message.from_agent,
        to_agent: message.to_agent || null,
        message_id: result.message_id,
        timestamp: result.timestamp
      };
    },
    atomic,
    50
  );

  // Map batch results to SendMessageBatchResponse format
  return {
    success: batchResult.success,
    inserted: batchResult.processed,
    failed: batchResult.failed,
    results: batchResult.results.map(r => ({
      from_agent: (r.data as any)?.from_agent || '',
      to_agent: (r.data as any)?.to_agent || null,
      message_id: r.data?.message_id,
      timestamp: r.data?.timestamp,
      success: r.success,
      error: r.error
    }))
  };
}

/**
 * Help action for message tool
 */
export function messageHelp(): any {
  return {
    tool: 'message',
    description: 'Send and retrieve messages between agents with priority levels',
    note: '💡 TIP: Use action: "example" to see comprehensive usage scenarios and real-world examples for all message actions.',
    actions: {
      send: 'Send message. Params: from_agent (required), msg_type (required), message (required), to_agent, priority, payload',
      get: 'Get messages for agent. Params: agent_name (required), unread_only, priority_filter, msg_type_filter, limit',
      mark_read: 'Mark messages as read. Params: agent_name (required), message_ids (required)',
      send_batch: 'Batch send messages (FR-005). Params: messages (required, array of SendMessageParams, max: 50), atomic (optional, boolean, default: true). Returns: {success, inserted, failed, results}. ATOMIC MODE (atomic: true): All messages succeed or all fail as a single transaction. If ANY message fails, entire batch is rolled back and error is thrown. NON-ATOMIC MODE (atomic: false): Each message is processed independently. If some fail, others still succeed. Returns partial results with per-item success/error status. RECOMMENDATION FOR AI AGENTS: Use atomic:false by default for best-effort delivery. Use atomic:true only when all-or-nothing guarantee is required. 52% token reduction vs individual calls.'
    },
    examples: {
      send: '{ action: "send", from_agent: "bot1", msg_type: "info", message: "Task complete", priority: "high" }',
      get: '{ action: "get", agent_name: "bot1", unread_only: true }',
      mark_read: '{ action: "mark_read", agent_name: "bot1", message_ids: [1, 2, 3] }',
      send_batch: '{ action: "send_batch", messages: [{"from_agent": "bot1", "msg_type": "info", "message": "Task 1 done"}, {"from_agent": "bot1", "msg_type": "info", "message": "Task 2 done"}], atomic: true }'
    },
    documentation: {
      workflows: 'docs/WORKFLOWS.md - Multi-agent coordination, messaging patterns, cross-session handoffs (602 lines, ~30k tokens)',
      tool_reference: 'docs/TOOL_REFERENCE.md - Message tool parameters, batch operations (471 lines, ~24k tokens)',
      shared_concepts: 'docs/SHARED_CONCEPTS.md - Enum values (msg_type/priority), atomic mode (339 lines, ~17k tokens)',
      best_practices: 'docs/BEST_PRACTICES.md - Common errors, messaging best practices (345 lines, ~17k tokens)'
    }
  };
}

/**
 * Example action for message tool
 */
export function messageExample(): any {
  return {
    tool: 'message',
    description: 'Comprehensive messaging examples for multi-agent coordination',
    scenarios: {
      basic_messaging: {
        title: 'Basic Agent Communication',
        examples: [
          {
            scenario: 'Send info message between agents',
            request: '{ action: "send", from_agent: "backend-agent", to_agent: "frontend-agent", msg_type: "info", message: "API endpoint /users is ready" }',
            explanation: 'Direct message from one agent to another'
          },
          {
            scenario: 'Broadcast message to all agents',
            request: '{ action: "send", from_agent: "coordinator", to_agent: null, msg_type: "info", message: "Deployment starting in 5 minutes", priority: "high" }',
            explanation: 'null to_agent broadcasts to all agents'
          },
          {
            scenario: 'Get unread messages',
            request: '{ action: "get", agent_name: "frontend-agent", unread_only: true }',
            explanation: 'Retrieve only unread messages for an agent'
          }
        ]
      },
      priority_messaging: {
        title: 'Priority-Based Communication',
        examples: [
          {
            scenario: 'Critical error notification',
            request: '{ action: "send", from_agent: "monitoring-agent", msg_type: "warning", message: "Database connection lost", priority: "critical" }',
            explanation: 'High-priority messages for urgent issues'
          },
          {
            scenario: 'Filter by priority',
            request: '{ action: "get", agent_name: "ops-agent", priority_filter: "critical" }',
            explanation: 'Get only critical priority messages'
          }
        ]
      },
      workflow_coordination: {
        title: 'Multi-Step Workflow',
        steps: [
          {
            step: 1,
            action: 'Agent A requests work from Agent B',
            request: '{ action: "send", from_agent: "agent-a", to_agent: "agent-b", msg_type: "request", message: "Please process user data batch-123" }'
          },
          {
            step: 2,
            action: 'Agent B checks messages',
            request: '{ action: "get", agent_name: "agent-b", msg_type_filter: "request", unread_only: true }'
          },
          {
            step: 3,
            action: 'Agent B marks as read and processes',
            request: '{ action: "mark_read", agent_name: "agent-b", message_ids: [123] }'
          },
          {
            step: 4,
            action: 'Agent B sends completion notification',
            request: '{ action: "send", from_agent: "agent-b", to_agent: "agent-a", msg_type: "info", message: "Batch-123 processing complete" }'
          }
        ]
      },
      batch_messaging: {
        title: 'Batch Message Operations',
        examples: [
          {
            scenario: 'Send multiple status updates atomically',
            request: '{ action: "send_batch", messages: [{"from_agent": "worker-1", "msg_type": "info", "message": "Task 1 done"}, {"from_agent": "worker-1", "msg_type": "info", "message": "Task 2 done"}], atomic: true }',
            explanation: 'All messages sent or none (atomic mode)'
          },
          {
            scenario: 'Best-effort batch sending',
            request: '{ action: "send_batch", messages: [{...}, {...}], atomic: false }',
            explanation: 'Each message sent independently - partial success allowed'
          }
        ]
      }
    },
    best_practices: {
      message_types: [
        'Use "decision" for recording important choices',
        'Use "warning" for errors or issues requiring attention',
        'Use "request" for work requests between agents',
        'Use "info" for status updates and notifications'
      ],
      priority_usage: [
        'critical: System failures, data loss, security breaches',
        'high: Important but not emergency (deployment notifications)',
        'medium: Regular coordination messages (default)',
        'low: Optional information, logging'
      ],
      coordination_patterns: [
        'Always mark messages as read after processing',
        'Use broadcast (to_agent=null) for system-wide announcements',
        'Filter by msg_type when checking for specific message categories',
        'Include context in message text or payload for debugging'
      ]
    }
  };
}
