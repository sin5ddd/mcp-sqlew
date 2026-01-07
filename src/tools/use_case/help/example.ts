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
  use_case_id: 8
})`,
        output: {
          use_case_id: 8,
          category: 'cross_tool_workflow',
          title: 'Full feature implementation workflow',
          complexity: 'advanced',
          description: 'Complete workflow from decision to implementation.',
          action_sequence: [],  // Populated from t_help_action_sequences if seeded
          full_example: {
            workflow: '1. decision.set for architectural choice\n2. constraint.add for requirements\n3. task.create for implementation\n4. task.link to decision and constraint\n5. file.record for changes\n6. task.move to done'
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
      'Check the workflow field for step-by-step instructions',
      'The full_example field contains the workflow details'
    ]
  };
}
