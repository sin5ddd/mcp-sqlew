/**
 * Migration: Seed Help System Data - All Complexity Levels (v3.6.0)
 *
 * Seeds the help system database with 41 use-cases covering all 6 use-case
 * categories from the taxonomy:
 * - 18 basic complexity use-cases (single action)
 * - 15 intermediate complexity use-cases (2-3 actions)
 * - 8 advanced complexity use-cases (4-6+ actions, multi-tool orchestration)
 *
 * Distribution by Category:
 * - task_management: 9 use-cases (4 basic, 3 intermediate, 2 advanced)
 * - decision_tracking: 8 use-cases (4 basic, 3 intermediate, 1 advanced)
 * - file_tracking: 6 use-cases (3 basic, 2 intermediate, 1 advanced)
 * - constraint_management: 4 use-cases (2 basic, 2 intermediate, 0 advanced)
 * - cross_tool_workflow: 8 use-cases (2 basic, 3 intermediate, 3 advanced)
 * - configuration: 6 use-cases (3 basic, 2 intermediate, 1 advanced)
 *
 * Each use-case includes:
 * - Title: Clear, actionable description
 * - Complexity: 'basic' (single action), 'intermediate' (2-3 actions), or 'advanced' (4-6+ actions)
 * - Description: Detailed explanation
 * - Full Example: JSON with action and params (or complex multi-step scenario for advanced)
 * - Action Sequence: JSON array of action names
 * - Expected Outcome (intermediate/advanced): What success looks like
 * - Common Pitfalls (intermediate): Typical mistakes to avoid
 * - Related Tools (intermediate): Cross-tool dependencies
 * - Real-world scenarios (advanced): Production use-case context
 */

import { Database } from 'better-sqlite3';

interface MigrationResult {
  success: boolean;
  message: string;
  details?: string[];
}

/**
 * Check if seed data is needed
 */
export function needsHelpDataSeeding(db: Database): boolean {
  // Check if use case categories are already seeded
  const categoryCount = db.prepare(
    'SELECT COUNT(*) as count FROM m_help_use_case_categories'
  ).get() as { count: number };

  return categoryCount.count === 0;
}

/**
 * Seed use case categories
 */
function seedCategories(db: Database): void {
  const categories = [
    {
      name: 'task_management',
      description: 'Use cases focused on creating, organizing, tracking, and coordinating development tasks through the Kanban-style task system.'
    },
    {
      name: 'decision_tracking',
      description: 'Use cases for recording, retrieving, and versioning architectural decisions, design choices, and shared context across agents.'
    },
    {
      name: 'file_tracking',
      description: 'Use cases for tracking file modifications, detecting edit conflicts, and maintaining change history with layer associations.'
    },
    {
      name: 'constraint_management',
      description: 'Use cases for defining, enforcing, and tracking architectural constraints, requirements, and limitations.'
    },
    {
      name: 'cross_tool_workflow',
      description: 'Use cases that demonstrate multi-step workflows spanning multiple tools, showing how tools integrate for complex scenarios.'
    },
    {
      name: 'configuration',
      description: 'Use cases for managing system configuration, viewing statistics, and performing maintenance operations.'
    }
  ];

  const stmt = db.prepare(`
    INSERT INTO m_help_use_case_categories (category_name, description)
    VALUES (?, ?)
  `);

  for (const category of categories) {
    stmt.run(category.name, category.description);
  }
}

/**
 * Seed basic complexity use cases
 */
