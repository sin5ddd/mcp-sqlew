/**
 * Messaging Tools for MCP Shared Context Server
 * Agent-to-agent communication with priority and read tracking
 *
 * CONVERTED: Using Knex.js with DatabaseAdapter (async/await)
 */

import { DatabaseAdapter } from '../adapters/index.js';
import {
  getAdapter,
  getOrCreateAgent,
} from '../database.js';
import {
  STRING_TO_MESSAGE_TYPE,
  STRING_TO_PRIORITY,
  MESSAGE_TYPE_TO_STRING,
  PRIORITY_TO_STRING,
  DEFAULT_PRIORITY,
} from '../constants.js';
import { validateMessageType, validatePriority } from '../utils/validators.js';
import { logMessageSend } from '../utils/activity-logging.js';
import { Knex } from 'knex';
import type {
  SendMessageParams,
  GetMessagesParams,
  MarkReadParams,
  SendMessageResponse,
  GetMessagesResponse,
  MarkReadResponse,
  SendMessageBatchParams,
  SendMessageBatchResponse,
} from '../types.js';

/**
 * Internal helper: Send message without wrapping in transaction
 * Used by sendMessage (with transaction) and sendMessageBatch (manages its own transaction)
 *
 * @param params - Message parameters
 * @param adapter - Database adapter instance
 * @param trx - Optional transaction
 * @returns Response with message ID and timestamp
 */
async function sendMessageInternal(
  params: SendMessageParams,
  adapter: DatabaseAdapter,
  trx?: Knex.Transaction
): Promise<SendMessageResponse & { timestamp: string }> {
  const knex = trx || adapter.getKnex();

  // Validate msg_type
  validateMessageType(params.msg_type);

  // Validate priority if provided
  const priority = params.priority || 'medium';
  validatePriority(priority);

  // Auto-register from_agent
  const fromAgentId = await getOrCreateAgent(adapter, params.from_agent, trx);

  // Auto-register to_agent if provided (null = broadcast)
  const toAgentId = params.to_agent ? await getOrCreateAgent(adapter, params.to_agent, trx) : null;

  // Convert enums to integers
  const msgTypeInt = STRING_TO_MESSAGE_TYPE[params.msg_type];
  const priorityInt = STRING_TO_PRIORITY[priority];

  // Serialize payload if provided
  const payloadStr = params.payload ? JSON.stringify(params.payload) : null;

  // Current timestamp
  const ts = Math.floor(Date.now() / 1000);

  // Insert message
  const [messageId] = await knex('t_agent_messages').insert({
    from_agent_id: fromAgentId,
    to_agent_id: toAgentId,
    msg_type: msgTypeInt,
    priority: priorityInt,
    payload: payloadStr,
    read: 0,
    ts: ts
  });

  // Activity logging (replaces trigger)
  await logMessageSend(knex, {
    from_agent_id: fromAgentId,
    to_agent_id: toAgentId || 0,
    msg_type: msgTypeInt,
    priority: priorityInt
  });

  const timestamp = new Date(ts * 1000).toISOString();

  return {
    success: true,
    message_id: Number(messageId),
    timestamp,
  };
}

/**
 * Send a message from one agent to another (or broadcast)
 * Supports priority levels and optional JSON payload
 *
 * @param params - Message parameters
 * @param adapter - Optional database adapter (for testing)
 * @returns Response with message ID and timestamp
 */
