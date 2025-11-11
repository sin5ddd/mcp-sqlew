/**
 * Example Tool - example Action
 * Returns usage examples for the example tool
 */

export function exampleExample(): object {
  return {
    tool: 'example',
    examples: [
      {
        title: 'Find decision examples',
        code: `example({
  action: "get",
  tool: "decision"
})`,
        explanation: 'Retrieves all code examples for decision tool actions',
        complexity: 'basic'
      },
      {
        title: 'Search for authentication examples',
        code: `example({
  action: "search",
  keyword: "authentication",
  tool: "decision"
})`,
        explanation: 'Searches decision-related examples mentioning authentication',
        complexity: 'basic'
      },
      {
        title: 'Get task creation examples',
        code: `example({
  action: "get",
  tool: "task",
  action_name: "create"
})`,
        explanation: 'Retrieves examples specifically for task.create action',
        complexity: 'intermediate'
      },
      {
        title: 'Search for dependency patterns',
        code: `example({
  action: "search",
  keyword: "dependency"
})`,
        explanation: 'Finds all examples that demonstrate dependency handling',
        complexity: 'intermediate'
      },
      {
        title: 'Browse all examples with pagination',
        code: `example({
  action: "list_all",
  limit: 10,
  offset: 0
})`,
        explanation: 'Lists first 10 examples from all tools',
        complexity: 'basic'
      },
      {
        title: 'Get topic-specific examples',
        code: `example({
  action: "get",
  topic: "batch operations"
})`,
        explanation: 'Searches for examples related to batch operations',
        complexity: 'advanced'
      }
    ]
  };
}
