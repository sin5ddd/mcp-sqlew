/**
 * MCP Server - Tool Registry
 * Defines available MCP tools and their metadata
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

/**
 * Get list of all available MCP tools
 * Used by ListToolsRequest handler
 */
export function getToolRegistry(): Tool[] {
  return [
    {
      name: 'decision',
      description: 'Context Management - Store decisions with versioning and metadata. Use action: "help" for documentation.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'Action',
            enum: ['set', 'get', 'list', 'search_tags', 'search_layer', 'versions', 'quick_set', 'search_advanced', 'set_batch', 'has_updates', 'set_from_template', 'create_template', 'list_templates', 'hard_delete', 'add_decision_context', 'list_decision_contexts', 'analytics', 'create_policy', 'list_policies', 'set_from_policy', 'help', 'example', 'use_case']
          }
        },
        required: ['action'],
        additionalProperties: true,  // Allow action-specific parameters (key, value, tags, etc.)
      },
    },
    {
      name: 'file',
      description: 'File Change Tracking - Track file modifications and database operations (SQLite only). Use action: "help" for documentation.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'Action',
            enum: ['record', 'get', 'check_lock', 'record_batch', 'sqlite_flush', 'help', 'example', 'use_case']
          }
        },
        required: ['action'],
        additionalProperties: true,  // Allow action-specific parameters (file_path, layer, etc.)
      },
    },
    {
      name: 'constraint',
      description: 'Architectural Rules - Define and manage project constraints with priorities. Use action: "help" for documentation.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'Action',
            enum: ['add', 'get', 'deactivate', 'help', 'example', 'use_case']
          }
        },
        required: ['action'],
        additionalProperties: true,  // Allow action-specific parameters (constraint_text, priority, etc.)
      },
    },
    {
      name: 'task',
      description: 'Task Management - Create, track, and manage tasks with kanban workflow, layers, and file tracking. Use action: "help" for documentation.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'Action',
            enum: ['create', 'update', 'get', 'list', 'move', 'link', 'archive', 'create_batch', 'add_dependency', 'remove_dependency', 'get_dependencies', 'watch_files', 'watcher', 'help', 'example', 'use_case']
          }
        },
        required: ['action'],
        additionalProperties: true,  // Allow file_actions and other parameters (v3.8.0)
      },
    },
    {
      name: 'help',
      description: `**REQUIRED PARAMETER**: action (must be specified in ALL calls)

Help System - Query action documentation, parameters, and workflow guidance

Actions:
- query_action: Get action documentation with parameters and examples
- query_params: Get parameter list only (quick reference)
- query_tool: Get tool overview and all actions
- workflow_hints: Get common next actions after current action
- batch_guide: Get guidance for batch operations
- error_recovery: Analyze errors and suggest fixes

Use this tool to understand how to use other sqlew tools. Returns only requested information (80-95% token reduction vs legacy help).`,
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'Help action to perform',
            enum: ['query_action', 'query_params', 'query_tool', 'workflow_hints', 'batch_guide', 'error_recovery', 'help', 'example']
          },
          tool: {
            type: 'string',
            description: 'Target tool name (for query_action, query_params, query_tool, workflow_hints)'
          },
          target_action: {
            type: 'string',
            description: 'Target action name (for query_action, query_params)'
          },
          current_action: {
            type: 'string',
            description: 'Current action name (for workflow_hints)'
          },
          operation: {
            type: 'string',
            description: 'Batch operation name in format "tool.action" (for batch_guide)'
          },
          error_message: {
            type: 'string',
            description: 'Error message to analyze (for error_recovery)'
          }
        },
        required: ['action'],
      },
    },
    {
      name: 'example',
      description: `**REQUIRED PARAMETER**: action (must be specified in ALL calls)

Example System - Browse and search code examples for sqlew tools

Actions:
- get: Get examples by tool, action, or topic
- search: Search examples by keyword
- list_all: List all available examples with filtering

Use this tool to find working code snippets. Returns only requested examples (token-efficient).`,
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'Example action to perform',
            enum: ['get', 'search', 'list_all', 'help', 'example']
          },
          tool: {
            type: 'string',
            description: 'Filter by tool name (for get, search, list_all)'
          },
          action_name: {
            type: 'string',
            description: 'Filter by action name (for get, search)'
          },
          topic: {
            type: 'string',
            description: 'Search by topic in title or explanation (for get)'
          },
          keyword: {
            type: 'string',
            description: 'Keyword to search (for search)'
          },
          complexity: {
            type: 'string',
            description: 'Filter by complexity: basic|intermediate|advanced (for search, list_all)'
          },
          limit: {
            type: 'number',
            description: 'Maximum results to return (default: 20, for list_all)'
          },
          offset: {
            type: 'number',
            description: 'Result offset for pagination (default: 0, for list_all)'
          }
        },
        required: ['action'],
      },
    },
    {
      name: 'use_case',
      description: `**REQUIRED PARAMETER**: action (must be specified in ALL calls)

Use Case Catalog - Browse and search complete workflow scenarios

Actions:
- get: Get complete use case workflow by ID
- search: Search use cases by keyword/category
- list_all: List all use cases with filtering and pagination

Use this tool to learn end-to-end workflows and multi-step operations. Returns workflow steps with executable code examples.`,
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'Use case action to perform',
            enum: ['get', 'search', 'list_all', 'help', 'example']
          },
          use_case_id: {
            type: 'number',
            description: 'Use case ID to retrieve (for get)'
          },
          keyword: {
            type: 'string',
            description: 'Search keyword - searches title and description (for search)'
          },
          category: {
            type: 'string',
            description: 'Filter by category (optional for search, list_all)'
          },
          complexity: {
            type: 'string',
            description: 'Filter by complexity level',
            enum: ['basic', 'intermediate', 'advanced']
          },
          limit: {
            type: 'number',
            description: 'Maximum results to return (default: 20, for list_all)'
          },
          offset: {
            type: 'number',
            description: 'Result offset for pagination (default: 0, for list_all)'
          }
        },
        required: ['action'],
      },
    },
    {
      name: 'suggest',
      description: 'Intelligent decision/constraint suggestion system. Find related decisions by key pattern, tags, or full context. Prevents duplicates and ensures consistency.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'Suggestion action to perform',
            enum: ['by_key', 'by_tags', 'by_context', 'check_duplicate', 'help']
          },
          key: {
            type: 'string',
            description: 'Decision key (for by_key, by_context, check_duplicate)'
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tags array (for by_tags, by_context)'
          },
          layer: {
            type: 'string',
            description: 'Layer filter (optional)'
          },
          priority: {
            type: 'number',
            description: 'Priority level (optional)'
          },
          limit: {
            type: 'number',
            description: 'Max suggestions (default: 5)'
          },
          min_score: {
            type: 'number',
            description: 'Minimum relevance score (default: 30)'
          }
        },
        required: ['action'],
        additionalProperties: false,
      },
    },
  ];
}