export async function sendMessage(
  params: SendMessageParams,
  adapter?: DatabaseAdapter
): Promise<SendMessageResponse & { timestamp: string }> {
  const actualAdapter = adapter ?? getAdapter();

  try {
    return await actualAdapter.transaction(async (trx) => {
      return await sendMessageInternal(params, actualAdapter, trx);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to send message: ${message}`);
  }
}

/**
 * Get messages for an agent with optional filtering
 * Returns messages addressed to agent or broadcast (to_agent_id IS NULL)
 *
 * @param params - Query parameters
 * @param adapter - Optional database adapter (for testing)
 * @returns Array of messages with metadata
 */
export async function getMessages(params: {
  agent_name: string;
  unread_only?: boolean;
  priority_filter?: 'low' | 'medium' | 'high' | 'critical';
  msg_type_filter?: 'decision' | 'warning' | 'request' | 'info';
  limit?: number;
}, adapter?: DatabaseAdapter): Promise<GetMessagesResponse> {
  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  try {
    // Get or create agent to get ID
    const agentId = await getOrCreateAgent(actualAdapter, params.agent_name);

    // Build query dynamically based on filters
    let query = knex('t_agent_messages as m')
      .join('m_agents as a', 'm.from_agent_id', 'a.id')
      .where((builder) => {
        builder.where('m.to_agent_id', agentId)
          .orWhereNull('m.to_agent_id');
      })
      .select(
        'm.id',
        'a.name as from_agent',
        'm.msg_type',
        'm.priority',
        'm.payload',
        'm.ts',
        'm.read'
      );

    // Filter by read status
    if (params.unread_only) {
      query = query.where('m.read', 0);
    }

    // Filter by priority
    if (params.priority_filter) {
      validatePriority(params.priority_filter);
      const priorityInt = STRING_TO_PRIORITY[params.priority_filter];
      query = query.where('m.priority', priorityInt);
    }

    // Filter by msg_type
    if (params.msg_type_filter) {
      validateMessageType(params.msg_type_filter);
      const msgTypeInt = STRING_TO_MESSAGE_TYPE[params.msg_type_filter];
      query = query.where('m.msg_type', msgTypeInt);
    }

    // Order by priority DESC, then timestamp DESC
    const limit = params.limit || 50;
    query = query.orderBy([
      { column: 'm.priority', order: 'desc' },
      { column: 'm.ts', order: 'desc' }
    ]).limit(limit);

    // Execute query
    const rows = await query as Array<{
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get messages: ${message}`);
  }
}

/**
 * Mark messages as read
 * Only marks messages addressed to the specified agent (security check)
 *
 * @param params - Message IDs and agent name
 * @param adapter - Optional database adapter (for testing)
 * @returns Success status and count of marked messages
 */
export async function markRead(params: {
  message_ids: number[];
  agent_name: string;
}, adapter?: DatabaseAdapter): Promise<MarkReadResponse & { marked_count: number }> {
  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  try {
    // Validate message_ids array
    if (!params.message_ids || params.message_ids.length === 0) {
      throw new Error('message_ids array cannot be empty');
    }

    // Get agent ID
    const agentId = await getOrCreateAgent(actualAdapter, params.agent_name);

    // Update only messages addressed to this agent (security check)
    // Also allow broadcast messages (to_agent_id IS NULL)
    const markedCount = await knex('t_agent_messages')
      .whereIn('id', params.message_ids)
      .where((builder) => {
        builder.where('to_agent_id', agentId)
          .orWhereNull('to_agent_id');
      })
      .update({ read: 1 });

    return {
      success: true,
      marked_count: markedCount,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to mark messages as read: ${message}`);
  }
}

/**
 * Send multiple messages in a single batch operation (FR-005)
 * Supports atomic (all succeed or all fail) and non-atomic modes
 * Limit: 50 items per batch (constraint #3)
 *
 * @param params - Batch parameters with array of messages and atomic flag
 * @param adapter - Optional database adapter (for testing)
 * @returns Response with success status and detailed results for each item
 */
export async function sendMessageBatch(
  params: SendMessageBatchParams,
  adapter?: DatabaseAdapter
): Promise<SendMessageBatchResponse> {
  const actualAdapter = adapter ?? getAdapter();

  // Validate required parameters
  if (!params.messages || !Array.isArray(params.messages)) {
    throw new Error('Parameter "messages" is required and must be an array');
  }

  if (params.messages.length === 0) {
    return {
      success: true,
      inserted: 0,
      failed: 0,
      results: []
    };
  }

  if (params.messages.length > 50) {
    throw new Error('Parameter "messages" must contain at most 50 items');
  }

  const atomic = params.atomic !== undefined ? params.atomic : true;

  try {
    if (atomic) {
      // Atomic mode: All or nothing
      const results = await actualAdapter.transaction(async (trx) => {
        const processedResults = [];

        for (const message of params.messages) {
          try {
            const result = await sendMessageInternal(message, actualAdapter, trx);
            processedResults.push({
              from_agent: message.from_agent,
              to_agent: message.to_agent || null,
              message_id: result.message_id,
              timestamp: result.timestamp,
              success: true,
              error: undefined
            });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Batch failed at message from "${message.from_agent}": ${errorMessage}`);
          }
        }

        return processedResults;
      });

      return {
        success: true,
        inserted: results.length,
        failed: 0,
        results: results
      };
    } else {
      // Non-atomic mode: Process each independently
      const results = [];
      let inserted = 0;
      let failed = 0;

      for (const message of params.messages) {
        try {
          const result = await actualAdapter.transaction(async (trx) => {
            return await sendMessageInternal(message, actualAdapter, trx);
          });

          results.push({
            from_agent: message.from_agent,
            to_agent: message.to_agent || null,
            message_id: result.message_id,
            timestamp: result.timestamp,
            success: true,
            error: undefined
          });
          inserted++;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          results.push({
            from_agent: message.from_agent,
            to_agent: message.to_agent || null,
            message_id: undefined,
            timestamp: undefined,
            success: false,
            error: errorMessage
          });
          failed++;
        }
      }

      return {
        success: failed === 0,
        inserted: inserted,
        failed: failed,
        results: results
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to execute batch operation: ${message}`);
  }
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