function seedBasicUseCases(db: Database): void {
  const useCases = [
    // =========================================================================
    // TASK MANAGEMENT (3 use-cases)
    // =========================================================================

    // Basic: Create a simple task
    {
      category: 'task_management',
      title: 'Create a simple task',
      complexity: 'basic',
      description: 'Create a new task with a title, priority level, and layer assignment. This is the most fundamental task operation for tracking development work.',
      full_example: JSON.stringify({
        action: 'task',
        params: {
          action: 'create',
          title: 'Implement user authentication',
          priority: 3,
          layer: 'business'
        }
      }),
      action_sequence: JSON.stringify(['create'])
    },

    // Basic: Update task status
    {
      category: 'task_management',
      title: 'Update task status',
      complexity: 'basic',
      description: 'Move a task to a new status (e.g., from "todo" to "in_progress"). The system validates status transitions according to the state machine.',
      full_example: JSON.stringify({
        action: 'task',
        params: {
          action: 'move',
          task_id: 1,
          new_status: 'in_progress'
        }
      }),
      action_sequence: JSON.stringify(['move'])
    },

    // Basic: Query tasks by status
    {
      category: 'task_management',
      title: 'List tasks by status',
      complexity: 'basic',
      description: 'Retrieve all tasks with a specific status (e.g., all "in_progress" tasks). Returns metadata-only for token efficiency.',
      full_example: JSON.stringify({
        action: 'task',
        params: {
          action: 'list',
          status: 'in_progress'
        }
      }),
      action_sequence: JSON.stringify(['list'])
    },

    // =========================================================================
    // DECISION TRACKING (3 use-cases)
    // =========================================================================

    // Basic: Set a simple decision
    {
      category: 'decision_tracking',
      title: 'Record a simple decision',
      complexity: 'basic',
      description: 'Store a key-value decision with metadata (tags, layer, scope). This is the fundamental operation for tracking architectural choices.',
      full_example: JSON.stringify({
        action: 'decision',
        params: {
          action: 'set',
          decision_key: 'auth_method',
          value: 'JWT',
          tags: ['authentication', 'security'],
          layer: 'business',
          scope: 'auth-module'
        }
      }),
      action_sequence: JSON.stringify(['set'])
    },

    // Basic: Retrieve a decision by key
    {
      category: 'decision_tracking',
      title: 'Get a decision by key',
      complexity: 'basic',
      description: 'Retrieve a specific decision by its key. Returns the current value along with all metadata (tags, layer, version, timestamp).',
      full_example: JSON.stringify({
        action: 'decision',
        params: {
          action: 'get',
          decision_key: 'auth_method'
        }
      }),
      action_sequence: JSON.stringify(['get'])
    },

    // Basic: Search decisions by tag
    {
      category: 'decision_tracking',
      title: 'Search decisions by single tag',
      complexity: 'basic',
      description: 'Find all decisions tagged with a specific tag (e.g., "authentication"). Useful for finding related decisions by topic.',
      full_example: JSON.stringify({
        action: 'decision',
        params: {
          action: 'search_tags',
          tags: ['authentication']
        }
      }),
      action_sequence: JSON.stringify(['search_tags'])
    },

    // =========================================================================
    // FILE TRACKING (2 use-cases)
    // =========================================================================

    // Basic: Record a file change
    {
      category: 'file_tracking',
      title: 'Record a file modification',
      complexity: 'basic',
      description: 'Track a file change (created, modified, or deleted) with layer assignment. Essential for change history and conflict detection.',
      full_example: JSON.stringify({
        action: 'file',
        params: {
          action: 'record',
          file_path: 'src/auth/login.ts',
          change_type: 'modified',
          layer: 'business',
          description: 'Added JWT token validation'
        }
      }),
      action_sequence: JSON.stringify(['record'])
    },

    // Basic: Check file lock status
    {
      category: 'file_tracking',
      title: 'Check if file is locked',
      complexity: 'basic',
      description: 'Check if a file is currently locked by another agent to prevent concurrent edit conflicts. Returns lock status and lock holder info.',
      full_example: JSON.stringify({
        action: 'file',
        params: {
          action: 'check_lock',
          file_path: 'src/auth/login.ts'
        }
      }),
      action_sequence: JSON.stringify(['check_lock'])
    },

    // =========================================================================
    // CONSTRAINT MANAGEMENT (2 use-cases)
    // =========================================================================

    // Basic: Add a constraint
    {
      category: 'constraint_management',
      title: 'Add a performance constraint',
      complexity: 'basic',
      description: 'Define a new constraint with priority, category, and layer. Constraints guide implementation decisions and enforce architectural rules.',
      full_example: JSON.stringify({
        action: 'constraint',
        params: {
          action: 'add',
          constraint_text: 'All API endpoints must respond within 200ms',
          category: 'performance',
          priority: 'high',
          layer: 'business',
          tags: ['api', 'performance']
        }
      }),
      action_sequence: JSON.stringify(['add'])
    },

    // Basic: Get active constraints
    {
      category: 'constraint_management',
      title: 'List all active constraints',
      complexity: 'basic',
      description: 'Retrieve all currently active constraints. Returns constraints with their priority, category, tags, and layer metadata.',
      full_example: JSON.stringify({
        action: 'constraint',
        params: {
          action: 'get',
          active_only: true
        }
      }),
      action_sequence: JSON.stringify(['get'])
    },

    // =========================================================================
    // CROSS-TOOL WORKFLOW (2 use-cases)
    // =========================================================================

    // Basic: Link task to decision
    {
      category: 'cross_tool_workflow',
      title: 'Link a task to a decision',
      complexity: 'basic',
      description: 'Create a reference between a task and a decision to provide context. This helps track which tasks implement which architectural choices.',
      full_example: JSON.stringify({
        action: 'task',
        params: {
          action: 'link',
          task_id: 1,
          link_type: 'decision',
          target_id: 'auth_method',
          link_relation: 'implements'
        }
      }),
      action_sequence: JSON.stringify(['link'])
    },

    // Basic: Send inter-agent message
    {
      category: 'cross_tool_workflow',
      title: 'Send a message to another agent',
      complexity: 'basic',
      description: 'Send a priority-based message to another agent for coordination. Supports agent-to-agent communication in multi-agent workflows.',
      full_example: JSON.stringify({
        action: 'message',
        params: {
          action: 'send',
          to_agent: 'dev-agent',
          message: 'Please review authentication implementation',
          msg_type: 'request',
          priority: 'high'
        }
      }),
      action_sequence: JSON.stringify(['send'])
    },

    // =========================================================================
    // CONFIGURATION (2 use-cases)
    // =========================================================================

    // Basic: Update retention settings
    {
      category: 'configuration',
      title: 'Update message retention period',
      complexity: 'basic',
      description: 'Change the auto-deletion retention period for messages (in hours). Weekend-aware mode can be enabled to skip weekends in retention calculations.',
      full_example: JSON.stringify({
        action: 'config',
        params: {
          action: 'update',
          messageRetentionHours: 48
        }
      }),
      action_sequence: JSON.stringify(['update'])
    },

    // Basic: View layer summary statistics
    {
      category: 'configuration',
      title: 'Get architecture layer summary',
      complexity: 'basic',
      description: 'View aggregated statistics per architecture layer (presentation, business, data, infrastructure, cross-cutting). Shows decision counts, file changes, and task distribution.',
      full_example: JSON.stringify({
        action: 'stats',
        params: {
          action: 'layer_summary'
        }
      }),
      action_sequence: JSON.stringify(['layer_summary'])
    },

    // =========================================================================
    // ADDITIONAL BASIC USE-CASES (4 more for better coverage)
    // =========================================================================

    // Basic: Add task tags
    {
      category: 'task_management',
      title: 'Add tags to a task',
      complexity: 'basic',
      description: 'Update a task to add metadata tags for better categorization and searchability. Tags help organize tasks by topic or feature.',
      full_example: JSON.stringify({
        action: 'task',
        params: {
          action: 'update',
          task_id: 1,
          tags: ['authentication', 'security', 'backend']
        }
      }),
      action_sequence: JSON.stringify(['update'])
    },

    // Basic: Set numeric decision
    {
      category: 'decision_tracking',
      title: 'Record a numeric decision value',
      complexity: 'basic',
      description: 'Store a decision with a numeric value (e.g., max connection pool size). Numeric values are stored efficiently in a separate table.',
      full_example: JSON.stringify({
        action: 'decision',
        params: {
          action: 'set',
          decision_key: 'max_db_connections',
          value: 50,
          tags: ['database', 'performance'],
          layer: 'data'
        }
      }),
      action_sequence: JSON.stringify(['set'])
    },

    // Basic: Get file change history
    {
      category: 'file_tracking',
      title: 'View recent file changes',
      complexity: 'basic',
      description: 'Retrieve recent file change history with filtering options. Shows who modified what files, when, and in which layer.',
      full_example: JSON.stringify({
        action: 'file',
        params: {
          action: 'get',
          limit: 10
        }
      }),
      action_sequence: JSON.stringify(['get'])
    },

    // Basic: Get database statistics
    {
      category: 'configuration',
      title: 'View database statistics',
      complexity: 'basic',
      description: 'Get comprehensive database statistics including table row counts, storage usage, and activity metrics. Useful for monitoring system health.',
      full_example: JSON.stringify({
        action: 'stats',
        params: {
          action: 'db_stats'
        }
      }),
      action_sequence: JSON.stringify(['db_stats'])
    }
  ];

  const stmt = db.prepare(`
    INSERT INTO t_help_use_cases (category_id, title, complexity, description, full_example, action_sequence)
    VALUES (
      (SELECT category_id FROM m_help_use_case_categories WHERE category_name = ?),
      ?, ?, ?, ?, ?
    )
  `);

  for (const useCase of useCases) {
    stmt.run(
      useCase.category,
      useCase.title,
      useCase.complexity,
      useCase.description,
      useCase.full_example,
      useCase.action_sequence
    );
  }
}

