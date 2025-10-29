/**
 * Action Specification Registry for MCP Tool Parameter Validation
 *
 * Centralized registry of all action-specific parameter requirements across
 * sqlew MCP tools. Used by parameter-validator.ts to generate structured
 * error messages with examples and typo suggestions.
 *
 * Each action spec includes:
 * - required: Array of required parameter names
 * - optional: Array of optional parameter names
 * - example: Valid example object demonstrating correct usage
 * - hint: Optional helpful tip for using the action
 */

export interface ActionSpec {
  required: string[];
  optional: string[];
  example: any;
  hint?: string;
}

// ============================================================================
// DECISION TOOL (16 actions)
// ============================================================================

export const DECISION_ACTION_SPECS: Record<string, ActionSpec> = {
  set: {
    required: ['key', 'value'],
    optional: ['agent', 'layer', 'tags', 'status', 'version', 'scopes'],
    example: {
      action: 'set',
      key: 'database/postgresql-choice',
      value: 'Selected PostgreSQL over MongoDB because of complex relational queries and ACID compliance requirements',
      layer: 'data',
      tags: ['database', 'architecture'],
      status: 'active',
      version: '1.0.0'
    },
    hint: "Use 'quick_set' for simpler usage with auto-inferred metadata"
  },

  get: {
    required: ['key'],
    optional: ['include_context'],
    example: {
      action: 'get',
      key: 'database/postgresql-choice',
      include_context: true
    },
    hint: "Set include_context=true to get attached rationale and alternatives"
  },

  list: {
    required: [],
    optional: ['status', 'layer', 'tags', 'scope', 'tag_match', 'limit', 'offset'],
    example: {
      action: 'list',
      status: 'active',
      layer: 'business',
      limit: 20
    }
  },

  search_tags: {
    required: ['tags'],
    optional: ['match_mode', 'status', 'layer'],
    example: {
      action: 'search_tags',
      tags: ['security', 'authentication'],
      match_mode: 'AND',
      status: 'active'
    },
    hint: "Use match_mode='AND' to find decisions with ALL tags, 'OR' for ANY tag"
  },

  search_layer: {
    required: ['layer'],
    optional: ['status', 'include_tags'],
    example: {
      action: 'search_layer',
      layer: 'business',
      status: 'active',
      include_tags: true
    },
    hint: "Valid layers: presentation, business, data, infrastructure, cross-cutting"
  },

  versions: {
    required: ['key'],
    optional: [],
    example: {
      action: 'versions',
      key: 'database/postgresql-choice'
    },
    hint: "Returns version history with timestamps and who made changes"
  },

  quick_set: {
    required: ['key', 'value'],
    optional: ['agent', 'layer', 'version', 'status', 'tags', 'scopes'],
    example: {
      action: 'quick_set',
      key: 'api/instruments/oscillator-refactor',
      value: 'Moved oscillator_type to MonophonicSynthConfig for better separation'
    },
    hint: "Auto-infers layer from key prefix (api/*→presentation, db/*→data, service/*→business). Reduces required parameters from 7 to 2."
  },

  search_advanced: {
    required: [],
    optional: [
      'layers', 'tags_all', 'tags_any', 'exclude_tags', 'scopes',
      'updated_after', 'updated_before', 'decided_by', 'statuses',
      'search_text', 'sort_by', 'sort_order', 'limit', 'offset'
    ],
    example: {
      action: 'search_advanced',
      layers: ['business', 'data'],
      tags_all: ['breaking'],
      updated_after: '2025-01-01',
      sort_by: 'updated',
      sort_order: 'desc',
      limit: 20
    },
    hint: "Use tags_all for AND logic (must have ALL tags), tags_any for OR logic (must have ANY tag)"
  },

  set_batch: {
    required: ['decisions'],
    optional: ['atomic'],
    example: {
      action: 'set_batch',
      decisions: [
        { key: 'cache/redis-choice', value: 'Using Redis for session storage', layer: 'infrastructure' },
        { key: 'cache/ttl', value: '3600', layer: 'infrastructure' }
      ],
      atomic: false
    },
    hint: "Use atomic:false for best-effort batch operations (recommended for AI agents). Set atomic:true only when all-or-nothing is required. Max 50 decisions per batch."
  },

  has_updates: {
    required: ['agent_name', 'since_timestamp'],
    optional: [],
    example: {
      action: 'has_updates',
      agent_name: 'my-agent',
      since_timestamp: '2025-10-14T08:00:00Z'
    },
    hint: "Lightweight polling mechanism (~5-10 tokens per check). Use ISO 8601 timestamp format."
  },

  set_from_template: {
    required: ['template', 'key', 'value'],
    optional: ['agent', 'layer', 'version', 'status', 'tags', 'scopes'],
    example: {
      action: 'set_from_template',
      template: 'breaking_change',
      key: 'api/remove-legacy-endpoint',
      value: 'Removed /v1/users endpoint - migrate to /v2/users'
    },
    hint: "Built-in templates: breaking_change, security_vulnerability, performance_optimization, deprecation, architecture_decision"
  },

  create_template: {
    required: ['name', 'defaults'],
    optional: ['required_fields', 'created_by'],
    example: {
      action: 'create_template',
      name: 'bug_fix',
      defaults: {
        layer: 'business',
        tags: ['bug', 'fix'],
        status: 'active'
      },
      created_by: 'team-lead'
    },
    hint: "Templates enable reusable decision patterns with consistent metadata"
  },

  list_templates: {
    required: [],
    optional: [],
    example: {
      action: 'list_templates'
    },
    hint: "Returns both built-in and custom templates"
  },

  hard_delete: {
    required: ['key'],
    optional: [],
    example: {
      action: 'hard_delete',
      key: 'old-test-decision'
    },
    hint: "⚠️ IRREVERSIBLE! Permanently deletes decision and all history. Use for cleanup after migration or removing sensitive data."
  },

  add_decision_context: {
    required: ['key', 'rationale'],
    optional: ['alternatives_considered', 'tradeoffs', 'decided_by', 'related_task_id', 'related_constraint_id'],
    example: {
      action: 'add_decision_context',
      key: 'database/postgresql-choice',
      rationale: 'PostgreSQL chosen for ACID compliance and complex query support',
      alternatives_considered: ['MongoDB', 'MySQL', 'SQLite'],
      tradeoffs: {
        pros: ['Strong ACID compliance', 'Advanced query features'],
        cons: ['Slightly higher resource usage', 'Steeper learning curve']
      },
      decided_by: 'architecture-team'
    },
    hint: "Add rich context explaining WHY decisions were made, not just WHAT was decided"
  },

  list_decision_contexts: {
    required: [],
    optional: ['decision_key', 'related_task_id', 'related_constraint_id', 'decided_by', 'limit', 'offset'],
    example: {
      action: 'list_decision_contexts',
      decision_key: 'database/postgresql-choice',
      limit: 50
    },
    hint: "Query decision contexts with optional filters for traceability"
  }
};

