/**
 * Help documentation for constraint tool
 */

/**
 * Get help documentation for constraint tool
 * @returns Help documentation object
 */
export function constraintHelp(): any {
  return {
    tool: 'constraint',
    description: 'Manage project constraints (performance, architecture, security)',
    note: '💡 TIP: Use action: "example" to see comprehensive usage scenarios and real-world examples for all constraint actions.',
    actions: {
      add: 'Add constraint. Params: category (required), constraint_text (required), priority, layer, tags, created_by',
      get: 'Get constraints. Params: category, layer, priority, tags, active_only, limit',
      deactivate: 'Deactivate constraint. Params: constraint_id (required)'
    },
    examples: {
      add: '{ action: "add", category: "performance", constraint_text: "API response time <100ms", priority: "high", tags: ["api"] }',
      get: '{ action: "get", category: "performance", active_only: true }',
      deactivate: '{ action: "deactivate", constraint_id: 5 }'
    },
    documentation: {
      tool_selection: 'docs/TOOL_SELECTION.md - Decision tree, constraint vs decision comparison (236 lines, ~12k tokens)',
      workflows: 'docs/WORKFLOWS.md - Constraint validation workflows, requirement tracking (602 lines, ~30k tokens)',
      shared_concepts: 'docs/SHARED_CONCEPTS.md - Layer definitions, enum values (category/priority) (339 lines, ~17k tokens)',
      best_practices: 'docs/BEST_PRACTICES.md - When to use constraints, common patterns (345 lines, ~17k tokens)'
    }
  };
}
