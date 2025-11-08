/**
 * Help action for decision tool
 */

export function decisionHelp(): any {
  return {
    tool: 'decision',
    description: 'Manage decisions with metadata (tags, layers, versions, scopes)',
    note: '💡 TIP: Use action: "example" to see comprehensive usage scenarios and real-world examples for all decision actions.',
    purpose: {
      title: '⚠️ CRITICAL: Store WHY and REASON, Not WHAT',
      principle: 'Decisions table is for ARCHITECTURAL CONTEXT and REASONING, NOT implementation logs or task completion status',
      what_to_store: {
        correct: [
          'WHY a design choice was made (e.g., "Chose JWT over sessions because stateless auth scales better for our microservice architecture")',
          'REASONING behind architecture decisions (e.g., "Moved oscillator_type to MonophonicSynthConfig to separate synthesis methods - FM operators use different config")',
          'PROBLEM ANALYSIS and solution rationale (e.g., "Nested transaction bug: setDecision wraps in transaction, batch also wraps → solution: extract internal helper without transaction wrapper")',
          'DESIGN TRADE-OFFS and alternatives considered (e.g., "Query builder limited to simple filters, kept domain-specific logic inline for maintainability")',
          'CONSTRAINTS and requirements reasoning (e.g., "API response must be <100ms because mobile clients timeout at 200ms")',
          'BREAKING CHANGES with migration rationale (e.g., "Removed /v1/users endpoint - clients must use /v2/users with pagination for scalability")'
        ],
        incorrect: [
          '❌ Task completion logs (e.g., "Task 5 completed", "Refactoring done", "Tests passing") → Use tasks tool instead',
          '❌ Implementation status (e.g., "Added validators.ts", "Fixed bug in batch_create", "Updated README") → These are WHAT, not WHY',
          '❌ Test results (e.g., "All tests passing", "Integration tests complete", "v3.0.2 testing verified") → Temporary status, not architectural context',
          '❌ Git commit summaries (e.g., "Released v3.0.2", "Created git commit 2bf55a0") → Belongs in git history',
          '❌ Documentation updates (e.g., "README reorganized", "Help actions enhanced") → Implementation logs, not decisions',
          '❌ Build status (e.g., "Build succeeded", "TypeScript compiled with zero errors") → Temporary status'
        ]
      },
      analogy: {
        git_history: 'WHAT changed (files, lines, commits)',
        code_comments: 'HOW it works (implementation details, algorithms)',
        sqlew_decisions: 'WHY it was changed (reasoning, trade-offs, context)',
        sqlew_tasks: 'WHAT needs to be done (work items, status, completion)'
      },
      cleanup_rule: 'Delete decisions that start with "COMPLETED:", contain task status, test results, or implementation logs. Keep only architectural reasoning and design rationale.'
    },
    actions: {
      set: 'Set/update a decision. Params: key (required), value (required), agent, layer, version, status, tags, scopes',
      get: 'Get specific decision by key. Params: key (required), include_context (optional, boolean, default: false)',
      list: 'List/filter decisions. Params: status, layer, tags, scope, tag_match',
      search_tags: 'Search decisions by tags. Params: tags (required), match_mode, status, layer',
      search_layer: 'Search decisions by layer. Params: layer (required), status, include_tags',
      versions: 'Get version history for a decision. Params: key (required)',
      quick_set: 'Quick set with smart defaults (FR-002). Auto-infers layer, tags, scope from key',
      search_advanced: 'Advanced query with complex filtering (FR-004). Supports layers, tags, scopes, temporal filters',
      set_batch: 'Batch set decisions (FR-005). Max 50 items. Atomic or non-atomic modes',
      has_updates: 'Check for updates since timestamp (FR-003 Phase A). Lightweight polling mechanism',
      set_from_template: 'Set decision using template (FR-006). Applies defaults and validates required fields',
      create_template: 'Create new decision template (FR-006). Define reusable defaults',
      list_templates: 'List all decision templates (FR-006)',
      hard_delete: 'Permanently delete a decision. WARNING: IRREVERSIBLE',
      add_decision_context: 'Add rich context to a decision (v3.2.2). Rationale, alternatives, tradeoffs',
      list_decision_contexts: 'List decision contexts with filters (v3.2.2)'
    },
    documentation: {
      tool_selection: 'docs/TOOL_SELECTION.md - Decision tree, tool comparison',
      tool_reference: 'docs/TOOL_REFERENCE.md - Parameter requirements, batch operations',
      workflows: 'docs/WORKFLOWS.md - Multi-step workflow examples',
      best_practices: 'docs/BEST_PRACTICES.md - Common errors, best practices',
      shared_concepts: 'docs/SHARED_CONCEPTS.md - Layer definitions, enum values'
    }
  };
}
