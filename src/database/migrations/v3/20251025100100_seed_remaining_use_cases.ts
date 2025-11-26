/**
 * Converted from: src/config/knex/enhancements/20251025100100_seed_remaining_use_cases.ts
 * Changes: None (data seeding migration - no schema operations to optimize)
 * Line count: 293 → 293 lines (0% reduction)
 */

import type { Knex } from "knex";

/**
 * Migration: Seed Remaining Use Cases (v3.6.0)
 *
 * Completes the use-case seeding with the remaining:
 * - 10 intermediate complexity use-cases (2-3 actions)
 * - 6 advanced complexity use-cases (4-6+ actions, multi-tool orchestration)
 *
 * This brings the total to 41 use-cases:
 * - 18 basic (already seeded in 20251025090100)
 * - 15 intermediate (5 + 10 from this migration)
 * - 8 advanced (2 + 6 from this migration)
 */

export async function up(knex: Knex): Promise<void> {
  // Get category IDs
  const categories = await knex('m_help_use_case_categories').select('category_id', 'category_name');
  const categoryMap = categories.reduce((map, cat) => {
    map[cat.category_name] = cat.category_id;
    return map;
  }, {} as Record<string, number>);

  // =========================================================================
  // 1. Seed Remaining Intermediate Use Cases (10 use-cases)
  // =========================================================================

  const intermediateUseCases = [
    // TASK MANAGEMENT (3 more intermediate)
    {
      category_id: categoryMap.task_management,
      title: 'Create task with dependency blocking relationship',
      complexity: 'intermediate',
      description: 'Create two tasks where one blocks the other, establishing a dependency chain for sequential work.\n\nExpected Outcome: Dependency created, blocked task cannot complete until blocker finishes\n\nCommon Pitfalls: ["Creating circular dependencies","Adding dependency before tasks exist","Not validating dependency graph"]\n\nRelated Tools: ["task"]',
      full_example: JSON.stringify({
        steps: [
          { step: 1, action: 'task', params: { action: 'create', title: 'Design database schema', priority: 3, tags: ['database', 'design'] } },
          { step: 2, action: 'task', params: { action: 'create', title: 'Implement data models', priority: 3, tags: ['database', 'implementation'] } },
          { step: 3, action: 'task', params: { action: 'add_dependency', task_id: 101, blocks_on_task_id: 100 } }
        ]
      }),
      action_sequence: JSON.stringify(['create', 'create', 'add_dependency'])
    },
    {
      category_id: categoryMap.task_management,
      title: 'Batch create multiple related tasks',
      complexity: 'intermediate',
      description: 'Use create_batch to create multiple related tasks in a single operation with consistent metadata.\n\nExpected Outcome: Multiple tasks created atomically with shared tags and layer\n\nCommon Pitfalls: ["Not providing required title for each task","Mixing unrelated tasks in batch","Forgetting to link tasks after batch creation"]\n\nRelated Tools: ["task"]',
      full_example: JSON.stringify({
        steps: [
          { step: 1, action: 'task', params: { action: 'create_batch', tasks: [
            { title: 'Setup CI pipeline', priority: 3, layer: 'infrastructure', tags: ['devops', 'ci'] },
            { title: 'Configure deployment', priority: 3, layer: 'infrastructure', tags: ['devops', 'deployment'] },
            { title: 'Setup monitoring', priority: 2, layer: 'infrastructure', tags: ['devops', 'monitoring'] }
          ] } }
        ]
      }),
      action_sequence: JSON.stringify(['create_batch'])
    },
    {
      category_id: categoryMap.task_management,
      title: 'Archive completed task and create follow-up',
      complexity: 'intermediate',
      description: 'Mark task as done, archive it, and create a follow-up task for the next phase.\n\nExpected Outcome: Completed task archived, new task created with link to archived context\n\nCommon Pitfalls: ["Archiving before marking done","Not linking follow-up to original task","Losing context from archived task"]',
      full_example: JSON.stringify({
        steps: [
          { step: 1, action: 'task', params: { action: 'move', task_id: 42, new_status: 'done', notes: 'Feature complete' } },
          { step: 2, action: 'task', params: { action: 'archive', task_id: 42 } },
          { step: 3, action: 'task', params: { action: 'create', title: 'Add unit tests for feature', priority: 3, tags: ['testing'], notes: 'Follow-up from task #42' } }
        ]
      }),
      action_sequence: JSON.stringify(['move', 'archive', 'create'])
    },

    // DECISION TRACKING (2 more intermediate)
    {
      category_id: categoryMap.decision_tracking,
      title: 'Update decision and track version history',
      complexity: 'intermediate',
      description: 'Update an existing decision value and retrieve version history to see evolution.\n\nExpected Outcome: Decision updated with new version, full history available showing all changes\n\nCommon Pitfalls: ["Not reviewing version history before update","Losing context of why decision changed","Not documenting reason for change"]\n\nRelated Tools: ["decision"]',
      full_example: JSON.stringify({
        steps: [
          { step: 1, action: 'decision', params: { action: 'set', decision_key: 'max_upload_size', value: 10, tags: ['storage', 'limits'], version: 'v1.1.0', description: 'Increased from 5MB to 10MB due to user feedback' } },
          { step: 2, action: 'decision', params: { action: 'versions', decision_key: 'max_upload_size' } }
        ]
      }),
      action_sequence: JSON.stringify(['set', 'versions'])
    },
    {
      category_id: categoryMap.decision_tracking,
      title: 'Search decisions by multiple tags with AND logic',
      complexity: 'intermediate',
      description: 'Find decisions that match ALL specified tags for precise filtering.\n\nExpected Outcome: Only decisions tagged with all specified tags are returned\n\nCommon Pitfalls: ["Confusing AND vs OR logic","Using too many tags (returns empty)","Not checking tag spelling"]',
      full_example: JSON.stringify({
        steps: [
          { step: 1, action: 'decision', params: { action: 'search_tags', tags: ['authentication', 'security', 'api'], match_all: true } }
        ]
      }),
      action_sequence: JSON.stringify(['search_tags'])
    },

    // FILE TRACKING (2 more intermediate)
    {
      category_id: categoryMap.file_tracking,
      title: 'Track file modification with layer and link to task',
      complexity: 'intermediate',
      description: 'Record file change with layer assignment, then link the file to an active task.\n\nExpected Outcome: File change recorded and associated with task for context tracking\n\nCommon Pitfalls: ["Recording file before task exists","Wrong layer assignment","Not using watch_files for automatic tracking"]',
      full_example: JSON.stringify({
        steps: [
          { step: 1, action: 'file', params: { action: 'record', file_path: 'src/api/auth.ts', change_type: 'modified', layer: 'business', description: 'Added JWT validation middleware' } },
          { step: 2, action: 'task', params: { action: 'link', task_id: 55, link_type: 'file', target_id: 'src/api/auth.ts', link_relation: 'modifies' } }
        ]
      }),
      action_sequence: JSON.stringify(['record', 'link'])
    },
    {
      category_id: categoryMap.file_tracking,
      title: 'Review recent file changes by layer',
      complexity: 'intermediate',
      description: 'Query file changes filtered by specific architecture layer to review layer-specific work.\n\nExpected Outcome: File changes for specified layer returned with full context\n\nCommon Pitfalls: ["Filtering by non-existent layer","Not limiting results (too much data)","Ignoring timestamp ordering"]',
      full_example: JSON.stringify({
        steps: [
          { step: 1, action: 'file', params: { action: 'get', layer: 'data', limit: 20 } }
        ]
      }),
      action_sequence: JSON.stringify(['get'])
    },

    // CONSTRAINT MANAGEMENT (1 more intermediate)
    {
      category_id: categoryMap.constraint_management,
      title: 'Add constraint and link to enforcing task',
      complexity: 'intermediate',
      description: 'Define a constraint then create a task to enforce it, linking them for traceability.\n\nExpected Outcome: Constraint defined and task created to implement enforcement\n\nCommon Pitfalls: ["Not prioritizing critical constraints","Creating task without constraint context","Missing enforcement validation"]',
      full_example: JSON.stringify({
        steps: [
          { step: 1, action: 'constraint', params: { action: 'add', constraint_text: 'All database queries must use parameterized statements', category: 'security', priority: 'critical', layer: 'data', tags: ['security', 'sql-injection'] } },
          { step: 2, action: 'task', params: { action: 'create', title: 'Audit queries for SQL injection', priority: 4, layer: 'data', tags: ['security', 'audit'] } },
          { step: 3, action: 'task', params: { action: 'link', task_id: 88, link_type: 'constraint', target_id: 1, link_relation: 'enforces' } }
        ]
      }),
      action_sequence: JSON.stringify(['add', 'create', 'link'])
    },

    // CROSS-TOOL WORKFLOW (2 more intermediate)
    {
      category_id: categoryMap.cross_tool_workflow,
      title: 'Coordinate work between agents with message + task',
      complexity: 'intermediate',
      description: 'Send high-priority message to agent requesting work, create task for tracking, link task to message.\n\nExpected Outcome: Agent notified with high priority message, task created for accountability\n\nCommon Pitfalls: ["Not setting correct priority","Creating duplicate tasks","Forgetting to link message to task"]\n\nRelated Tools: ["message", "task"]',
      full_example: JSON.stringify({
        steps: [
          { step: 1, action: 'message', params: { action: 'send', to_agent: 'security-agent', message: 'Please review authentication flow for vulnerabilities', priority: 'high', msg_type: 'request' } },
          { step: 2, action: 'task', params: { action: 'create', title: 'Security review of auth flow', assigned_agent: 'security-agent', priority: 3, tags: ['security', 'review'] } }
        ]
      }),
      action_sequence: JSON.stringify(['send', 'create'])
    },
    {
      category_id: categoryMap.cross_tool_workflow,
      title: 'Configure retention and clear old data',
      complexity: 'intermediate',
      description: 'Update retention settings then manually trigger cleanup to remove old messages and file history.\n\nExpected Outcome: Retention period updated, old data cleaned up, database size reduced\n\nCommon Pitfalls: ["Not enabling weekend-aware mode when needed","Setting retention too short","Running clear during active development"]\n\nRelated Tools: ["config", "stats"]',
      full_example: JSON.stringify({
        steps: [
          { step: 1, action: 'config', params: { action: 'update', messageRetentionHours: 72, weekendAwareMode: true } },
          { step: 2, action: 'stats', params: { action: 'clear' } }
        ]
      }),
      action_sequence: JSON.stringify(['update', 'clear'])
    }
  ];

  await knex('t_help_use_cases').insert(intermediateUseCases);

  // =========================================================================
  // 2. Seed Remaining Advanced Use Cases (6 use-cases)
  // =========================================================================

  const advancedUseCases = [
    {
      category_id: categoryMap.task_management,
      title: 'Multi-task workflow with dependencies, file tracking, and decision links',
      complexity: 'advanced',
      description: 'Create a task chain with dependencies, automatic file watching, and links to architectural decisions. Demonstrates comprehensive task orchestration with context preservation.\n\nExpected Outcome: Task chain established with dependency validation, automatic file tracking active, architectural decisions linked for context\n\nRelated Tools: ["task", "decision", "file"]',
      full_example: JSON.stringify({
        scenario: 'Implementing feature with design → implementation → testing flow',
        total_steps: 8,
        features_used: ['Task dependencies', 'Decision linking', 'Automatic file watching', 'Priority management'],
        outcome: 'Complete workflow established: Design task blocks implementation, implementation blocks testing, all linked to architecture decision, files automatically tracked',
        token_efficiency: 'Full context in ~1.5k tokens vs ~8k tokens if managed manually'
      }),
      action_sequence: JSON.stringify(['create', 'create', 'create', 'add_dependency', 'add_dependency', 'link', 'link', 'watch_files'])
    },
    {
      category_id: categoryMap.decision_tracking,
      title: 'Architecture decision with full context, versioning, and task implementation tracking',
      complexity: 'advanced',
      description: 'Record major architectural decision with comprehensive context (rationale, alternatives, tradeoffs), version it, create implementation tasks, and link everything together for complete audit trail.\n\nExpected Outcome: Architectural decision fully documented with context, implementation tasks created and linked, version history established\n\nRelated Tools: ["decision", "task", "constraint"]',
      full_example: JSON.stringify({
        scenario: 'Selecting database technology for new microservice',
        total_steps: 10,
        decision_factors: ['ACID compliance', 'Query complexity', 'Team expertise', 'Operational costs'],
        alternatives: ['PostgreSQL (chosen)', 'MongoDB (rejected: no transactions)', 'MySQL (rejected: limited JSON)'],
        outcome: 'Decision documented with full rationale, alternatives, and tradeoffs. Implementation tasks created and linked. Constraints added for data layer.',
        context_preservation: 'Complete decision context available for future team members and AI agents'
      }),
      action_sequence: JSON.stringify(['set', 'add_decision_context', 'constraint.add', 'task.create', 'task.link', 'task.link', 'versions'])
    },
    {
      category_id: categoryMap.file_tracking,
      title: 'Multi-layer file change tracking with conflict detection and resolution',
      complexity: 'advanced',
      description: 'Track file changes across multiple architecture layers, detect lock conflicts, coordinate with other agent via messaging, and resolve the conflict.\n\nExpected Outcome: File changes tracked per layer, lock conflict detected and resolved through agent coordination\n\nRelated Tools: ["file", "message", "task"]',
      full_example: JSON.stringify({
        scenario: 'Two agents modifying overlapping files in data and business layers',
        total_steps: 12,
        coordination_steps: ['Check file lock', 'Send coordination message', 'Wait for response', 'Record change after coordination'],
        outcome: 'Conflict avoided through lock detection and agent messaging. Changes tracked with proper layer assignment.',
        prevention: 'Lock checking prevented merge conflicts and data loss'
      }),
      action_sequence: JSON.stringify(['file.check_lock', 'message.send', 'message.get', 'file.record', 'file.record', 'file.get', 'task.watch_files'])
    },
    {
      category_id: categoryMap.constraint_management,
      title: 'Constraint enforcement lifecycle: define, implement, validate, deactivate',
      complexity: 'advanced',
      description: 'Full constraint lifecycle from definition through implementation tasks, validation of enforcement, and eventual deactivation when superseded.\n\nExpected Outcome: Constraint defined with high priority, tasks created to enforce it, validation task tracks compliance, constraint deactivated when no longer needed\n\nRelated Tools: ["constraint", "task", "decision"]',
      full_example: JSON.stringify({
        scenario: 'Enforce API response time constraint across all endpoints',
        total_steps: 15,
        phases: ['Define constraint', 'Create enforcement tasks', 'Implementation', 'Validation', 'Deactivation (if superseded)'],
        outcome: 'Complete constraint lifecycle managed. All API endpoints measured, constraint enforced through tasks, validation tasks created, constraint deactivated when new decision supersedes it.',
        audit_trail: 'Full history of constraint enforcement preserved even after deactivation'
      }),
      action_sequence: JSON.stringify(['constraint.add', 'task.create_batch', 'task.link', 'task.move', 'constraint.get', 'decision.set', 'constraint.deactivate'])
    },
    {
      category_id: categoryMap.cross_tool_workflow,
      title: 'Multi-agent feature development with complete context preservation',
      complexity: 'advanced',
      description: 'End-to-end feature development spanning multiple agents (architect, developer, QA) with full context tracking: decisions, tasks, files, constraints, and messaging.\n\nExpected Outcome: Feature developed with complete audit trail, all agents coordinated, context preserved for future sessions\n\nRelated Tools: ["decision", "task", "file", "constraint", "message"]',
      full_example: JSON.stringify({
        scenario: 'Building payment integration feature',
        agents: ['architect-agent', 'backend-dev', 'frontend-dev', 'qa-agent'],
        total_steps: 25,
        coordination_points: ['Architecture decision (architect)', 'Task assignment (backend-dev)', 'File tracking (all devs)', 'Constraint enforcement (all)', 'QA validation (qa-agent)'],
        outcome: 'Feature complete with: architectural decision documented, 8 tasks created/linked, 15 file changes tracked, 3 constraints enforced, 12 coordination messages sent',
        token_efficiency: 'Complete feature context in ~3k tokens vs ~20k tokens with manual tracking'
      }),
      action_sequence: JSON.stringify(['decision.set', 'decision.add_decision_context', 'task.create_batch', 'constraint.add', 'task.link', 'message.send', 'file.record', 'task.watch_files', 'task.add_dependency', 'task.move', 'stats.layer_summary'])
    },
    {
      category_id: categoryMap.configuration,
      title: 'System health monitoring and optimization workflow',
      complexity: 'advanced',
      description: 'Comprehensive system health check: review database stats, analyze layer distribution, review activity logs, optimize retention settings, clean up old data, and flush WAL.\n\nExpected Outcome: System health assessed, bottlenecks identified, retention optimized, database cleaned and flushed\n\nRelated Tools: ["stats", "config"]',
      full_example: JSON.stringify({
        scenario: 'Weekly system maintenance and optimization',
        total_steps: 10,
        checks: ['Database statistics', 'Layer distribution analysis', 'Activity log review', 'Task status summary', 'Retention optimization', 'Data cleanup', 'WAL flush'],
        outcome: 'Database health verified: 50MB under peak threshold, layer distribution balanced, 200 old messages cleaned, retention optimized for weekend-aware mode, WAL flushed for persistence',
        optimization: 'Identified infrastructure layer has 3x more tasks than other layers, rebalanced workload'
      }),
      action_sequence: JSON.stringify(['stats.db_stats', 'stats.layer_summary', 'stats.activity_log', 'config.get', 'config.update', 'stats.clear', 'stats.flush'])
    }
  ];

  await knex('t_help_use_cases').insert(advancedUseCases);

  console.log(`✅ Seeded ${intermediateUseCases.length + advancedUseCases.length} additional use-cases (10 intermediate + 6 advanced)`);
}

export async function down(knex: Knex): Promise<void> {
  // Remove only the use-cases added in this migration
  // This is tricky without specific IDs, so we'll delete by complexity counts
  // In practice, this would delete the most recent 16 use-cases
  const categories = await knex('m_help_use_case_categories').select('category_id', 'category_name');

  // This is a simplified rollback - in production you'd track specific IDs
  await knex('t_help_use_cases')
    .where('complexity', 'intermediate')
    .orderBy('use_case_id', 'desc')
    .limit(10)
    .delete();

  await knex('t_help_use_cases')
    .where('complexity', 'advanced')
    .orderBy('use_case_id', 'desc')
    .limit(6)
    .delete();
}
