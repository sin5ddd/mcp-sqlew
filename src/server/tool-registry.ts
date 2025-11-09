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
      description: `**REQUIRED PARAMETER**: action (must be specified in ALL calls)

Context Management - Store decisions with metadata (tags, layers, versions, scopes)

Use action: "help" for detailed documentation.
Use action: "example" for comprehensive usage examples.
Use action: "use_case" for practical scenarios and when-to-use guidance.`,
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'Action',
            enum: ['set', 'get', 'list', 'search_tags', 'search_layer', 'versions', 'quick_set', 'search_advanced', 'set_batch', 'has_updates', 'set_from_template', 'create_template', 'list_templates', 'hard_delete', 'add_decision_context', 'list_decision_contexts', 'help', 'example', 'use_case']
          }
        },
        required: ['action'],
      },
    },
    {
      name: 'message',
      description: `⚠️ DEPRECATED (v3.6.6) - This tool is deprecated and will be removed in future versions.

The messaging system was unused and has been removed. The t_agent_messages table no longer exists.
All actions will return deprecation warnings and are non-operational.

**REQUIRED PARAMETER**: action (must be specified in ALL calls)

Use action: "help" for detailed documentation.
Use action: "example" for comprehensive usage examples.
Use action: "use_case" for practical scenarios and when-to-use guidance.`,
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'Action',
            enum: ['send', 'get', 'mark_read', 'send_batch', 'help', 'example', 'use_case']
          }
        },
        required: ['action'],
      },
    },
    {
      name: 'file',
      description: `**REQUIRED PARAMETER**: action (must be specified in ALL calls)

File Change Tracking - Track file changes with layer classification and lock detection

Use action: "help" for detailed documentation.
Use action: "example" for comprehensive usage examples.
Use action: "use_case" for practical scenarios and when-to-use guidance.`,
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'Action',
            enum: ['record', 'get', 'check_lock', 'record_batch', 'help', 'example', 'use_case']
          }
        },
        required: ['action'],
      },
    },
    {
      name: 'constraint',
      description: `**REQUIRED PARAMETER**: action (must be specified in ALL calls)

Constraint Management - Manage architectural rules and requirements

Use action: "help" for detailed documentation.
Use action: "example" for comprehensive usage examples.
Use action: "use_case" for practical scenarios and when-to-use guidance.`,
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
      },
    },
    {
      name: 'stats',
      description: `**REQUIRED PARAMETER**: action (must be specified in ALL calls)

Statistics & Utilities - View stats, activity logs, manage data cleanup, and WAL checkpoints

Use action: "help" for detailed documentation.
Use action: "example" for comprehensive usage examples.
Use action: "use_case" for practical scenarios and when-to-use guidance.`,
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'Action',
            enum: ['layer_summary', 'db_stats', 'clear', 'activity_log', 'flush', 'help_action', 'help_params', 'help_tool', 'help_use_case', 'help_list_use_cases', 'help_next_actions', 'help', 'example', 'use_case']
          }
        },
        required: ['action'],
      },
    },
    {
      name: 'task',
      description: `**REQUIRED PARAMETER**: action (must be specified in ALL calls)

Kanban Task Watcher - AI-optimized task management with auto-stale detection

**Layers** (9 available in v3.8.0):
- FILE_REQUIRED (file_actions required): presentation, business, data, infrastructure, cross-cutting, documentation
- FILE_OPTIONAL (file_actions optional): planning, coordination, review

**file_actions** (optional, v3.8.0): Array of file operations for task tracking
- Structure: { action: 'create'|'edit'|'delete', path: string }[]
- Example: [{ action: 'create', path: 'src/auth/login.ts' }, { action: 'edit', path: 'src/api/router.ts' }]
- Validation: Required for FILE_REQUIRED layers (presentation, business, data, infrastructure, cross-cutting, documentation)
- Validation: Optional for FILE_OPTIONAL layers (planning, coordination, review)
- Note: watch_files action still supported for backward compatibility but deprecated

**Layer Descriptions**:
- presentation: UI components, views, pages (file_actions REQUIRED)
- business: Core business logic, services (file_actions REQUIRED)
- data: Database models, repositories (file_actions REQUIRED)
- infrastructure: Config, deployment, CI/CD (file_actions REQUIRED)
- cross-cutting: Logging, auth, error handling (file_actions REQUIRED)
- documentation: README, CHANGELOG, docs/ (file_actions REQUIRED)
- planning: Research, surveys, investigation (file_actions optional)
- coordination: Multi-agent orchestration (file_actions optional)
- review: Code review, verification (file_actions optional)

Use action: "help" for detailed documentation.
Use action: "example" for comprehensive usage examples.
Use action: "use_case" for practical scenarios and when-to-use guidance.`,
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'Action',
            enum: ['create', 'update', 'get', 'list', 'move', 'link', 'archive', 'batch_create', 'add_dependency', 'remove_dependency', 'get_dependencies', 'watch_files', 'watcher', 'help', 'example', 'use_case']
          }
        },
        required: ['action'],
        additionalProperties: true,  // Allow file_actions and other parameters (v3.8.0)
      },
    },
  ];
}