/**
 * Seed intermediate complexity use cases
 */
function seedIntermediateUseCases(db: Database): void {
  const useCases = [
    // =========================================================================
    // TASK MANAGEMENT (3 use-cases)
    // =========================================================================

    // Intermediate: Create task and link to decision
    {
      category: 'task_management',
      title: 'Create task and link to architectural decision',
      complexity: 'intermediate',
      description: 'Create a development task and associate it with an existing architectural decision for context tracking',
      full_example: JSON.stringify({
        steps: [
          {
            step: 1,
            action: 'task',
            params: {
              action: 'create',
              title: 'Implement OAuth authentication',
              description: 'Add OAuth flow per architecture decision',
              priority: 3,
              tags: ['authentication', 'security']
            }
          },
          {
            step: 2,
            action: 'task',
            params: {
              action: 'link',
              task_id: 42,
              link_type: 'decision',
              target_id: 'auth-method',
              link_relation: 'implements'
            }
          }
        ]
      }),
      action_sequence: JSON.stringify(['create', 'link']),
      expected_outcome: 'Task created and linked to decision, enabling context retrieval during development',
      common_pitfalls: JSON.stringify([
        'Linking before task creation (must create first)',
        'Using wrong link_type value',
        'Forgetting to specify link_relation'
      ]),
      related_tools: JSON.stringify(['decision'])
    },

    // Intermediate: Move task through status transitions
    {
      category: 'task_management',
      title: 'Move task through validated status transitions',
      complexity: 'intermediate',
      description: 'Update task status from todo → in_progress → waiting_review with validation at each step',
      full_example: JSON.stringify({
        steps: [
          {
            step: 1,
            action: 'task',
            params: {
              action: 'move',
              task_id: 42,
              new_status: 'in_progress',
              notes: 'Started OAuth implementation'
            }
          },
          {
            step: 2,
            action: 'task',
            params: {
              action: 'update',
              task_id: 42,
              description: 'OAuth flow completed, needs code review'
            }
          },
          {
            step: 3,
            action: 'task',
            params: {
              action: 'move',
              task_id: 42,
              new_status: 'waiting_review',
              notes: 'Ready for review'
            }
          }
        ]
      }),
      action_sequence: JSON.stringify(['move', 'update', 'move']),
      expected_outcome: 'Task progressed through workflow with validated state transitions and audit trail',
      common_pitfalls: JSON.stringify([
        'Invalid state transitions (e.g., todo → done directly)',
        'Missing notes for context',
        'Not updating task details before status change'
      ]),
      related_tools: JSON.stringify([])
    },

    // Intermediate: Create task with file tracking
    {
      category: 'task_management',
      title: 'Create task with automatic file tracking',
      complexity: 'intermediate',
      description: 'Create a task and set up automatic tracking of files being modified during implementation',
      full_example: JSON.stringify({
        steps: [
          {
            step: 1,
            action: 'task',
            params: {
              action: 'create',
              title: 'Refactor authentication module',
              priority: 2,
              layer: 'business',
              tags: ['refactoring']
            }
          },
          {
            step: 2,
            action: 'task',
            params: {
              action: 'watch_files',
              task_id: 55,
              file_paths: [
                'src/auth/provider.ts',
                'src/auth/validator.ts',
                'src/tests/auth.test.ts'
              ]
            }
          }
        ]
      }),
      action_sequence: JSON.stringify(['create', 'watch_files']),
      expected_outcome: 'Task created with automatic file change tracking enabled',
      common_pitfalls: JSON.stringify([
        'File paths must be relative from project root',
        'Watching files before task creation',
        'Not including test files in tracking'
      ]),
      related_tools: JSON.stringify(['file'])
    },

    // =========================================================================
    // DECISION TRACKING (3 use-cases)
    // =========================================================================

    // Intermediate: Create decision with context
    {
      category: 'decision_tracking',
      title: 'Record decision with rich context and metadata',
      complexity: 'intermediate',
      description: 'Set an architectural decision with tags, layer, scope, and detailed context including rationale and alternatives',
      full_example: JSON.stringify({
        steps: [
          {
            step: 1,
            action: 'decision',
            params: {
              action: 'set',
              decision_key: 'database-choice',
              value: 'PostgreSQL',
              tags: ['architecture', 'data-layer'],
              layer: 'data',
              scope: 'backend',
              status: 'active'
            }
          },
          {
            step: 2,
            action: 'decision',
            params: {
              action: 'add_decision_context',
              decision_key: 'database-choice',
              rationale: 'Need ACID compliance and complex queries',
              alternatives_considered: [
                'MongoDB (rejected: no transactions)',
                'MySQL (rejected: limited JSON support)'
              ],
              tradeoffs: {
                pros: ['ACID compliance', 'Rich query support', 'JSON columns'],
                cons: ['Higher resource usage', 'Complex setup']
              }
            }
          }
        ]
      }),
      action_sequence: JSON.stringify(['set', 'add_decision_context']),
      expected_outcome: 'Decision recorded with comprehensive context for future reference and team handoffs',
      common_pitfalls: JSON.stringify([
        'Adding context before setting decision',
        'Not documenting alternatives considered',
        'Missing tradeoffs analysis'
      ]),
      related_tools: JSON.stringify([])
    },

    // Intermediate: Search decisions with filters
    {
      category: 'decision_tracking',
      title: 'Search decisions using multiple criteria',
      complexity: 'intermediate',
      description: 'Find decisions by combining tag filters, layer filtering, and time-based queries',
      full_example: JSON.stringify({
        steps: [
          {
            step: 1,
            action: 'decision',
            params: {
              action: 'search_tags',
              tags: ['security', 'authentication'],
              tag_match: 'AND'
            }
          },
          {
            step: 2,
            action: 'decision',
            params: {
              action: 'search_layer',
              layer: 'business',
              statuses: ['active'],
              include_context: true
            }
          }
        ]
      }),
      action_sequence: JSON.stringify(['search_tags', 'search_layer']),
      expected_outcome: 'Refined decision set matching multiple criteria with full context',
      common_pitfalls: JSON.stringify([
        'Using OR when AND is needed for tag matching',
        'Not filtering by status (includes deprecated)',
        'Forgetting to include_context for full information'
      ]),
      related_tools: JSON.stringify([])
    },

    // Intermediate: Update decision with version history
    {
      category: 'decision_tracking',
      title: 'Update decision and track version history',
      complexity: 'intermediate',
      description: 'Modify an existing decision and retrieve its version history to understand evolution',
      full_example: JSON.stringify({
        steps: [
          {
            step: 1,
            action: 'decision',
            params: {
              action: 'get',
              decision_key: 'max-file-size'
            }
          },
          {
            step: 2,
            action: 'decision',
            params: {
              action: 'set',
              decision_key: 'max-file-size',
              value: '25MB',
              rationale: 'Increased based on user feedback'
            }
          },
          {
            step: 3,
            action: 'decision',
            params: {
              action: 'versions',
              decision_key: 'max-file-size'
            }
          }
        ]
      }),
      action_sequence: JSON.stringify(['get', 'set', 'versions']),
      expected_outcome: 'Decision updated with version history preserved for audit trail',
      common_pitfalls: JSON.stringify([
        'Not checking current value before updating',
        'Missing rationale for updates',
        'Overwriting without considering version history'
      ]),
      related_tools: JSON.stringify([])
    },

    // =========================================================================
    // FILE TRACKING (2 use-cases)
    // =========================================================================

    // Intermediate: Check lock before editing
    {
      category: 'file_tracking',
      title: 'Check file lock status before editing',
      complexity: 'intermediate',
      description: 'Verify file is not locked by another agent before making modifications to prevent conflicts',
      full_example: JSON.stringify({
        steps: [
          {
            step: 1,
            action: 'file',
            params: {
              action: 'check_lock',
              file_path: 'src/models/user.ts'
            }
          },
          {
            step: 2,
            action: 'message',
            params: {
              action: 'send',
              to_agent: 'dev-agent-2',
              message: 'Need to edit user.ts, can you commit?',
              priority: 'high',
              msg_type: 'request'
            }
          }
        ]
      }),
      action_sequence: JSON.stringify(['check_lock', 'send']),
      expected_outcome: 'Conflict avoided by checking lock status and coordinating with other agent',
      common_pitfalls: JSON.stringify([
        'Not checking lock before editing (causes merge conflicts)',
        'Ignoring lock status warnings',
        'Not communicating with locking agent'
      ]),
      related_tools: JSON.stringify(['message'])
    },

    // Intermediate: Track file changes with layers
    {
      category: 'file_tracking',
      title: 'Track file modifications with architectural layers',
      complexity: 'intermediate',
      description: 'Record multiple file changes with proper layer assignment for architecture tracking',
      full_example: JSON.stringify({
        steps: [
          {
            step: 1,
            action: 'file',
            params: {
              action: 'record',
              file_path: 'src/api/routes/auth.ts',
              change_type: 'modified',
              layer: 'presentation',
              description: 'Added OAuth endpoints'
            }
          },
          {
            step: 2,
            action: 'file',
            params: {
              action: 'record',
              file_path: 'src/services/auth-service.ts',
              change_type: 'modified',
              layer: 'business',
              description: 'Implemented OAuth logic'
            }
          },
          {
            step: 3,
            action: 'file',
            params: {
              action: 'get',
              since: '1h'
            }
          }
        ]
      }),
      action_sequence: JSON.stringify(['record', 'record', 'get']),
      expected_outcome: 'File changes tracked with architectural context for impact analysis',
      common_pitfalls: JSON.stringify([
        'Incorrect layer assignment',
        'Missing description for context',
        'Not retrieving changes to verify recording'
      ]),
      related_tools: JSON.stringify([])
    },

    // =========================================================================
    // CONSTRAINT MANAGEMENT (2 use-cases)
    // =========================================================================

    // Intermediate: Add constraint and filter by layer
    {
      category: 'constraint_management',
      title: 'Add constraint and filter by architectural layer',
      complexity: 'intermediate',
      description: 'Create a performance constraint and retrieve all constraints for the data layer',
      full_example: JSON.stringify({
        steps: [
          {
            step: 1,
            action: 'constraint',
            params: {
              action: 'add',
              constraint_text: 'All database queries must complete within 100ms',
              category: 'performance',
              priority: 'high',
              layer: 'data',
              tags: ['database', 'latency']
            }
          },
          {
            step: 2,
            action: 'constraint',
            params: {
              action: 'get',
              layer: 'data',
              active_only: true
            }
          }
        ]
      }),
      action_sequence: JSON.stringify(['add', 'get']),
      expected_outcome: 'Performance constraint added and verified against other data layer constraints',
      common_pitfalls: JSON.stringify([
        'Wrong category selection',
        'Not specifying layer for architecture alignment',
        'Missing tags for searchability'
      ]),
      related_tools: JSON.stringify([])
    },

    // Intermediate: Link constraint to task
    {
      category: 'constraint_management',
      title: 'Associate constraint with implementation task',
      complexity: 'intermediate',
      description: 'Link an existing security constraint to a task to ensure compliance during development',
      full_example: JSON.stringify({
        steps: [
          {
            step: 1,
            action: 'constraint',
            params: {
              action: 'get',
              category: 'security',
              priority: 'critical'
            }
          },
          {
            step: 2,
            action: 'task',
            params: {
              action: 'link',
              task_id: 88,
              link_type: 'constraint',
              target_id: 12,
              link_relation: 'must_comply_with'
            }
          }
        ]
      }),
      action_sequence: JSON.stringify(['get', 'link']),
      expected_outcome: 'Task linked to security constraint for compliance verification during code review',
      common_pitfalls: JSON.stringify([
        'Using decision link instead of constraint link',
        'Not verifying constraint exists before linking',
        'Missing link_relation specification'
      ]),
      related_tools: JSON.stringify(['task'])
    },

    // =========================================================================
    // CROSS-TOOL WORKFLOW (3 use-cases)
    // =========================================================================

    // Intermediate: Full feature workflow
    {
      category: 'cross_tool_workflow',
      title: 'Full feature workflow: task + decision + file tracking',
      complexity: 'intermediate',
      description: 'Set up complete feature context by creating task, linking architectural decision, and enabling file tracking',
      full_example: JSON.stringify({
        steps: [
          {
            step: 1,
            action: 'task',
            params: {
              action: 'create',
              title: 'Implement caching layer',
              priority: 3,
              layer: 'infrastructure',
              tags: ['performance', 'caching']
            }
          },
          {
            step: 2,
            action: 'task',
            params: {
              action: 'link',
              task_id: 99,
              link_type: 'decision',
              target_id: 'cache-strategy',
              link_relation: 'implements'
            }
          },
          {
            step: 3,
            action: 'task',
            params: {
              action: 'watch_files',
              task_id: 99,
              file_paths: ['src/cache/redis-client.ts', 'src/middleware/cache.ts']
            }
          }
        ]
      }),
      action_sequence: JSON.stringify(['create', 'link', 'watch_files']),
      expected_outcome: 'Complete feature context established with task, decision, and automatic file tracking',
      common_pitfalls: JSON.stringify([
        'Wrong action sequence (must create before linking)',
        'Not tracking test files',
        'Missing layer assignment for architecture clarity'
      ]),
      related_tools: JSON.stringify(['task', 'decision', 'file'])
    },

    // Intermediate: Decision + constraint + task coordination
    {
      category: 'cross_tool_workflow',
      title: 'Coordinate decision, constraint, and task implementation',
      complexity: 'intermediate',
      description: 'Record architectural decision, add compliance constraint, then create task linking both',
      full_example: JSON.stringify({
        steps: [
          {
            step: 1,
            action: 'decision',
            params: {
              action: 'set',
              decision_key: 'api-rate-limit',
              value: '1000 req/min',
              tags: ['performance', 'api'],
              layer: 'presentation'
            }
          },
          {
            step: 2,
            action: 'constraint',
            params: {
              action: 'add',
              constraint_text: 'Rate limiting must use Redis for distributed systems',
              category: 'architecture',
              priority: 'high',
              layer: 'infrastructure',
              tags: ['rate-limiting', 'redis']
            }
          },
          {
            step: 3,
            action: 'task',
            params: {
              action: 'create',
              title: 'Implement rate limiting',
              priority: 3,
              tags: ['rate-limiting']
            }
          }
        ]
      }),
      action_sequence: JSON.stringify(['set', 'add', 'create']),
      expected_outcome: 'Complete implementation context with decision and compliance constraint',
      common_pitfalls: JSON.stringify([
        'Not linking both decision and constraint',
        'Mismatched tags across tools',
        'Wrong layer assignments'
      ]),
      related_tools: JSON.stringify(['decision', 'constraint', 'task'])
    },

    // Intermediate: Message-driven task coordination
    {
      category: 'cross_tool_workflow',
      title: 'Multi-agent task handoff with messaging',
      complexity: 'intermediate',
      description: 'Coordinate task handoff between agents using priority messages and status updates',
      full_example: JSON.stringify({
        steps: [
          {
            step: 1,
            action: 'task',
            params: {
              action: 'move',
              task_id: 50,
              new_status: 'waiting_review',
              notes: 'Backend implementation complete'
            }
          },
          {
            step: 2,
            action: 'message',
            params: {
              action: 'send',
              to_agent: 'qa-agent',
              message: 'Task 50 ready for review',
              priority: 'high',
              msg_type: 'request',
              payload: { task_id: 50, type: 'code_review' }
            }
          },
          {
            step: 3,
            action: 'message',
            params: {
              action: 'get',
              unread_only: true,
              priority_filter: 'high'
            }
          }
        ]
      }),
      action_sequence: JSON.stringify(['move', 'send', 'get']),
      expected_outcome: 'Task handoff completed with clear communication and priority signaling',
      common_pitfalls: JSON.stringify([
        'Wrong message priority for urgency',
        'Not including task_id in payload',
        'Missing msg_type specification'
      ]),
      related_tools: JSON.stringify(['task', 'message'])
    },

    // =========================================================================
    // CONFIGURATION (2 use-cases)
    // =========================================================================

    // Intermediate: Update and verify config
    {
      category: 'configuration',
      title: 'Modify retention settings and verify configuration',
      complexity: 'intermediate',
      description: 'Update message and file retention settings, then retrieve config to verify changes',
      full_example: JSON.stringify({
        steps: [
          {
            step: 1,
            action: 'config',
            params: {
              action: 'update',
              messageRetentionHours: 48,
              fileHistoryRetentionDays: 14,
              ignoreWeekend: true
            }
          },
          {
            step: 2,
            action: 'config',
            params: {
              action: 'get'
            }
          }
        ]
      }),
      action_sequence: JSON.stringify(['update', 'get']),
      expected_outcome: 'Retention settings updated and verified for weekend-aware cleanup',
      common_pitfalls: JSON.stringify([
        'Setting values outside allowed ranges',
        'Not enabling weekend mode for production',
        'Not verifying changes after update'
      ]),
      related_tools: JSON.stringify([])
    },

    // Intermediate: Analyze layer distribution
    {
      category: 'configuration',
      title: 'Review layer statistics to identify architecture bottlenecks',
      complexity: 'intermediate',
      description: 'Get layer summary statistics and database stats to analyze system usage patterns',
      full_example: JSON.stringify({
        steps: [
          {
            step: 1,
            action: 'stats',
            params: {
              action: 'layer_summary'
            }
          },
          {
            step: 2,
            action: 'stats',
            params: {
              action: 'db_stats'
            }
          },
          {
            step: 3,
            action: 'stats',
            params: {
              action: 'activity_log',
              since: '24h',
              limit: 20
            }
          }
        ]
      }),
      action_sequence: JSON.stringify(['layer_summary', 'db_stats', 'activity_log']),
      expected_outcome: 'Identified data layer as bottleneck for refactoring focus',
      common_pitfalls: JSON.stringify([
        'Not analyzing layer distribution regularly',
        'Ignoring activity patterns',
        'Not using insights for architecture decisions'
      ]),
      related_tools: JSON.stringify([])
    }
  ];

  const stmt = db.prepare(`
    INSERT INTO t_help_use_cases (
      category_id, title, complexity, description, full_example, action_sequence
    )
    VALUES (
      (SELECT category_id FROM m_help_use_case_categories WHERE category_name = ?),
      ?, ?, ?, ?, ?
    )
  `);

  for (const useCase of useCases) {
    // Embed metadata (expected_outcome, common_pitfalls, related_tools) into description
    let fullDescription = useCase.description;
    if (useCase.expected_outcome) {
      fullDescription += `\n\nExpected Outcome: ${useCase.expected_outcome}`;
    }
    if (useCase.common_pitfalls) {
      fullDescription += `\n\nCommon Pitfalls: ${useCase.common_pitfalls}`;
    }
    if (useCase.related_tools) {
      fullDescription += `\n\nRelated Tools: ${useCase.related_tools}`;
    }

    stmt.run(
      useCase.category,
      useCase.title,
      useCase.complexity,
      fullDescription,
      useCase.full_example,
      useCase.action_sequence
    );
  }
}