// ============================================================================
// TASK TOOL (12 actions)
// ============================================================================

export const TASK_ACTION_SPECS: Record<string, ActionSpec> = {
  create: {
    required: ['title'],
    optional: ['description', 'acceptance_criteria', 'notes', 'priority', 'assigned_agent', 'created_by_agent', 'layer', 'tags', 'status', 'watch_files'],
    example: {
      action: 'create',
      title: 'Implement JWT authentication',
      description: 'Add JWT-based authentication to /api/login endpoint',
      priority: 3,
      assigned_agent: 'backend-agent',
      layer: 'business',
      tags: ['authentication', 'security'],
      watch_files: ['src/api/auth.ts', 'src/middleware/jwt.ts']
    },
    hint: "⭐ Use watch_files to automatically link and monitor files. Priority: 1=low, 2=medium, 3=high, 4=critical"
  },

  update: {
    required: ['task_id'],
    optional: ['title', 'priority', 'assigned_agent', 'layer', 'description', 'acceptance_criteria', 'notes', 'watch_files'],
    example: {
      action: 'update',
      task_id: 5,
      priority: 4,
      assigned_agent: 'senior-backend-agent',
      watch_files: ['src/api/users.ts']
    },
    hint: "Only specified fields will be updated; others remain unchanged"
  },

  get: {
    required: ['task_id'],
    optional: ['include_dependencies'],
    example: {
      action: 'get',
      task_id: 5,
      include_dependencies: true
    },
    hint: "Set include_dependencies=true to see blocking/blocked relationships"
  },

  list: {
    required: [],
    optional: ['status', 'assigned_agent', 'layer', 'tags', 'limit', 'offset', 'include_dependency_counts'],
    example: {
      action: 'list',
      status: 'in_progress',
      assigned_agent: 'backend-agent',
      limit: 20
    },
    hint: "Valid statuses: todo, in_progress, waiting_review, blocked, done, archived"
  },

  move: {
    required: ['task_id', 'new_status'],
    optional: [],
    example: {
      action: 'move',
      task_id: 5,
      new_status: 'in_progress'
    },
    hint: "Status transitions are validated. E.g., can't move from 'todo' directly to 'done'"
  },

  link: {
    required: ['task_id', 'link_type', 'target_id'],
    optional: ['link_relation'],
    example: {
      action: 'link',
      task_id: 5,
      link_type: 'decision',
      target_id: 'api/auth-method',
      link_relation: 'implements'
    },
    hint: "⚠️ link_type='file' is DEPRECATED in v3.4.1. Use watch_files parameter or watch_files action instead."
  },

  archive: {
    required: ['task_id'],
    optional: [],
    example: {
      action: 'archive',
      task_id: 5
    },
    hint: "Task must be in 'done' status before archiving"
  },

  batch_create: {
    required: ['tasks'],
    optional: ['atomic'],
    example: {
      action: 'batch_create',
      tasks: [
        { title: 'Design API', priority: 3 },
        { title: 'Implement API', priority: 3 },
        { title: 'Write tests', priority: 2 }
      ],
      atomic: false
    },
    hint: "Max 50 tasks per batch. Use atomic:false for best-effort creation."
  },

  add_dependency: {
    required: ['blocker_task_id', 'blocked_task_id'],
    optional: [],
    example: {
      action: 'add_dependency',
      blocker_task_id: 1,
      blocked_task_id: 2
    },
    hint: "Task #1 must complete before Task #2 can start. Prevents circular dependencies."
  },

  remove_dependency: {
    required: ['blocker_task_id', 'blocked_task_id'],
    optional: [],
    example: {
      action: 'remove_dependency',
      blocker_task_id: 1,
      blocked_task_id: 2
    },
    hint: "Silently succeeds even if dependency doesn't exist (idempotent)"
  },

  get_dependencies: {
    required: ['task_id'],
    optional: ['include_details'],
    example: {
      action: 'get_dependencies',
      task_id: 2,
      include_details: false
    },
    hint: "Returns bidirectional: tasks that block this task AND tasks this task blocks"
  },

  watch_files: {
    required: ['task_id', 'action'],
    optional: ['file_paths'],
    example: {
      action: 'watch_files',
      task_id: 5,
      subaction: 'watch',
      file_paths: ['src/api/auth.ts', 'src/middleware/jwt.ts']
    },
    hint: "⭐ NEW in v3.4.1: Replaces task.link(file). Actions: watch, unwatch, list"
  }
};

