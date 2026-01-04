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
    description: 'Manage project constraints (performance, architecture, security, code-style)',
    note: '💡 TIP: Use action: "example" to see comprehensive usage scenarios and real-world examples for all constraint actions.',
    actions: {
      add: 'Add constraint. Params: category (required), constraint_text (required), priority, layer, tags, created_by',
      get: 'Get constraints. Params: category, layer, priority, tags, include_inactive, limit. Returns only active constraints by default.',
      activate: 'Activate an inactive constraint. Params: constraint_id (required)',
      deactivate: 'Deactivate constraint. Params: constraint_id (required)',
      suggest_pending: 'Get pending constraint candidates from plan TOML cache. Params: project_path (optional). Returns constraints defined in plan file that haven\'t been registered yet.'
    },
    examples: {
      add: '{ action: "add", category: "performance", constraint_text: "API response time <100ms", priority: "high", tags: ["api"] }',
      get: '{ action: "get", category: "performance" }',
      get_with_inactive: '{ action: "get", include_inactive: true }',
      activate: '{ action: "activate", constraint_id: 5 }',
      deactivate: '{ action: "deactivate", constraint_id: 5 }',
      suggest_pending: '{ action: "suggest_pending" }'
    },
    documentation: {
    }
  };
}