/**
 * Seed advanced complexity use cases (Task 212)
 */
function seedAdvancedUseCases(db: Database): void {
  const useCases = [
    // =========================================================================
    // CROSS-TOOL WORKFLOW (3 advanced use-cases) - Priority Category
    // =========================================================================

    // Advanced #1: Complete Feature Development Lifecycle
    {
      category: 'cross_tool_workflow',
      title: 'Complete feature development lifecycle with multi-agent coordination',
      complexity: 'advanced',
      description: 'End-to-end workflow tracking a feature from initial task creation through architectural decision, implementation with file tracking, constraint enforcement, and final completion. Demonstrates coordination between architect, developer, and reviewer agents.',
      full_example: JSON.stringify({
        scenario: 'Building authentication feature for API',
        agents: ['architect', 'developer', 'reviewer'],
        total_steps: 12,
        outcome: 'Feature successfully implemented with full context preservation: architectural decision documented with rationale, security constraints enforced, file changes tracked across layers, multi-agent coordination logged.',
        token_savings: 'All context preserved in ~2k tokens vs ~15k tokens if documented in messages'
      }),
      action_sequence: JSON.stringify(['task.create', 'decision.set', 'decision.add_decision_context', 'constraint.add', 'task.link', 'task.move', 'file.record', 'message.send', 'constraint.get']),
      expected_outcome: 'Feature complete with full audit trail, decision rationale documented, constraints enforced, and multi-agent handoffs coordinated',
      related_tools: JSON.stringify(['task', 'decision', 'file', 'constraint', 'message'])
    },

    // Advanced #2: Multi-Agent Collaboration Pattern
    {
      category: 'cross_tool_workflow',
      title: 'Multi-agent collaboration with priority escalation and context sharing',
      complexity: 'advanced',
      description: 'Complex coordination pattern where multiple agents collaborate on a high-priority incident. Demonstrates message prioritization, context sharing through decisions, constraint validation, and parallel file modifications with lock detection.',
      full_example: JSON.stringify({
        scenario: 'Critical security vulnerability discovered in production',
        agents: ['security-analyst', 'developer', 'devops', 'tech-lead'],
        urgency: 'critical',
        total_steps: 14,
        outcome: 'Critical security incident resolved in coordinated manner. Full audit trail preserved: messages show communication flow, file changes tracked, constraint added to prevent recurrence, decision documents fix approach.',
        coordination_pattern: 'critical-alert → parallel-notification → lock-check → fix → deploy → validate'
      }),
      action_sequence: JSON.stringify(['task.create', 'message.send', 'constraint.add', 'message.get', 'file.check_lock', 'task.move', 'file.record', 'decision.set', 'file.get', 'stats.layer_summary']),
      expected_outcome: 'Security incident resolved with coordinated response, full audit trail, and preventive constraint added',
      related_tools: JSON.stringify(['task', 'message', 'constraint', 'file', 'decision', 'stats'])
    },

    // Advanced #3: Git-Aware Feature Branch Workflow
    {
      category: 'cross_tool_workflow',
      title: 'Git-aware development workflow with VCS auto-complete and conflict resolution',
      complexity: 'advanced',
      description: 'Complete feature branch workflow integrated with version control. Demonstrates VCS-aware task tracking, automatic task completion on commit/merge, whitelist exemptions for work-in-progress, and handling merge conflicts with context preservation.',
      full_example: JSON.stringify({
        scenario: 'Feature development with Git integration and VCS auto-complete',
        vcs_system: 'Git',
        branch_strategy: 'feature branches with PR workflow',
        total_steps: 20,
        outcome: 'Complete feature development lifecycle with Git integration. VCS watcher automatically completed task on merge to main. Work-in-progress commits on feature branch correctly did NOT trigger premature completion.',
        vcs_integration_features: {
          auto_complete: 'Task automatically completed when watched files merged to main branch',
          whitelist_exemption: 'Work-in-progress commits on feature branch did NOT trigger auto-complete',
          conflict_detection: 'File lock system prevented concurrent edits during PR review',
          audit_trail: 'All commits linked to file change records for full traceability'
        },
        token_efficiency: 'VCS integration eliminates manual status updates, reducing coordination messages by ~60%'
      }),
      action_sequence: JSON.stringify(['task.create', 'decision.set', 'task.move', 'file.record_batch', 'constraint.add', 'file.record', 'task.get', 'file.get', 'constraint.get', 'message.send', 'task.watcher', 'task.list', 'stats.activity_log']),
      expected_outcome: 'Feature merged with automatic task completion, full Git integration, and comprehensive audit trail',
      related_tools: JSON.stringify(['task', 'decision', 'file', 'constraint', 'message', 'stats'])
    },

    // =========================================================================
    // TASK MANAGEMENT (2 advanced use-cases)
    // =========================================================================

    // Advanced #4: Task Dependency Chain
    {
      category: 'task_management',
      title: 'Complex task dependency chain with blocking relationships and validation',
      complexity: 'advanced',
      description: 'Create interdependent task chain for database migration project. Demonstrates dependency management, circular detection, blocking status handling, and automatic dependency resolution when blockers complete.',
      full_example: JSON.stringify({
        scenario: 'Database schema migration across multiple services',
        complexity_factors: ['Multiple dependencies', 'Circular detection', 'Blocking status handling'],
        total_steps: 15,
        dependency_graph: {
          'Task 1 (schema design)': 'ROOT - no blockers',
          'Task 2 (migration scripts)': 'blocked by Task 1',
          'Task 3 (API models)': 'blocked by Task 1',
          'Task 4 (staging deployment)': 'blocked by Task 2 AND Task 3'
        },
        outcome: 'Complex dependency chain established with validation. Circular dependency attempt correctly rejected. Task completion automatically unblocks dependent tasks.',
        validation_features: ['Circular detection', 'Multiple blocker support', 'Automatic unblocking', 'Dependency graph queries']
      }),
      action_sequence: JSON.stringify(['task.create', 'task.add_dependency', 'task.get_dependencies', 'task.list', 'task.move', 'task.remove_dependency']),
      expected_outcome: 'Dependency chain validated with circular detection, multiple blockers supported, automatic unblocking on completion',
      related_tools: JSON.stringify([])
    },

    // Advanced #5: Feature Development with Auto-Stale Detection Recovery
    {
      category: 'task_management',
      title: 'Long-running feature with interruptions and auto-stale detection',
      complexity: 'advanced',
      description: 'Feature development interrupted by urgent bugs and context switches. Demonstrates auto-stale detection (in_progress >2h → waiting_review, waiting_review >24h → todo), task recovery, acceptance criteria validation, and linking across decisions, files, and constraints.',
      full_example: JSON.stringify({
        scenario: 'Implementing real-time notifications feature with interruptions',
        duration: '3 days with interruptions',
        auto_stale_triggers: 2,
        total_steps: 21,
        timeline: {
          'Day 1 10:00': 'Started implementation',
          'Day 1 11:30': 'Interrupted by critical bug',
          'Day 1 13:30': 'AUTO-STALE: in_progress → waiting_review (>2h inactive)',
          'Day 1 15:30': 'Resumed after bug fix',
          'Day 1 18:00': 'Submitted for review',
          'Day 2 18:00': 'AUTO-STALE: waiting_review → todo (>24h no response)',
          'Day 3 10:00': 'Reassigned to available reviewer',
          'Day 3 11:00': 'Completed'
        },
        auto_stale_benefits: [
          'Prevented forgotten in_progress task from blocking developer',
          'Surfaced abandoned waiting_review task after 24h',
          'Automatic cleanup without manual intervention',
          'Clear audit trail of interruptions and recovery'
        ],
        outcome: 'Feature successfully completed despite 2 interruptions. Auto-stale detection prevented tasks from being forgotten. Full context preserved across context switches.'
      }),
      action_sequence: JSON.stringify(['task.create', 'task.move', 'decision.set', 'file.record', 'task.watcher', 'task.list', 'decision.get', 'file.record_batch', 'task.update', 'file.get', 'constraint.get']),
      expected_outcome: 'Feature complete with auto-recovery from interruptions, acceptance criteria validated, full context preserved',
      related_tools: JSON.stringify(['decision', 'file', 'constraint'])
    },

    // =========================================================================
    // DECISION TRACKING (1 advanced use-case)
    // =========================================================================

    // Advanced #6: Architecture Decision with Rich Context and Version Migration
    {
      category: 'decision_tracking',
      title: 'Document architectural decision with full context and track evolution across versions',
      complexity: 'advanced',
      description: 'Complete architecture decision workflow: initial decision with alternatives analysis, context documentation with tradeoffs, version updates as requirements change, and linking to implementation tasks and constraints.',
      full_example: JSON.stringify({
        scenario: 'Choosing data storage solution for high-throughput analytics',
        decision_lifecycle: 'proposal → evaluation → decision → implementation → evolution',
        total_steps: 12,
        outcome: 'Complete architecture decision lifecycle documented: initial evaluation with alternatives analysis, tradeoffs documented with mitigation strategies, constraints linked, implementation tasks tracked, evolution to v2.0 with lessons learned.',
        context_preservation: '6 months of architectural evolution captured in ~3k tokens vs ~20k tokens in scattered documentation',
        version_history: ['v1.0.0: Single-node TimescaleDB', 'v2.0.0: Multi-node TimescaleDB with lessons learned']
      }),
      action_sequence: JSON.stringify(['decision.set', 'decision.add_decision_context', 'constraint.add', 'task.create', 'task.link', 'decision.get', 'decision.list_decision_contexts', 'decision.versions', 'decision.search_tags']),
      expected_outcome: 'Architecture decision fully documented with alternatives analysis, tradeoffs, constraints, version evolution, and lessons learned',
      related_tools: JSON.stringify(['constraint', 'task'])
    },

    // =========================================================================
    // FILE TRACKING (1 advanced use-case)
    // =========================================================================

    // Advanced #7: Coordinated Multi-File Refactoring
    {
      category: 'file_tracking',
      title: 'Multi-agent refactoring with file lock coordination and batch tracking',
      complexity: 'advanced',
      description: 'Large refactoring across multiple files and layers. Demonstrates lock checking to prevent conflicts, batch file recording for atomic commits, layer-based tracking, and coordination between multiple agents working on related files.',
      full_example: JSON.stringify({
        scenario: 'Extract authentication logic into separate service layer',
        agents: ['refactor-lead', 'developer-1', 'developer-2'],
        affected_files: 8,
        total_steps: 15,
        file_changes_summary: {
          presentation_layer: ['src/controllers/auth-controller.ts (2 modifications)'],
          business_layer: ['src/services/auth-service.ts (created)'],
          infrastructure_layer: ['src/middleware/auth-middleware.ts (modified)'],
          data_layer: ['src/models/user.ts (modified)']
        },
        outcome: 'Multi-file refactoring coordinated successfully. File locks prevented merge conflicts. Batch recording ensured atomic commits. Layer tracking shows proper separation of concerns.',
        coordination_mechanisms: ['Lock detection', 'Message coordination', 'Batch atomic recording', 'Layer-based review', 'Auto-tracking via watch_files']
      }),
      action_sequence: JSON.stringify(['task.create', 'decision.set', 'file.check_lock', 'file.record', 'message.send', 'file.record_batch', 'file.get', 'stats.layer_summary', 'task.move']),
      expected_outcome: 'Multi-file refactoring completed with lock coordination, atomic commits, layer-based validation, and no merge conflicts',
      related_tools: JSON.stringify(['task', 'decision', 'message', 'stats'])
    },

    // =========================================================================
    // CONFIGURATION (1 advanced use-case)
    // =========================================================================

    // Advanced #8: System Monitoring and Performance Optimization
    {
      category: 'configuration',
      title: 'Performance monitoring, bottleneck identification, and retention optimization',
      complexity: 'advanced',
      description: 'Complete system health workflow: analyze activity patterns, identify bottlenecks, optimize retention settings, perform targeted cleanup, and monitor impact. Demonstrates stats analysis, config tuning, and activity log usage.',
      full_example: JSON.stringify({
        scenario: 'System performance degradation investigation',
        problem: 'Database growing too large, queries slowing down',
        total_steps: 18,
        metrics: {
          before: {
            database_size: '2.3GB',
            file_changes_rows: '450k',
            query_time_p95: '450ms',
            retention_file_days: 30
          },
          after: {
            database_size: '0.7GB',
            file_changes_rows: '113k',
            query_time_p95: '95ms',
            retention_file_days: 7
          },
          improvement: {
            size_reduction: '70%',
            performance_gain: '4.7x faster',
            storage_savings: '1.6GB'
          }
        },
        outcome: 'Performance bottleneck identified through systematic analysis. Retention configuration optimized based on actual access patterns. Manual cleanup reclaimed 70% of database space. Query performance improved 4.7x.',
        coordination_features: ['Stats analysis workflow', 'Config optimization', 'Manual cleanup', 'Impact measurement', 'Documentation with context']
      }),
      action_sequence: JSON.stringify(['stats.db_stats', 'stats.layer_summary', 'stats.activity_log', 'decision.set', 'decision.add_decision_context', 'config.get', 'task.create', 'task.link', 'config.update', 'stats.clear', 'decision.search_tags']),
      expected_outcome: 'System performance restored with 70% storage reduction, 4.7x faster queries, and optimized retention settings',
      related_tools: JSON.stringify(['decision', 'task', 'config'])
    }
  ];

  const stmt = db.prepare(`
    INSERT INTO t_help_use_cases (
      category_id, title, complexity, description, full_example, action_sequence
    )
    VALUES (
      (SELECT category_id FROM m_help_use_case_categories WHERE category_name = ?),
      ?, ?, ?, ?, ?
    )
  `);

  for (const useCase of useCases) {
    // Embed metadata (expected_outcome, related_tools) into description
    let fullDescription = useCase.description;
    if (useCase.expected_outcome) {
      fullDescription += `\n\nExpected Outcome: ${useCase.expected_outcome}`;
    }
    if (useCase.related_tools) {
      fullDescription += `\n\nRelated Tools: ${useCase.related_tools}`;
    }

    stmt.run(
      useCase.category,
      useCase.title,
      useCase.complexity,
      fullDescription,
      useCase.full_example,
      useCase.action_sequence
    );
  }
}

