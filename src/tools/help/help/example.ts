/**
 * Help Tool - example Action
 * Provides usage examples for the help tool
 */

export function helpExample(): any {
  return {
    tool: 'help',
    examples: [
      {
        title: 'Get detailed help for decision.set action',
        code: 'help({ action: "query_action", tool: "decision", target_action: "set" })',
        explanation: 'Returns full documentation including parameters, types, and code examples for the set action',
        complexity: 'basic',
        expected_output: 'Action description, parameter list with types and requirements, code examples'
      },
      {
        title: 'Quick parameter reference for task.create',
        code: 'help({ action: "query_params", tool: "task", target_action: "create" })',
        explanation: 'Returns just the parameter list without examples - useful for quick lookup',
        complexity: 'basic',
        expected_output: 'Parameter list with names, types, required flags, and descriptions'
      },
      {
        title: 'Get overview of constraint tool',
        code: 'help({ action: "query_tool", tool: "constraint" })',
        explanation: 'Returns tool description and list of all available actions',
        complexity: 'basic',
        expected_output: 'Tool description and action list with brief descriptions'
      },
      {
        title: 'Find what to do after creating a task',
        code: 'help({ action: "workflow_hints", tool: "task", current_action: "create" })',
        explanation: 'Suggests common next actions based on typical workflows (e.g., link, add_dependency)',
        complexity: 'intermediate',
        expected_output: 'List of suggested next actions with frequency and context'
      },
      {
        title: 'Get guidance for batch task creation',
        code: 'help({ action: "batch_guide", operation: "task.create_batch" })',
        explanation: 'Returns best practices and examples for creating multiple tasks at once',
        complexity: 'intermediate',
        expected_output: 'Batch operation syntax, best practices, and code examples'
      },
      {
        title: 'Troubleshoot missing action parameter error',
        code: 'help({ action: "error_recovery", error_message: "action parameter is required", tool: "decision" })',
        explanation: 'Analyzes error message and provides cause, solution, example, and prevention tips',
        complexity: 'intermediate',
        expected_output: 'Error analysis with cause, solution, working example, and prevention strategy'
      },
      {
        title: 'Recover from file_actions validation error',
        code: 'help({ action: "error_recovery", error_message: "file_actions required for FILE_REQUIRED layer" })',
        explanation: 'Explains FILE_REQUIRED vs FILE_OPTIONAL layers and how to fix the error',
        complexity: 'advanced',
        expected_output: 'Layer system explanation, solution with file_actions example, layer selection guidance'
      }
    ],
    tips: [
      'Use query_action when you need full details including examples',
      'Use query_params when you just need a quick parameter lookup',
      'Use query_tool to discover all actions available for a tool',
      'Use workflow_hints to learn typical action sequences',
      'Use batch_guide before performing batch operations',
      'Use error_recovery to troubleshoot errors instead of guessing'
    ],
    token_savings: 'Help tool returns 80-95% less tokens than legacy help actions by only returning requested information'
  };
}
