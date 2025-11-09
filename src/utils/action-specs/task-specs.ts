/**
 * Task Tool Action Specifications
 *
 * Parameter requirements and examples for all task tool actions (12 actions).
 * Used for Kanban task management with dependencies and file watching.
 */

import { ActionSpec } from './types.js';

export const TASK_ACTION_SPECS: Record<string, ActionSpec> = {
  create: {
    required: ['title'],
    optional: ['description', 'acceptance_criteria', 'notes', 'priority', 'assigned_agent', 'created_by_agent', 'layer', 'tags', 'status', 'watch_files', 'file_actions'],
    example: {
      action: 'create',
      title: 'Implement JWT authentication',
      description: 'Add JWT-based authentication to /api/login endpoint',
      priority: 3,
      assigned_agent: 'backend-agent',
      layer: 'business',
      tags: ['authentication', 'security'],
      file_actions: [{ action: 'create', path: 'src/api/auth.ts' }, { action: 'edit', path: 'src/middleware/jwt.ts' }]
    },
    hint: "⭐ v3.8.0: Use file_actions for layer-based validation. Priority: 1=low, 2=medium, 3=high, 4=critical. Code layers REQUIRE file_actions."
  },

  update: {
    required: ['task_id'],
    optional: ['title', 'priority', 'assigned_agent', 'layer', 'description', 'acceptance_criteria', 'notes', 'watch_files', 'file_actions'],
    example: {
      action: 'update',
      task_id: 5,
      priority: 4,
      assigned_agent: 'senior-backend-agent',
      file_actions: [{ action: 'edit', path: 'src/api/users.ts' }]
    },
    hint: "v3.8.0: file_actions replaces watch_files. Only specified fields will be updated; others remain unchanged"
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

  create_batch: {
    required: ['tasks'],
    optional: ['atomic'],
    example: {
      action: 'create_batch',
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