/**
 * Run the seed data migration
 */
export function seedHelpData(db: Database): MigrationResult {
  const details: string[] = [];

  try {
    // Start transaction
    db.exec('BEGIN TRANSACTION');

    // Seed categories
    seedCategories(db);
    details.push('Seeded 6 use-case categories');

    // Seed basic use cases
    seedBasicUseCases(db);
    details.push('Seeded 18 basic complexity use-cases');

    // Seed intermediate use cases
    seedIntermediateUseCases(db);
    details.push('Seeded 15 intermediate complexity use-cases');

    // Seed advanced use cases
    seedAdvancedUseCases(db);
    details.push('Seeded 8 advanced complexity use-cases');

    // Verify seeding
    const categoryCount = (db.prepare('SELECT COUNT(*) as count FROM m_help_use_case_categories').get() as { count: number }).count;
    const useCaseCount = (db.prepare('SELECT COUNT(*) as count FROM t_help_use_cases').get() as { count: number }).count;
    const basicCount = (db.prepare('SELECT COUNT(*) as count FROM t_help_use_cases WHERE complexity = ?').get('basic') as { count: number }).count;
    const intermediateCount = (db.prepare('SELECT COUNT(*) as count FROM t_help_use_cases WHERE complexity = ?').get('intermediate') as { count: number }).count;
    const advancedCount = (db.prepare('SELECT COUNT(*) as count FROM t_help_use_cases WHERE complexity = ?').get('advanced') as { count: number }).count;

    details.push(`Verified: ${categoryCount} categories, ${useCaseCount} total use-cases (${basicCount} basic, ${intermediateCount} intermediate, ${advancedCount} advanced)`);

    // Commit transaction
    db.exec('COMMIT');

    return {
      success: true,
      message: 'Help system seed data migration completed successfully',
      details
    };

  } catch (error) {
    // Rollback on error
    db.exec('ROLLBACK');

    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Help data seeding failed: ${message}`,
      details
    };
  }
}

/**
 * Get migration info
 */
export function getHelpDataSeedingInfo(): string {
  return `
Migration: Seed Help System Data - All Complexity Levels (v3.6.0)

This migration seeds the help system with 41 use-cases covering progressive learning:

Categories (6):
  1. task_management - Task creation, updates, queries, dependencies, auto-stale
  2. decision_tracking - Decision recording, versioning, search, context, evolution
  3. file_tracking - File change tracking, lock detection, batch operations, coordination
  4. constraint_management - Constraint definition, queries, compliance, linking
  5. cross_tool_workflow - Multi-tool integration patterns, multi-agent coordination
  6. configuration - System config, statistics, performance analysis, optimization

Basic Use Cases (18 - single action):
  - task_management: 4 use-cases (create, update, list, tag)
  - decision_tracking: 4 use-cases (set string, set numeric, get, search)
  - file_tracking: 3 use-cases (record, check lock, get history)
  - constraint_management: 2 use-cases (add, get)
  - cross_tool_workflow: 2 use-cases (link, message)
  - configuration: 3 use-cases (update retention, layer summary, db stats)

Intermediate Use Cases (15 - 2-3 actions):
  - task_management: 3 use-cases (link to decision, status transitions, file tracking)
  - decision_tracking: 3 use-cases (rich context, multi-criteria search, version history)
  - file_tracking: 2 use-cases (lock coordination, layer classification)
  - constraint_management: 2 use-cases (layer filtering, task compliance)
  - cross_tool_workflow: 3 use-cases (full feature setup, decision+constraint, messaging)
  - configuration: 2 use-cases (config verification, layer analysis)

Advanced Use Cases (8 - 4-6+ actions, multi-tool orchestration):
  - cross_tool_workflow: 3 use-cases
    * Complete feature development lifecycle (12 steps, multi-agent)
    * Multi-agent collaboration with priority escalation (14 steps, incident response)
    * Git-aware workflow with VCS auto-complete (20 steps, branch integration)
  - task_management: 2 use-cases
    * Complex dependency chain with circular detection (15 steps)
    * Long-running feature with auto-stale recovery (21 steps)
  - decision_tracking: 1 use-case
    * Architecture decision with version evolution (12 steps)
  - file_tracking: 1 use-case
    * Multi-agent refactoring with lock coordination (15 steps)
  - configuration: 1 use-case
    * Performance optimization workflow (18 steps, 70% improvement)

Each use-case includes:
  - Clear, actionable title
  - Detailed description with real-world context
  - Full JSON example with action and params
  - Action sequence array
  - Complexity level: 'basic', 'intermediate', or 'advanced'
  - Expected outcome
  - Related tools (cross-references)
  - For advanced: Multi-agent scenarios, token efficiency metrics, coordination patterns

AI Time Estimates:
  - Basic: 2-5 minutes per use-case
  - Intermediate: 5-12 minutes per use-case
  - Advanced: 12-25 minutes per use-case

Token Budget Estimates:
  - Basic: 1k-3k tokens per use-case
  - Intermediate: 3k-8k tokens per use-case
  - Advanced: 8k-20k tokens per use-case

This seed data enables progressive learning from simple operations through multi-tool
workflows to production-ready multi-agent coordination patterns.
  `.trim();
}
