/**
 * Task example documentation
 */

/**
 * Get comprehensive examples for task tool
 */
export function taskExample(): any {
  return {
    tool: 'task',
    description: 'Comprehensive task management examples for Kanban-style workflow',
    scenarios: {
      basic_task_management: {
        title: 'Creating and Managing Tasks',
        examples: [
          {
            scenario: 'Create a new task',
            request: '{ action: "create", title: "Implement user authentication", description: "Add JWT-based auth to API", priority: 3, assigned_agent: "backend-agent", layer: "business", tags: ["authentication", "security"], file_actions: [{ path: "src/auth/service.ts", action: "create" }, { path: "src/middleware/auth.ts", action: "modify" }] }',
            explanation: 'Creates task in todo status with high priority. file_actions REQUIRED for business layer.'
          },
          {
            scenario: 'Get task details',
            request: '{ action: "get", task_id: 5 }',
            response: 'Full task details including metadata, links, and timestamps'
          },
          {
            scenario: 'List tasks by status',
            request: '{ action: "list", status: "in_progress", limit: 20 }',
            explanation: 'View all in-progress tasks'
          }
        ]
      },
      status_workflow: {
        title: 'Task Lifecycle (Status Transitions)',
        workflow: [
          {
            step: 1,
            status: 'todo',
            action: '{ action: "create", title: "...", status: "todo" }',
            description: 'Task created and waiting to be started'
          },
          {
            step: 2,
            status: 'in_progress',
            action: '{ action: "move", task_id: 1, status: "in_progress" }',
            description: 'Agent starts working on task'
          },
          {
            step: 3,
            status: 'waiting_review',
            action: '{ action: "move", task_id: 1, status: "waiting_review" }',
            description: 'Work complete, awaiting review/approval'
          },
          {
            step: 4,
            status: 'done',
            action: '{ action: "move", task_id: 1, status: "done" }',
            description: 'Task reviewed and completed'
          },
          {
            step: 5,
            status: 'archived',
            action: '{ action: "archive", task_id: 1 }',
            description: 'Task archived for historical record'
          }
        ],
        blocked_status: {
          description: 'Use "blocked" when task cannot proceed due to dependencies',
          example: '{ action: "move", task_id: 1, status: "blocked" }'
        }
      },
      auto_stale_detection: {
        title: 'Automatic Stale Task Management',
        behavior: [
          {
            rule: 'in_progress > 2 hours → waiting_review',
            explanation: 'Tasks stuck in progress auto-move to waiting_review',
            rationale: 'Prevents tasks from being forgotten while in progress'
          },
          {
            rule: 'waiting_review > 24 hours → todo',
            explanation: 'Unreviewed tasks return to todo queue',
            rationale: 'Ensures waiting tasks dont accumulate indefinitely'
          }
        ],
        configuration: {
          keys: ['task_stale_hours_in_progress', 'task_stale_hours_waiting_review', 'task_auto_stale_enabled'],
          note: 'Configure via config table in database'
        }
      },
      task_linking: {
        title: 'Linking Tasks to Context',
        examples: [
          {
            scenario: 'Link task to decision',
            request: '{ action: "link", task_id: 5, link_type: "decision", target_id: "api_auth_method", link_relation: "implements" }',
            explanation: 'Track which tasks implement specific decisions'
          },
          {
            scenario: 'Link task to constraint',
            request: '{ action: "link", task_id: 5, link_type: "constraint", target_id: 3, link_relation: "addresses" }',
            explanation: 'Show task addresses a performance/architecture/security constraint'
          },
          {
            scenario: 'Link task to file',
            request: '{ action: "link", task_id: 5, link_type: "file", target_id: "src/api/auth.ts", link_relation: "modifies" }',
            explanation: 'Activates automatic file watching for the task - saves 300 tokens per file vs manual registration',
            behavior: 'File watcher monitors linked files and validates acceptance criteria when files change'
          }
        ]
      },
      batch_operations: {
        title: 'Batch Task Creation',
        examples: [
          {
            scenario: 'Create multiple related tasks',
            request: '{ action: "create_batch", tasks: [{"title": "Design API", "priority": 3}, {"title": "Implement API", "priority": 3}, {"title": "Write tests", "priority": 2}], atomic: false }',
            explanation: 'Create task breakdown - use atomic:false for best-effort'
          }
        ]
      },
      filtering_queries: {
        title: 'Advanced Task Queries',
        examples: [
          {
            scenario: 'Find high-priority tasks for agent',
            request: '{ action: "list", assigned_agent: "backend-agent", priority: 3, status: "todo" }',
            note: 'Priority is numeric: 1=low, 2=medium, 3=high, 4=critical'
          },
          {
            scenario: 'Get all security-related tasks',
            request: '{ action: "list", tags: ["security"], limit: 50 }',
            explanation: 'Filter by tags for topic-based views'
          },
          {
            scenario: 'View infrastructure layer tasks',
            request: '{ action: "list", layer: "infrastructure" }',
            explanation: 'See all DevOps/config related tasks'
          },
          {
            scenario: 'View planning layer tasks (v3.8.0)',
            request: '{ action: "list", layer: "planning" }',
            explanation: 'Planning tasks (research, surveys) - file_actions optional'
          },
          {
            scenario: 'View coordination layer tasks (v3.8.0)',
            request: '{ action: "list", layer: "coordination" }',
            explanation: 'Multi-agent orchestration tasks - file_actions optional'
          }
        ]
      },
      file_watcher_status: {
        title: 'File Watcher Status Queries',
        examples: [
          {
            scenario: 'Check if file watcher is running',
            request: '{ action: "watcher", subaction: "status" }',
            explanation: 'Returns running status, files watched count, tasks monitored count',
            response: '{ running: true, files_watched: 5, tasks_monitored: 3 }'
          },
          {
            scenario: 'List all files being watched',
            request: '{ action: "watcher", subaction: "list_files" }',
            explanation: 'Shows file paths and which tasks are watching them',
            response: '{ files: [{ file_path: "src/api/auth.ts", tasks: [{ task_id: 5, title: "...", status: "in_progress" }] }] }'
          },
          {
            scenario: 'List tasks with active file watchers',
            request: '{ action: "watcher", subaction: "list_tasks" }',
            explanation: 'Shows tasks and which files they are watching',
            response: '{ tasks: [{ task_id: 5, title: "...", files: ["src/api/auth.ts", "src/api/middleware.ts"] }] }'
          }
        ]
      }
    },
    valid_transitions: {
      from_todo: ['in_progress', 'blocked', 'done', 'archived'],
      from_in_progress: ['waiting_review', 'blocked', 'todo'],
      from_waiting_review: ['done', 'in_progress', 'todo'],
      from_blocked: ['todo', 'in_progress'],
      from_done: ['archived', 'todo'],
      from_archived: []
    },
    best_practices: {
      task_creation: [
        'Use descriptive titles (200 char max)',
        'Set appropriate priority: 1=low, 2=medium (default), 3=high, 4=critical',
        'Assign to layer where work will be done',
        'Tag comprehensively for easy filtering',
        'Include acceptance_criteria for complex tasks',
        '⭐ v3.8.0: Specify file_actions for code/documentation layers (presentation, business, data, infrastructure, cross-cutting, documentation)',
        '📝 v3.8.0: file_actions optional for planning layers (planning, coordination, review)'
      ],
      status_management: [
        'Move to in_progress when starting work',
        'Use waiting_review for completed but unverified work',
        'Set to blocked with notes explaining dependency',
        'Archive done tasks periodically for cleaner views'
      ],
      linking: [
        '⭐ RECOMMENDED: Set up file watchers for all tasks involving code changes (except exceptional cases)',
        'Link tasks to decisions they implement',
        'Link to constraints they address',
        'Link files to activate automatic file watching (save 300 tokens per file vs manual registration)',
        'Use descriptive link_relation values'
      ],
      coordination: [
        'Use assigned_agent for clear ownership',
        'Filter by status for Kanban board views',
        'Monitor auto-stale transitions for stuck work',
        'Use tags for cross-cutting concerns (security, performance, etc.)'
      ]
    }
  };
}
