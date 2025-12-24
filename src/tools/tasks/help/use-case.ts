/**
 * Task Use Case Documentation (v3.8.0)
 *
 * Comprehensive scenarios demonstrating file_actions parameter usage
 * across all 9 architecture layers.
 */

/**
 * Get comprehensive use case examples for task tool
 */
export function taskUseCase(): any {
  return {
    tool: 'task',
    version: '3.8.0',
    description: 'Real-world scenarios demonstrating file_actions parameter usage across all architecture layers',

    overview: {
      file_actions_parameter: {
        purpose: 'Specify which files will be created/modified/deleted for a task',
        structure: 'Array of { action: "create"|"edit"|"delete", path: "relative/path/from/project/root" }',
        introduced: 'v3.8.0',
        replaces: 'watch_files parameter (deprecated but still supported for backward compatibility)'
      },

      layer_requirements: {
        FILE_REQUIRED: {
          layers: ['presentation', 'business', 'data', 'infrastructure', 'cross-cutting', 'documentation'],
          count: 6,
          rule: 'MUST specify file_actions (or use empty array [] for non-file tasks)',
          rationale: 'These layers represent tangible code/documentation files that must be tracked'
        },
        FILE_OPTIONAL: {
          layers: ['planning', 'coordination', 'review'],
          count: 3,
          rule: 'MAY specify file_actions (not required)',
          rationale: 'These layers represent planning/coordination work that may not produce files'
        }
      },

      backward_compatibility: {
        watch_files: 'Still supported - automatically converts to file_actions with action="edit"',
        example: {
          deprecated: '{ watch_files: ["src/api/auth.ts"] }',
          converts_to: '{ file_actions: [{ action: "edit", path: "src/api/auth.ts" }] }',
          recommendation: 'Use file_actions for new code - more explicit and type-safe'
        }
      }
    },

    scenarios: {
      // ========================================================================
      // FILE_REQUIRED LAYERS (6 layers) - Must specify file_actions
      // ========================================================================

      presentation_layer: {
        layer_name: 'presentation',
        description: 'UI/UX components, API endpoints, views, controllers',
        file_actions_required: true,

        use_cases: [
          {
            scenario: 'REST API Endpoint Implementation',
            title: 'Implement user authentication endpoint',
            task: {
              action: 'create',
              title: 'Implement user authentication endpoint',
              description: 'Add POST /api/auth/login endpoint with JWT token generation',
              layer: 'presentation',
              priority: 3,
              assigned_agent: 'backend-api-specialist',
              tags: ['api', 'authentication', 'jwt'],
              file_actions: [
                { action: 'create', path: 'src/api/routes/auth.ts' },
                { action: 'create', path: 'src/api/controllers/AuthController.ts' },
                { action: 'edit', path: 'src/api/routes/index.ts' }
              ],
              acceptance_criteria: [
                { type: 'tests_pass', command: 'npm test -- auth.test.ts', expected_pattern: 'PASS' },
                { type: 'code_contains', file: 'src/api/routes/auth.ts', pattern: 'router\\.post\\(\'/login\'' }
              ]
            },
            ai_time_estimate: '12-18 minutes',
            token_estimate: '10,000-15,000 tokens'
          },

          {
            scenario: 'React Component Creation',
            title: 'Create user profile card component',
            task: {
              action: 'create',
              title: 'Create user profile card component',
              description: 'Reusable card component showing user avatar, name, bio, and action buttons',
              layer: 'presentation',
              priority: 2,
              assigned_agent: 'frontend-react-developer',
              tags: ['react', 'component', 'ui'],
              file_actions: [
                { action: 'create', path: 'src/components/UserProfileCard.tsx' },
                { action: 'create', path: 'src/components/UserProfileCard.module.css' },
                { action: 'edit', path: 'src/components/index.ts' }
              ]
            },
            ai_time_estimate: '8-12 minutes',
            token_estimate: '6,000-9,000 tokens'
          },

          {
            scenario: 'Non-file Presentation Task (Empty Array)',
            title: 'Review API endpoint performance',
            task: {
              action: 'create',
              title: 'Review API endpoint performance',
              description: 'Analyze response times and identify bottlenecks in /api/users endpoint',
              layer: 'presentation',
              priority: 2,
              assigned_agent: 'performance-analyst',
              tags: ['performance', 'api', 'review'],
              file_actions: []  // Empty array - analysis task, no file modifications
            },
            note: 'Use empty array [] for tasks that do not modify files but belong to code layers',
            ai_time_estimate: '5-8 minutes',
            token_estimate: '3,000-5,000 tokens'
          }
        ]
      },

      business_layer: {
        layer_name: 'business',
        description: 'Business logic, services, domain models, use cases',
        file_actions_required: true,

        use_cases: [
          {
            scenario: 'Service Class Implementation',
            title: 'Implement order processing service',
            task: {
              action: 'create',
              title: 'Implement order processing service',
              description: 'Service to handle order validation, inventory check, payment, and fulfillment',
              layer: 'business',
              priority: 4,
              assigned_agent: 'business-logic-specialist',
              tags: ['service', 'orders', 'payment'],
              file_actions: [
                { action: 'create', path: 'src/services/OrderService.ts' },
                { action: 'edit', path: 'src/services/PaymentService.ts' },
                { action: 'edit', path: 'src/services/InventoryService.ts' }
              ],
              acceptance_criteria: [
                { type: 'tests_pass', command: 'npm test -- OrderService.test.ts' },
                { type: 'code_contains', file: 'src/services/OrderService.ts', pattern: 'processOrder' }
              ]
            },
            ai_time_estimate: '20-25 minutes',
            token_estimate: '18,000-25,000 tokens'
          },

          {
            scenario: 'Domain Model Refactoring',
            title: 'Refactor User model to support OAuth',
            task: {
              action: 'create',
              title: 'Refactor User model to support OAuth',
              description: 'Add OAuth provider fields and authentication methods to User model',
              layer: 'business',
              priority: 3,
              assigned_agent: 'domain-model-architect',
              tags: ['model', 'refactoring', 'oauth'],
              file_actions: [
                { action: 'edit', path: 'src/models/User.ts' },
                { action: 'create', path: 'src/models/OAuthProvider.ts' },
                { action: 'edit', path: 'src/types/auth.ts' }
              ]
            },
            ai_time_estimate: '15-20 minutes',
            token_estimate: '12,000-18,000 tokens'
          }
        ]
      },

      data_layer: {
        layer_name: 'data',
        description: 'Database schemas, repositories, data access objects, migrations',
        file_actions_required: true,

        use_cases: [
          {
            scenario: 'Database Migration',
            title: 'Create users table migration',
            task: {
              action: 'create',
              title: 'Create users table migration',
              description: 'Add users table with email, password_hash, oauth fields, and indexes',
              layer: 'data',
              priority: 4,
              assigned_agent: 'database-specialist',
              tags: ['migration', 'database', 'schema'],
              file_actions: [
                { action: 'create', path: 'migrations/20251109_create_users_table.sql' },
                { action: 'edit', path: 'migrations/migration_log.json' }
              ],
              acceptance_criteria: [
                { type: 'tests_pass', command: 'npm run migrate:test' },
                { type: 'code_contains', file: 'migrations/20251109_create_users_table.sql', pattern: 'CREATE TABLE users' }
              ]
            },
            ai_time_estimate: '10-15 minutes',
            token_estimate: '8,000-12,000 tokens'
          },

          {
            scenario: 'Repository Pattern Implementation',
            title: 'Implement UserRepository with caching',
            task: {
              action: 'create',
              title: 'Implement UserRepository with caching',
              description: 'Data access layer for users with Redis caching for read operations',
              layer: 'data',
              priority: 3,
              assigned_agent: 'data-access-specialist',
              tags: ['repository', 'caching', 'redis'],
              file_actions: [
                { action: 'create', path: 'src/repositories/UserRepository.ts' },
                { action: 'edit', path: 'src/repositories/BaseRepository.ts' },
                { action: 'edit', path: 'src/config/redis.ts' }
              ]
            },
            ai_time_estimate: '18-22 minutes',
            token_estimate: '15,000-20,000 tokens'
          }
        ]
      },

      infrastructure_layer: {
        layer_name: 'infrastructure',
        description: 'DevOps, configuration, deployment, CI/CD, monitoring',
        file_actions_required: true,

        use_cases: [
          {
            scenario: 'Docker Configuration',
            title: 'Add production Docker configuration',
            task: {
              action: 'create',
              title: 'Add production Docker configuration',
              description: 'Multi-stage Dockerfile and docker-compose.yml for production deployment',
              layer: 'infrastructure',
              priority: 3,
              assigned_agent: 'devops-specialist',
              tags: ['docker', 'deployment', 'production'],
              file_actions: [
                { action: 'create', path: 'Dockerfile.prod' },
                { action: 'create', path: 'docker-compose.prod.yml' },
                { action: 'edit', path: '.dockerignore' }
              ],
              acceptance_criteria: [
                { type: 'tests_pass', command: 'docker build -f Dockerfile.prod .', expected_pattern: 'Successfully built' }
              ]
            },
            ai_time_estimate: '12-16 minutes',
            token_estimate: '8,000-12,000 tokens'
          },

          {
            scenario: 'CI/CD Pipeline',
            title: 'Add GitHub Actions workflow for testing',
            task: {
              action: 'create',
              title: 'Add GitHub Actions workflow for testing',
              description: 'Automated testing on pull requests with coverage reporting',
              layer: 'infrastructure',
              priority: 2,
              assigned_agent: 'ci-cd-engineer',
              tags: ['github-actions', 'testing', 'ci'],
              file_actions: [
                { action: 'create', path: '.github/workflows/test.yml' },
                { action: 'edit', path: 'package.json' }
              ]
            },
            ai_time_estimate: '8-12 minutes',
            token_estimate: '5,000-8,000 tokens'
          }
        ]
      },

      cross_cutting_layer: {
        layer_name: 'cross-cutting',
        description: 'Logging, error handling, security, monitoring, shared utilities',
        file_actions_required: true,

        use_cases: [
          {
            scenario: 'Centralized Error Handling',
            title: 'Implement global error handler middleware',
            task: {
              action: 'create',
              title: 'Implement global error handler middleware',
              description: 'Express middleware for consistent error responses and logging',
              layer: 'cross-cutting',
              priority: 3,
              assigned_agent: 'error-handling-specialist',
              tags: ['error-handling', 'middleware', 'logging'],
              file_actions: [
                { action: 'create', path: 'src/middleware/errorHandler.ts' },
                { action: 'create', path: 'src/types/errors.ts' },
                { action: 'edit', path: 'src/app.ts' }
              ],
              acceptance_criteria: [
                { type: 'tests_pass', command: 'npm test -- errorHandler.test.ts' }
              ]
            },
            ai_time_estimate: '15-20 minutes',
            token_estimate: '12,000-16,000 tokens'
          },

          {
            scenario: 'Security Utilities',
            title: 'Add input sanitization utilities',
            task: {
              action: 'create',
              title: 'Add input sanitization utilities',
              description: 'XSS protection and SQL injection prevention utilities',
              layer: 'cross-cutting',
              priority: 4,
              assigned_agent: 'security-specialist',
              tags: ['security', 'validation', 'sanitization'],
              file_actions: [
                { action: 'create', path: 'src/utils/sanitize.ts' },
                { action: 'edit', path: 'src/utils/validators.ts' }
              ]
            },
            ai_time_estimate: '10-15 minutes',
            token_estimate: '8,000-12,000 tokens'
          }
        ]
      },

      documentation_layer: {
        layer_name: 'documentation',
        description: 'README, CHANGELOG, API docs, user guides, tutorials',
        file_actions_required: true,
        note: 'Documentation IS files - file_actions REQUIRED just like code layers',

        use_cases: [
          {
            scenario: 'API Documentation',
            title: 'Document authentication endpoints',
            task: {
              action: 'create',
              title: 'Document authentication endpoints',
              description: 'OpenAPI/Swagger docs for /api/auth routes with request/response examples',
              layer: 'documentation',
              priority: 2,
              assigned_agent: 'technical-writer',
              tags: ['documentation', 'api', 'openapi'],
              file_actions: [
                { action: 'create', path: 'docs/api/authentication.md' },
                { action: 'edit', path: 'docs/api/openapi.yaml' },
                { action: 'edit', path: 'README.md' }
              ],
              acceptance_criteria: [
                { type: 'file_exists', file: 'docs/api/authentication.md' },
                { type: 'code_contains', file: 'docs/api/authentication.md', pattern: 'POST /api/auth/login' }
              ]
            },
            ai_time_estimate: '10-15 minutes',
            token_estimate: '6,000-10,000 tokens'
          },

          {
            scenario: 'User Guide',
            title: 'Create deployment guide',
            task: {
              action: 'create',
              title: 'Create deployment guide',
              description: 'Step-by-step guide for deploying to production with Docker',
              layer: 'documentation',
              priority: 3,
              assigned_agent: 'documentation-specialist',
              tags: ['documentation', 'deployment', 'guide'],
              file_actions: [
                { action: 'create', path: 'docs/deployment/production.md' },
                { action: 'create', path: 'docs/deployment/troubleshooting.md' },
                { action: 'edit', path: 'docs/README.md' }
              ]
            },
            ai_time_estimate: '12-18 minutes',
            token_estimate: '8,000-12,000 tokens'
          },

          {
            scenario: 'Changelog Update',
            title: 'Update CHANGELOG for v2.0.0 release',
            task: {
              action: 'create',
              title: 'Update CHANGELOG for v2.0.0 release',
              description: 'Summarize all features, fixes, and breaking changes for v2.0.0',
              layer: 'documentation',
              priority: 3,
              assigned_agent: 'release-manager',
              tags: ['changelog', 'release', 'versioning'],
              file_actions: [
                { action: 'edit', path: 'CHANGELOG.md' },
                { action: 'edit', path: 'package.json' }
              ]
            },
            ai_time_estimate: '8-12 minutes',
            token_estimate: '5,000-8,000 tokens'
          }
        ]
      },

      // ========================================================================
      // FILE_OPTIONAL LAYERS (3 layers) - file_actions is optional
      // ========================================================================

      planning_layer: {
        layer_name: 'planning',
        description: 'Research, surveys, investigation, design decisions, architecture planning',
        file_actions_required: false,
        note: 'Tasks may produce artifacts (diagrams, notes), but file_actions is optional',

        use_cases: [
          {
            scenario: 'Technical Research (No Files)',
            title: 'Research OAuth 2.0 implementation strategies',
            task: {
              action: 'create',
              title: 'Research OAuth 2.0 implementation strategies',
              description: 'Compare Auth0, Okta, and custom implementation. Evaluate costs, features, and integration complexity.',
              layer: 'planning',
              priority: 3,
              assigned_agent: 'tech-researcher',
              tags: ['research', 'oauth', 'authentication'],
              // file_actions omitted - research task with no file output
              notes: 'Document findings in decision record after research is complete'
            },
            ai_time_estimate: '15-20 minutes',
            token_estimate: '8,000-12,000 tokens',
            note: 'No file_actions - pure research task'
          },

          {
            scenario: 'Architecture Design (With Files)',
            title: 'Design microservices architecture',
            task: {
              action: 'create',
              title: 'Design microservices architecture',
              description: 'Define service boundaries, communication patterns, and data ownership',
              layer: 'planning',
              priority: 4,
              assigned_agent: 'solution-architect',
              tags: ['architecture', 'microservices', 'design'],
              file_actions: [
                { action: 'create', path: 'docs/architecture/microservices-design.md' },
                { action: 'create', path: 'docs/architecture/diagrams/service-map.svg' }
              ]
            },
            ai_time_estimate: '25-30 minutes',
            token_estimate: '15,000-20,000 tokens',
            note: 'file_actions provided - design produces documentation artifacts'
          },

          {
            scenario: 'Survey/Analysis (No Files)',
            title: 'Analyze user feedback on authentication flow',
            task: {
              action: 'create',
              title: 'Analyze user feedback on authentication flow',
              description: 'Review support tickets and user feedback to identify pain points in login process',
              layer: 'planning',
              priority: 2,
              assigned_agent: 'product-analyst',
              tags: ['user-feedback', 'analysis', 'authentication']
              // file_actions omitted - analysis may be documented elsewhere
            },
            ai_time_estimate: '10-15 minutes',
            token_estimate: '5,000-8,000 tokens'
          }
        ]
      },

      coordination_layer: {
        layer_name: 'coordination',
        description: 'Multi-agent orchestration, sprint planning, team coordination',
        file_actions_required: false,
        note: 'Coordination work focuses on process/people, file_actions optional',

        use_cases: [
          {
            scenario: 'Sprint Planning (No Files)',
            title: 'Plan Sprint 15 - Authentication Module',
            task: {
              action: 'create',
              title: 'Plan Sprint 15 - Authentication Module',
              description: 'Break down authentication epic into tasks, estimate effort, assign to agents',
              layer: 'coordination',
              priority: 3,
              assigned_agent: 'scrum-master',
              tags: ['sprint-planning', 'coordination', 'authentication']
              // file_actions omitted - planning happens in task system itself
            },
            ai_time_estimate: '20-25 minutes',
            token_estimate: '10,000-15,000 tokens'
          },

          {
            scenario: 'Multi-Agent Workflow (With Files)',
            title: 'Design agent collaboration workflow',
            task: {
              action: 'create',
              title: 'Design agent collaboration workflow',
              description: 'Define handoff points, shared context, and task dependencies for 5-agent system',
              layer: 'coordination',
              priority: 4,
              assigned_agent: 'workflow-architect',
              tags: ['workflow', 'multi-agent', 'collaboration'],
              file_actions: [
                { action: 'create', path: 'docs/workflows/agent-collaboration.md' },
                { action: 'create', path: 'config/agent-workflows.yaml' }
              ]
            },
            ai_time_estimate: '30-35 minutes',
            token_estimate: '18,000-25,000 tokens'
          },

          {
            scenario: 'Dependency Resolution (No Files)',
            title: 'Resolve blocked tasks for backend team',
            task: {
              action: 'create',
              title: 'Resolve blocked tasks for backend team',
              description: 'Identify blocking dependencies and coordinate with frontend/DevOps to unblock 3 tasks',
              layer: 'coordination',
              priority: 4,
              assigned_agent: 'team-coordinator',
              tags: ['coordination', 'blocked', 'dependencies']
              // file_actions omitted - coordination happens through communication
            },
            ai_time_estimate: '15-20 minutes',
            token_estimate: '8,000-12,000 tokens'
          }
        ]
      },

      review_layer: {
        layer_name: 'review',
        description: 'Code review, QA verification, testing validation, PR review',
        file_actions_required: false,
        note: 'Review work examines existing files, file_actions optional unless review produces changes',

        use_cases: [
          {
            scenario: 'Code Review (No Files)',
            title: 'Review PR #234 - Authentication endpoint',
            task: {
              action: 'create',
              title: 'Review PR #234 - Authentication endpoint',
              description: 'Security audit of JWT implementation, verify input validation and error handling',
              layer: 'review',
              priority: 3,
              assigned_agent: 'senior-reviewer',
              tags: ['code-review', 'security', 'authentication']
              // file_actions omitted - review comments happen in GitHub PR
            },
            ai_time_estimate: '10-15 minutes',
            token_estimate: '6,000-10,000 tokens'
          },

          {
            scenario: 'QA Testing (With Test Files)',
            title: 'Write integration tests for auth flow',
            task: {
              action: 'create',
              title: 'Write integration tests for auth flow',
              description: 'E2E tests covering login, logout, token refresh, and error cases',
              layer: 'review',
              priority: 3,
              assigned_agent: 'qa-automation-engineer',
              tags: ['testing', 'integration', 'authentication'],
              file_actions: [
                { action: 'create', path: 'tests/integration/auth.test.ts' },
                { action: 'edit', path: 'tests/setup/auth-fixtures.ts' }
              ]
            },
            ai_time_estimate: '18-22 minutes',
            token_estimate: '12,000-18,000 tokens',
            note: 'file_actions provided - test creation produces files'
          },

          {
            scenario: 'Verification (No Files)',
            title: 'Verify production deployment',
            task: {
              action: 'create',
              title: 'Verify production deployment',
              description: 'Check all services healthy, verify database migrations applied, test critical endpoints',
              layer: 'review',
              priority: 4,
              assigned_agent: 'ops-verifier',
              tags: ['verification', 'production', 'deployment']
              // file_actions omitted - verification is manual/automated checks
            },
            ai_time_estimate: '12-18 minutes',
            token_estimate: '6,000-10,000 tokens'
          }
        ]
      }
    },

    // ========================================================================
    // Advanced Patterns
    // ========================================================================

    advanced_patterns: {
      multi_file_refactoring: {
        title: 'Large-scale refactoring with multiple file actions',
        task: {
          action: 'create',
          title: 'Refactor authentication to support SSO',
          description: 'Migrate from password-only to support SAML/OAuth SSO providers',
          layer: 'business',
          priority: 4,
          assigned_agent: 'senior-architect',
          tags: ['refactoring', 'authentication', 'sso'],
          file_actions: [
            // New files
            { action: 'create', path: 'src/auth/providers/SamlProvider.ts' },
            { action: 'create', path: 'src/auth/providers/OAuthProvider.ts' },
            { action: 'create', path: 'src/auth/ProviderFactory.ts' },
            // Modified files
            { action: 'edit', path: 'src/auth/AuthService.ts' },
            { action: 'edit', path: 'src/models/User.ts' },
            { action: 'edit', path: 'src/config/auth.ts' },
            // Deprecated files
            { action: 'delete', path: 'src/auth/legacy/PasswordAuth.ts' }
          ]
        },
        ai_time_estimate: '45-60 minutes',
        token_estimate: '35,000-50,000 tokens',
        note: 'Large refactoring with create/edit/delete actions'
      },

      cross_layer_feature: {
        title: 'Feature spanning multiple layers (use multiple tasks)',
        scenario: 'Complete user authentication feature',
        recommendation: 'Create separate tasks for each layer rather than one mega-task',
        tasks: [
          {
            title: 'Design authentication architecture',
            layer: 'planning',
            file_actions: [
              { action: 'create', path: 'docs/architecture/auth-design.md' }
            ]
          },
          {
            title: 'Implement auth business logic',
            layer: 'business',
            file_actions: [
              { action: 'create', path: 'src/services/AuthService.ts' }
            ]
          },
          {
            title: 'Add auth database tables',
            layer: 'data',
            file_actions: [
              { action: 'create', path: 'migrations/20251109_auth_tables.sql' }
            ]
          },
          {
            title: 'Create auth API endpoints',
            layer: 'presentation',
            file_actions: [
              { action: 'create', path: 'src/api/routes/auth.ts' }
            ]
          },
          {
            title: 'Document auth endpoints',
            layer: 'documentation',
            file_actions: [
              { action: 'create', path: 'docs/api/authentication.md' }
            ]
          }
        ],
        note: 'Use task dependencies to enforce correct implementation order'
      },

      backward_compatibility_examples: {
        watch_files_migration: {
          old_syntax: {
            action: 'create',
            title: 'Update user service',
            layer: 'business',
            watch_files: [
              'src/services/UserService.ts',
              'src/models/User.ts'
            ]
          },
          new_syntax: {
            action: 'create',
            title: 'Update user service',
            layer: 'business',
            file_actions: [
              { action: 'edit', path: 'src/services/UserService.ts' },
              { action: 'edit', path: 'src/models/User.ts' }
            ]
          },
          note: 'Old syntax still works (auto-converts), but new syntax is more explicit'
        }
      }
    },

    // ========================================================================
    // Common Patterns & Best Practices
    // ========================================================================

    best_practices: {
      choosing_layer: [
        'Use code layers (presentation, business, data, infrastructure, cross-cutting) for implementation work',
        'Use documentation layer for any README, CHANGELOG, API docs, guides',
        'Use planning layers (planning, coordination, review) for research, design, and coordination',
        'When in doubt: if task produces code/doc files → code/doc layer; if task is research/planning → planning layer'
      ],

      file_actions_guidelines: [
        'action="create" - New file that does not exist yet',
        'action="edit" - Modifying existing file (most common)',
        'action="delete" - Removing deprecated/obsolete file',
        'Use relative paths from project root (e.g., "src/api/auth.ts", not "/home/user/project/src/api/auth.ts")',
        'Group related file changes in single task (e.g., service + tests)',
        'For non-file tasks in code layers, use empty array: file_actions: []'
      ],

      layer_selection_examples: {
        'Add login API endpoint': 'presentation (API endpoints)',
        'Implement password hashing': 'business (business logic)',
        'Create users table migration': 'data (database schema)',
        'Add Docker configuration': 'infrastructure (DevOps)',
        'Add error logging middleware': 'cross-cutting (shared utilities)',
        'Write API documentation': 'documentation (docs)',
        'Research SSO providers': 'planning (research)',
        'Plan Sprint 15': 'coordination (team coordination)',
        'Review authentication PR': 'review (code review)'
      },

      common_mistakes: [
        {
          mistake: 'Forgetting file_actions for code layers',
          error: 'file_actions is required for layer "business"',
          fix: 'Add file_actions array or use empty array []'
        },
        {
          mistake: 'Using absolute paths',
          wrong: '/home/user/project/src/api/auth.ts',
          correct: 'src/api/auth.ts'
        },
        {
          mistake: 'Wrong action type',
          wrong: 'action: "modify"',
          correct: 'action: "edit"'
        },
        {
          mistake: 'Mixing layers incorrectly',
          wrong: 'layer: "business" for documentation task',
          correct: 'layer: "documentation" for README/docs'
        }
      ]
    },

    // ========================================================================
    // Token Efficiency Notes
    // ========================================================================

    token_efficiency: {
      file_actions_vs_watch_files: {
        old_approach: 'watch_files: ["file1", "file2"] - lacks intent clarity',
        new_approach: 'file_actions: [{action, path}] - explicit intent (create/edit/delete)',
        benefit: 'Better context for AI agents, clearer intent, type-safe validation'
      },

      automatic_file_watching: {
        description: 'file_actions automatically registers files for change detection',
        token_savings: '300-500 tokens per file vs manual watch_files action',
        how_it_works: [
          '1. Create task with file_actions',
          '2. Files automatically watched by file watcher',
          '3. Changes trigger acceptance criteria validation',
          '4. No additional MCP calls needed'
        ]
      },

      task_granularity: {
        too_granular: 'One task per file (excessive overhead)',
        too_broad: 'One task for entire feature across all layers (hard to track)',
        recommended: 'One task per layer per feature (e.g., "Auth - Business Logic", "Auth - API Endpoints")'
      }
    },

    migration_guide: {
      from_watch_files: {
        step_1: 'Identify tasks using watch_files parameter',
        step_2: 'Convert each file path to { action: "edit", path: "..." }',
        step_3: 'Replace watch_files with file_actions',
        step_4: 'Add action type ("create"/"edit"/"delete") based on intent',
        note: 'No rush - watch_files still works and auto-converts internally'
      },

      from_decision_tracking: {
        description: 'Migrating from decision-based file tracking to task-based',
        see: 'docs/TASK_MIGRATION.md for comprehensive migration guide'
      }
    },

    related_documentation: {
      file_watcher: 'Use action: "watcher" to check which files are being monitored',
      task_linking: 'Link tasks to decisions/constraints with action: "link"',
      dependencies: 'Use add_dependency/remove_dependency/get_dependencies for task ordering',
    }
  };
}