// ============================================================================
// FILE TOOL (4 actions)
// ============================================================================

export const FILE_ACTION_SPECS: Record<string, ActionSpec> = {
  record: {
    required: ['file_path', 'agent_name', 'change_type'],
    optional: ['layer', 'description'],
    example: {
      action: 'record',
      file_path: 'src/api/auth.ts',
      agent_name: 'refactor-agent',
      change_type: 'modified',
      layer: 'business',
      description: 'Added JWT validation'
    },
    hint: "Valid change_type: created, modified, deleted"
  },

  get: {
    required: [],
    optional: ['file_path', 'agent_name', 'layer', 'change_type', 'since', 'limit'],
    example: {
      action: 'get',
      agent_name: 'refactor-agent',
      layer: 'business',
      limit: 10
    },
    hint: "Use 'since' with ISO 8601 timestamp for time-based filtering"
  },

  check_lock: {
    required: ['file_path'],
    optional: ['lock_duration'],
    example: {
      action: 'check_lock',
      file_path: 'src/database/schema.sql',
      lock_duration: 300
    },
    hint: "Default lock_duration is 300 seconds (5 minutes). Prevents concurrent edits."
  },

  record_batch: {
    required: ['file_changes'],
    optional: ['atomic'],
    example: {
      action: 'record_batch',
      file_changes: [
        { file_path: 'src/api.ts', agent_name: 'bot1', change_type: 'modified', layer: 'presentation' },
        { file_path: 'src/types.ts', agent_name: 'bot1', change_type: 'modified', layer: 'data' }
      ],
      atomic: false
    },
    hint: "Max 50 file changes per batch. Use atomic:false for best-effort recording."
  }
};

