/**
 * Use Case Tool - Help Action
 * Returns documentation for the use_case tool
 */

export function useCaseHelp() {
  return {
    tool: 'use_case',
    description: 'Browse and search complete workflow scenarios showing multi-step operations. Use this to learn end-to-end workflows.',
    actions: [
      {
        name: 'get',
        description: 'Get complete use case workflow by ID',
        parameters: [
          {
            name: 'use_case_id',
            type: 'number',
            required: true,
            description: '🔴 REQUIRED: Use case ID to retrieve'
          }
        ],
        example: {
          title: 'Get use case by ID',
          code: 'use_case({ action: "get", use_case_id: 7 })',
          explanation: 'Retrieve complete workflow for use case #7 with all steps and code examples'
        }
      },
      {
        name: 'search',
        description: 'Search use cases by keyword/category',
        parameters: [
          {
            name: 'keyword',
            type: 'string',
            required: true,
            description: '🔴 REQUIRED: Search keyword (searches title and description)'
          },
          {
            name: 'category',
            type: 'string',
            required: false,
            description: '⚪ OPTIONAL: Filter by category'
          },
          {
            name: 'complexity',
            type: 'string',
            required: false,
            description: '⚪ OPTIONAL: Filter by complexity level (basic, intermediate, advanced)'
          }
        ],
        example: {
          title: 'Search use cases',
          code: 'use_case({ action: "search", keyword: "dependency", category: "task_management" })',
          explanation: 'Find use cases about dependencies in task management category'
        }
      },
      {
        name: 'list_all',
        description: 'List all use cases with filtering and pagination',
        parameters: [
          {
            name: 'category',
            type: 'string',
            required: false,
            description: '⚪ OPTIONAL: Filter by category'
          },
          {
            name: 'complexity',
            type: 'string',
            required: false,
            description: '⚪ OPTIONAL: Filter by complexity level (basic, intermediate, advanced)'
          },
          {
            name: 'limit',
            type: 'number',
            required: false,
            description: '⚪ OPTIONAL: Maximum results to return',
            default: '20'
          },
          {
            name: 'offset',
            type: 'number',
            required: false,
            description: '⚪ OPTIONAL: Result offset for pagination',
            default: '0'
          }
        ],
        example: {
          title: 'List use cases',
          code: 'use_case({ action: "list_all", category: "decision_tracking", complexity: "basic", limit: 10 })',
          explanation: 'List first 10 basic use cases in decision_tracking category'
        }
      }
    ],
    categories: [
      'task_management - Task creation, linking, dependencies',
      'decision_tracking - Decision storage, versioning, context',
      'constraint_enforcement - Architectural rules and requirements',
      'file_tracking - File change monitoring and locking',
      'multi_agent - Multi-agent coordination and workflows'
    ],
    workflow_tips: [
      '1. Start with list_all to see available categories',
      '2. Use search to find relevant scenarios',
      '3. Use get to retrieve complete workflow details',
      '4. Follow the action_sequence in the workflow steps'
    ]
  };
}
