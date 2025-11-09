/**
 * Help Tool - help Action
 * Provides help documentation for the help tool itself
 */

export function helpHelp(): any {
  return {
    tool: 'help',
    description: 'Query action documentation, parameters, and workflow guidance',
    actions: [
      {
        name: 'query_action',
        description: 'Get action documentation with parameters and examples',
        parameters: [
          { name: 'tool', type: 'string', required: true, description: 'Target tool name' },
          { name: 'target_action', type: 'string', required: true, description: 'Target action name' }
        ],
        example: 'help({ action: "query_action", tool: "decision", target_action: "set" })'
      },
      {
        name: 'query_params',
        description: 'Get parameter list only (quick reference)',
        parameters: [
          { name: 'tool', type: 'string', required: true, description: 'Target tool name' },
          { name: 'target_action', type: 'string', required: true, description: 'Target action name' }
        ],
        example: 'help({ action: "query_params", tool: "task", target_action: "create" })'
      },
      {
        name: 'query_tool',
        description: 'Get tool overview and all actions',
        parameters: [
          { name: 'tool', type: 'string', required: true, description: 'Target tool name' }
        ],
        example: 'help({ action: "query_tool", tool: "constraint" })'
      },
      {
        name: 'workflow_hints',
        description: 'Get common next actions after current action',
        parameters: [
          { name: 'tool', type: 'string', required: true, description: 'Target tool name' },
          { name: 'current_action', type: 'string', required: true, description: 'Current action name' }
        ],
        example: 'help({ action: "workflow_hints", tool: "task", current_action: "create" })'
      },
      {
        name: 'batch_guide',
        description: 'Get guidance for batch operations',
        parameters: [
          { name: 'operation', type: 'string', required: true, description: 'Batch operation name (e.g., "task.create_batch")' }
        ],
        example: 'help({ action: "batch_guide", operation: "task.create_batch" })'
      },
      {
        name: 'error_recovery',
        description: 'Get suggestions for common errors',
        parameters: [
          { name: 'error_message', type: 'string', required: true, description: 'Error message to analyze' },
          { name: 'tool', type: 'string', required: false, description: 'Optional tool context' }
        ],
        example: 'help({ action: "error_recovery", error_message: "action parameter is required" })'
      }
    ],
    usage_note: 'This tool provides help for all sqlew tools. Use query_action for detailed action help, query_params for quick parameter reference, query_tool for tool overview.',
    token_efficiency: 'Returns only requested information (80-95% token reduction vs legacy help)'
  };
}
