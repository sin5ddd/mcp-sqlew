/**
 * Task help documentation
 */

/**
 * Return comprehensive help documentation
 */
export function taskHelp(): any {
  return {
    tool: 'task',
    description: 'Kanban Task Watcher for managing tasks with AI-optimized lifecycle states',
    note: '💡 TIP: Use action: "example" to see comprehensive usage scenarios and real-world examples for all task actions.',
    important: '🚨 AUTOMATIC FILE WATCHING: Linking files to tasks activates automatic file change monitoring and acceptance criteria validation. You can save 300 tokens per file compared to registering watchers manually. See auto_file_tracking section below.',
    actions: {
      create: {
        description: 'Create a new task',
        required_params: ['title'],
        optional_params: ['description', 'acceptance_criteria', 'notes', 'priority', 'assigned_agent', 'created_by_agent', 'layer', 'tags', 'status', 'watch_files', 'file_actions'],
        watch_files_param: '⚠️ DEPRECATED in v3.8.0: Use file_actions instead (auto-converts for backward compatibility)',
        file_actions_param: '⭐ NEW in v3.8.0: Array of {path, action} objects for layer-based file tracking',
        file_actions_validation: {
          required_for_layers: ['presentation', 'business', 'data', 'infrastructure', 'cross-cutting', 'documentation'],
          optional_for_layers: ['planning', 'coordination', 'review'],
          valid_actions: ['create', 'modify', 'delete', 'read'],
          note: 'Code and documentation layers MUST specify file_actions. Planning layers MAY specify file_actions.'
        },
        example: {
          action: 'create',
          title: 'Implement authentication endpoint',
          description: 'Add JWT-based authentication to /api/login',
          priority: 3,
          assigned_agent: 'backend-agent',
          layer: 'presentation',
          tags: ['api', 'authentication'],
          file_actions: [
            { path: 'src/api/auth.ts', action: 'create' },
            { path: 'src/middleware/jwt.ts', action: 'modify' }
          ]
        }
      },
      update: {
        description: 'Update task metadata',
        required_params: ['task_id'],
        optional_params: ['title', 'priority', 'assigned_agent', 'layer', 'description', 'acceptance_criteria', 'notes', 'watch_files', 'file_actions'],
        watch_files_param: '⚠️ DEPRECATED in v3.8.0: Use file_actions instead (auto-converts for backward compatibility)',
        file_actions_param: '⭐ NEW in v3.8.0: Array of {path, action} objects for layer-based file tracking',
        example: {
          action: 'update',
          task_id: 5,
          priority: 4,
          assigned_agent: 'senior-backend-agent',
          file_actions: [
            { path: 'src/api/users.ts', action: 'modify' }
          ]
        }
      },
      get: {
        description: 'Get full task details including descriptions and links',
        required_params: ['task_id'],
        example: {
          action: 'get',
          task_id: 5
        }
      },
      list: {
        description: 'List tasks (token-efficient, no descriptions)',
        required_params: [],
        optional_params: ['status', 'assigned_agent', 'layer', 'tags', 'limit', 'offset'],
        example: {
          action: 'list',
          status: 'in_progress',
          assigned_agent: 'backend-agent',
          limit: 20
        }
      },
      move: {
        description: 'Move task to different status with validation',
        required_params: ['task_id', 'new_status'],
        valid_statuses: ['todo', 'in_progress', 'waiting_review', 'blocked', 'done', 'archived'],
        transitions: {
          todo: ['in_progress', 'blocked'],
          in_progress: ['waiting_review', 'blocked', 'done'],
          waiting_review: ['in_progress', 'todo', 'done'],
          blocked: ['todo', 'in_progress'],
          done: ['archived'],
          archived: []
        },
        example: {
          action: 'move',
          task_id: 5,
          new_status: 'in_progress'
        }
      },
      link: {
        description: 'Link task to decision/constraint/file',
        required_params: ['task_id', 'link_type', 'target_id'],
        optional_params: ['link_relation'],
        link_types: ['decision', 'constraint', 'file'],
        file_linking_behavior: '⚠️  DEPRECATED in v3.4.1: link_type="file" is deprecated. Use watch_files action or watch_files parameter instead.',
        deprecation_note: 'For file watching, use: (1) watch_files parameter in create/update, or (2) watch_files action with watch/unwatch/list',
        example: {
          action: 'link',
          task_id: 5,
          link_type: 'decision',
          target_id: 'auth_method',
          link_relation: 'implements'
        }
      },
      watch_files: {
        description: '⭐ NEW in v3.4.1: Watch/unwatch files for a task (replaces task.link(file))',
        required_params: ['task_id', 'action'],
        optional_params: ['file_paths'],
        actions: ['watch', 'unwatch', 'list'],
        behavior: {
          watch: 'Add files to watch list and activate file monitoring',
          unwatch: 'Remove files from watch list',
          list: 'List all files currently watched by this task'
        },
        examples: {
          watch: {
            task_id: 5,
            action: 'watch',
            file_paths: ['src/api/auth.ts', 'src/middleware/jwt.ts']
          },
          unwatch: {
            task_id: 5,
            action: 'unwatch',
            file_paths: ['src/middleware/jwt.ts']
          },
          list: {
            task_id: 5,
            action: 'list'
          }
        },
        note: 'Preferred over task.link(file) for better clarity and batch operations'
      },
      archive: {
        description: 'Archive completed task (must be in done status)',
        required_params: ['task_id'],
        example: {
          action: 'archive',
          task_id: 5
        }
      },
      create_batch: {
        description: 'Create multiple tasks atomically',
        required_params: ['tasks'],
        optional_params: ['atomic'],
        limits: {
          max_items: 50
        },
        note: '⚠️  IMPORTANT: The "tasks" parameter must be a JavaScript array, not a JSON string. MCP tools require pre-parsed objects.',
        example: {
          action: 'create_batch',
          tasks: [
            { title: 'Task 1', priority: 2 },
            { title: 'Task 2', priority: 3, layer: 'business' }
          ],
          atomic: true
        }
      },
      add_dependency: {
        description: 'Add blocking relationship between tasks',
        required_params: ['blocker_task_id', 'blocked_task_id'],
        validations: [
          'No self-dependencies',
          'No circular dependencies (direct or transitive)',
          'Both tasks must exist',
          'Neither task can be archived'
        ],
        example: {
          action: 'add_dependency',
          blocker_task_id: 1,
          blocked_task_id: 2
        },
        note: 'Task #1 must be completed before Task #2 can start'
      },
      remove_dependency: {
        description: 'Remove blocking relationship between tasks',
        required_params: ['blocker_task_id', 'blocked_task_id'],
        example: {
          action: 'remove_dependency',
          blocker_task_id: 1,
          blocked_task_id: 2
        },
        note: 'Silently succeeds even if dependency does not exist'
      },
      get_dependencies: {
        description: 'Query task dependencies (bidirectional)',
        required_params: ['task_id'],
        optional_params: ['include_details'],
        returns: {
          blockers: 'Array of tasks that block this task',
          blocking: 'Array of tasks this task blocks'
        },
        example: {
          action: 'get_dependencies',
          task_id: 2,
          include_details: true
        },
        note: 'Defaults to metadata-only (token-efficient). Set include_details=true for full task details.'
      },
      watcher: {
        description: 'Query file watcher status and monitored files/tasks',
        required_params: [],
        optional_params: ['subaction'],
        subactions: ['status', 'list_files', 'list_tasks', 'help'],
        default_subaction: 'status',
        examples: {
          status: {
            action: 'watcher',
            subaction: 'status'
          },
          list_files: {
            action: 'watcher',
            subaction: 'list_files'
          },
          list_tasks: {
            action: 'watcher',
            subaction: 'list_tasks'
          }
        },
        note: 'Use to monitor which files/tasks are being watched. File watching activates automatically when you link files to tasks.'
      },
      help: {
        description: 'Return this help documentation',
        example: { action: 'help' }
      }
    },
    auto_stale_detection: {
      description: 'Tasks automatically transition when abandoned',
      behavior: {
        in_progress: 'Untouched for >2 hours → waiting_review',
        waiting_review: 'Untouched for >24 hours → todo'
      },
      config_keys: {
        task_stale_hours_in_progress: 'Hours before in_progress tasks go stale (default: 2)',
        task_stale_hours_waiting_review: 'Hours before waiting_review tasks go stale (default: 24)',
        task_auto_stale_enabled: 'Enable/disable auto-stale detection (default: true)'
      }
    },
    priority_levels: {
      1: 'low',
      2: 'medium (default)',
      3: 'high',
      4: 'critical'
    },
    layers: {
      description: 'Architecture layers for task classification (expanded in v3.8.0)',
      code_layers: {
        presentation: 'UI/UX, API endpoints, views - REQUIRES file_actions',
        business: 'Business logic, services, domain models - REQUIRES file_actions',
        data: 'Database, repositories, data access - REQUIRES file_actions',
        infrastructure: 'DevOps, config, deployment - REQUIRES file_actions',
        cross_cutting: 'Logging, security, error handling - REQUIRES file_actions'
      },
      planning_layers: {
        planning: 'Research, surveys, investigation, design decisions - file_actions OPTIONAL',
        documentation: 'README, CHANGELOG, API docs, user guides - REQUIRES file_actions',
        coordination: 'Multi-agent orchestration, sprint planning - file_actions OPTIONAL',
        review: 'Code review, QA verification, testing validation - file_actions OPTIONAL'
      },
      note: 'Code and documentation layers enforce file_actions requirement. Planning layers allow tasks without file modifications.'
    },
    auto_file_tracking: {
      description: 'Automatic file watching and acceptance criteria validation - save 300 tokens per file vs manual registration',
      recommendation: '⭐ BEST PRACTICE: Except in exceptional cases, it is recommended to set up file watchers for all tasks that involve code changes. This provides automatic status tracking with zero token overhead.',
      how_it_works: [
        '1. Link files to tasks using the link action with link_type="file"',
        '2. File watcher automatically activates and monitors linked files',
        '3. When files are saved, watcher detects changes',
        '4. If task has acceptance_criteria, watcher validates criteria against changes',
        '5. Results appear in terminal output with pass/fail status'
      ],
      requirements: [
        'Task must have files linked via link action',
        'File paths must be relative to project root (e.g., "src/api/auth.ts")',
        'Watcher only monitors files explicitly linked to tasks'
      ],
      token_efficiency: 'File watching happens in background. No MCP tokens consumed until you query status. Manual file tracking would cost ~500-1000 tokens per file check.',
      documentation_reference: 'docs/AUTO_FILE_TRACKING.md - Complete guide with examples'
    },
    documentation: {
      task_overview: 'docs/TASK_OVERVIEW.md - Lifecycle, status transitions, auto-stale detection (363 lines, ~10k tokens)',
      task_actions: 'docs/TASK_ACTIONS.md - All action references with examples (854 lines, ~21k tokens)',
      task_linking: 'docs/TASK_LINKING.md - Link tasks to decisions/constraints/files (729 lines, ~18k tokens)',
      task_migration: 'docs/TASK_MIGRATION.md - Migrate from decision-based tracking (701 lines, ~18k tokens)',
      tool_selection: 'docs/TOOL_SELECTION.md - Task vs decision vs constraint comparison (236 lines, ~12k tokens)',
      workflows: 'docs/WORKFLOWS.md - Multi-agent task coordination workflows (602 lines, ~30k tokens)',
      shared_concepts: 'docs/SHARED_CONCEPTS.md - Layer definitions, enum values (status/priority), atomic mode (339 lines, ~17k tokens)'
    }
  };
}
