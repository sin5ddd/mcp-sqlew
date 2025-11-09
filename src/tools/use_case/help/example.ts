/**
 * Use Case Tool - Example Action
 * Returns comprehensive usage examples for the use_case tool
 */

export function useCaseExample() {
  return {
    tool: 'use_case',
    examples: [
      {
        scenario: 'Browse all use cases',
        description: 'List all available use cases to see what scenarios are documented',
        code: `use_case({
  action: "list_all"
})`,
        output: {
          total: 34,
          filtered: 34,
          use_cases: [
            { use_case_id: 1, title: 'Basic Decision Tracking', complexity: 'basic', category: 'decision_tracking' },
            { use_case_id: 2, title: 'Task Creation and Linking', complexity: 'basic', category: 'task_management' }
          ],
          categories: ['task_management', 'decision_tracking', 'constraint_enforcement', 'file_tracking', 'multi_agent']
        }
      },
      {
        scenario: 'Search for specific scenario',
        description: 'Find use cases about task dependencies',
        code: `use_case({
  action: "search",
  keyword: "dependency",
  category: "task_management"
})`,
        output: {
          total: 2,
          use_cases: [
            {
              use_case_id: 12,
              title: 'Managing Task Dependencies',
              complexity: 'intermediate',
              category: 'task_management',
              description: 'Create tasks with dependency chains for sequential execution'
            }
          ]
        }
      },
      {
        scenario: 'Get complete workflow',
        description: 'Retrieve a full use case with step-by-step workflow',
        code: `use_case({
  action: "get",
  use_case_id: 7
})`,
        output: {
          use_case_id: 7,
          category: 'task_management',
          title: 'Multi-Agent Task Coordination',
          complexity: 'advanced',
          description: 'Coordinate tasks across multiple agents with dependencies and decision tracking',
          action_sequence: ['decision.set', 'task.create', 'task.link', 'task.add_dependency'],
          full_example: {
            workflow: [
              {
                step: 1,
                action: 'decision.set',
                description: 'Document architecture decision',
                code: 'decision({ action: "set", key: "api-framework", value: "Express", ... })'
              },
              {
                step: 2,
                action: 'task.create',
                description: 'Create implementation task',
                code: 'task({ action: "create", title: "Implement API", assigned_agent: "backend-dev", ... })'
              }
            ]
          }
        }
      },
      {
        scenario: 'Filter by complexity',
        description: 'List only basic use cases to learn fundamentals',
        code: `use_case({
  action: "list_all",
  complexity: "basic",
  limit: 5
})`,
        output: {
          total: 34,
          filtered: 8,
          use_cases: [
            { use_case_id: 1, title: 'Basic Decision Tracking', complexity: 'basic', category: 'decision_tracking' },
            { use_case_id: 3, title: 'Simple Task Creation', complexity: 'basic', category: 'task_management' }
          ]
        }
      },
      {
        scenario: 'Browse by category',
        description: 'List all use cases in a specific category',
        code: `use_case({
  action: "list_all",
  category: "decision_tracking"
})`,
        output: {
          total: 34,
          filtered: 8,
          use_cases: [
            { use_case_id: 3, title: 'Basic Decision Tracking', complexity: 'basic', category: 'decision_tracking' },
            { use_case_id: 15, title: 'Decision Versioning', complexity: 'intermediate', category: 'decision_tracking' }
          ]
        }
      }
    ],
    common_workflows: [
      {
        name: 'Learning a new feature',
        steps: [
          '1. use_case({ action: "list_all" }) - See all available scenarios',
          '2. use_case({ action: "search", keyword: "your topic" }) - Find relevant use cases',
          '3. use_case({ action: "get", use_case_id: X }) - Get detailed workflow'
        ]
      },
      {
        name: 'Finding advanced patterns',
        steps: [
          '1. use_case({ action: "list_all", complexity: "advanced" }) - List advanced scenarios',
          '2. use_case({ action: "get", use_case_id: X }) - Study the workflow steps',
          '3. Follow the action_sequence in your implementation'
        ]
      }
    ],
    tips: [
      'Use search to quickly find scenarios matching your needs',
      'Start with basic complexity and progress to advanced',
      'Check the action_sequence to understand the order of operations',
      'The full_example field contains executable code snippets'
    ]
  };
}