// ============================================================================
// CONSTRAINT TOOL (3 actions)
// ============================================================================

export const CONSTRAINT_ACTION_SPECS: Record<string, ActionSpec> = {
  add: {
    required: ['category', 'constraint_text', 'priority'],
    optional: ['layer', 'tags', 'created_by'],
    example: {
      action: 'add',
      category: 'performance',
      constraint_text: 'API response time must be <100ms for 95th percentile',
      priority: 'high',
      layer: 'business',
      tags: ['api', 'latency']
    },
    hint: "Valid categories: performance, architecture, security. Valid priorities: low, medium, high, critical"
  },

  get: {
    required: [],
    optional: ['category', 'layer', 'priority', 'tags', 'limit'],
    example: {
      action: 'get',
      category: 'performance',
      priority: 'high',
      limit: 50
    },
    hint: "Returns only active constraints by default"
  },

  deactivate: {
    required: ['constraint_id'],
    optional: [],
    example: {
      action: 'deactivate',
      constraint_id: 5
    },
    hint: "Soft delete - constraint remains in database but marked inactive"
  }
};

// ============================================================================
// STATS TOOL (5 actions)
// ============================================================================

export const STATS_ACTION_SPECS: Record<string, ActionSpec> = {
  layer_summary: {
    required: [],
    optional: [],
    example: {
      action: 'layer_summary'
    },
    hint: "Returns decision, file change, and constraint counts per layer"
  },

  db_stats: {
    required: [],
    optional: [],
    example: {
      action: 'db_stats'
    },
    hint: "Comprehensive statistics including task counts by status and priority"
  },

  clear: {
    required: [],
    optional: ['messages_older_than_hours', 'file_changes_older_than_days'],
    example: {
      action: 'clear',
      messages_older_than_hours: 48,
      file_changes_older_than_days: 14
    },
    hint: "If no parameters provided, uses config-based weekend-aware retention"
  },

  activity_log: {
    required: [],
    optional: ['since', 'agent_names', 'actions', 'limit'],
    example: {
      action: 'activity_log',
      since: '1h',
      agent_names: ['bot1', 'bot2'],
      limit: 50
    },
    hint: "Use relative time formats: '5m', '1h', '2d' or ISO 8601 timestamps"
  },

  flush: {
    required: [],
    optional: [],
    example: {
      action: 'flush'
    },
    hint: "Forces WAL checkpoint to flush pending transactions. Run before git commits."
  }
};

// ============================================================================
// MASTER REGISTRY
// ============================================================================

export const ACTION_SPECS_BY_TOOL: Record<string, Record<string, ActionSpec>> = {
  decision: DECISION_ACTION_SPECS,
  task: TASK_ACTION_SPECS,
  file: FILE_ACTION_SPECS,
  constraint: CONSTRAINT_ACTION_SPECS,
  stats: STATS_ACTION_SPECS
};

/**
 * Get action specification for a tool/action combination
 * @param tool Tool name (e.g., 'decision', 'task')
 * @param action Action name (e.g., 'set', 'create')
 * @returns Action specification or null if not found
 */
export function getActionSpec(tool: string, action: string): ActionSpec | null {
  const toolSpecs = ACTION_SPECS_BY_TOOL[tool];
  if (!toolSpecs) {
    return null;
  }
  return toolSpecs[action] || null;
}

/**
 * Check if an action exists for a tool
 * @param tool Tool name
 * @param action Action name
 * @returns True if action exists
 */
export function hasAction(tool: string, action: string): boolean {
  return getActionSpec(tool, action) !== null;
}

/**
 * Get all action names for a tool
 * @param tool Tool name
 * @returns Array of action names or empty array if tool not found
 */
export function getToolActions(tool: string): string[] {
  const toolSpecs = ACTION_SPECS_BY_TOOL[tool];
  if (!toolSpecs) {
    return [];
  }
  return Object.keys(toolSpecs);
}
