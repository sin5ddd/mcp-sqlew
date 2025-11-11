/**
 * Example Tool - help Action
 * Returns help documentation for the example tool
 */

export function exampleHelp(): object {
  return {
    tool: 'example',
    description: 'Browse and search code examples for sqlew tools. Use this to find working code snippets.',
    actions: [
      {
        name: 'get',
        description: 'Get examples by tool, action, or topic',
        parameters: [
          {
            name: 'tool',
            type: 'string',
            required: false,
            description: 'Filter by tool name (e.g., "decision", "task")'
          },
          {
            name: 'action_name',
            type: 'string',
            required: false,
            description: 'Filter by action name (e.g., "set", "create")'
          },
          {
            name: 'topic',
            type: 'string',
            required: false,
            description: 'Search by topic in title or explanation'
          }
        ],
        examples: [
          {
            title: 'Get all examples for decision tool',
            code: 'example({ action: "get", tool: "decision" })',
            explanation: 'Retrieves all code examples for the decision tool'
          },
          {
            title: 'Get examples for specific action',
            code: 'example({ action: "get", tool: "task", action_name: "create" })',
            explanation: 'Retrieves examples for task.create action'
          }
        ]
      },
      {
        name: 'search',
        description: 'Search examples by keyword',
        parameters: [
          {
            name: 'keyword',
            type: 'string',
            required: true,
            description: '🔴 REQUIRED: Keyword to search in title, explanation, or code'
          },
          {
            name: 'tool',
            type: 'string',
            required: false,
            description: 'Filter by tool name'
          },
          {
            name: 'action_name',
            type: 'string',
            required: false,
            description: 'Filter by action name'
          },
          {
            name: 'complexity',
            type: 'string',
            required: false,
            description: 'Filter by complexity: basic|intermediate|advanced'
          }
        ],
        examples: [
          {
            title: 'Search for authentication examples',
            code: 'example({ action: "search", keyword: "authentication" })',
            explanation: 'Searches all examples mentioning authentication'
          },
          {
            title: 'Search with filters',
            code: 'example({ action: "search", keyword: "dependency", tool: "task" })',
            explanation: 'Searches task-related examples about dependencies'
          }
        ]
      },
      {
        name: 'list_all',
        description: 'List all available examples with filtering and pagination',
        parameters: [
          {
            name: 'tool',
            type: 'string',
            required: false,
            description: 'Filter by tool name'
          },
          {
            name: 'complexity',
            type: 'string',
            required: false,
            description: 'Filter by complexity: basic|intermediate|advanced'
          },
          {
            name: 'limit',
            type: 'number',
            required: false,
            description: 'Maximum results to return (default: 20)'
          },
          {
            name: 'offset',
            type: 'number',
            required: false,
            description: 'Result offset for pagination (default: 0)'
          }
        ],
        examples: [
          {
            title: 'List all examples',
            code: 'example({ action: "list_all" })',
            explanation: 'Lists first 20 examples across all tools'
          },
          {
            title: 'List with pagination',
            code: 'example({ action: "list_all", tool: "decision", limit: 10, offset: 10 })',
            explanation: 'Gets examples 11-20 for decision tool'
          }
        ]
      }
    ]
  };
}
