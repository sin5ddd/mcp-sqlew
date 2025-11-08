/**
 * Comprehensive examples for constraint tool
 */

/**
 * Get comprehensive examples for constraint tool
 * @returns Examples documentation object
 */
export function constraintExample(): any {
  return {
    tool: 'constraint',
    description: 'Comprehensive constraint examples for various use cases',
    categories: {
      performance: {
        description: 'Performance-related constraints for response times, throughput, resource usage',
        examples: [
          {
            scenario: 'API Response Time',
            example: '{ action: "add", category: "performance", constraint_text: "All API endpoints must respond within 100ms for 95th percentile", priority: "high", layer: "business", tags: ["api", "latency"] }',
            rationale: 'Ensures fast user experience and prevents timeout issues'
          },
          {
            scenario: 'Database Query Performance',
            example: '{ action: "add", category: "performance", constraint_text: "Database queries must complete within 50ms", priority: "high", layer: "data", tags: ["database", "query"] }',
            rationale: 'Prevents database bottlenecks and ensures scalability'
          },
          {
            scenario: 'Memory Usage',
            example: '{ action: "add", category: "performance", constraint_text: "Peak memory usage must not exceed 512MB per instance", priority: "critical", layer: "infrastructure", tags: ["memory", "resource"] }',
            rationale: 'Prevents out-of-memory errors in containerized environments'
          }
        ]
      },
      architecture: {
        description: 'Architectural constraints for code structure, dependencies, patterns',
        examples: [
          {
            scenario: 'Layer Dependency Rules',
            example: '{ action: "add", category: "architecture", constraint_text: "Presentation layer must not directly access data layer - use business layer only", priority: "critical", layer: "cross-cutting", tags: ["layering", "separation"] }',
            rationale: 'Enforces clean architecture and separation of concerns'
          },
          {
            scenario: 'Dependency Injection',
            example: '{ action: "add", category: "architecture", constraint_text: "All service classes must use constructor-based dependency injection", priority: "medium", layer: "business", tags: ["di", "testability"] }',
            rationale: 'Improves testability and reduces coupling'
          },
          {
            scenario: 'API Versioning',
            example: '{ action: "add", category: "architecture", constraint_text: "All public APIs must include version prefix (e.g., /v1/, /v2/)", priority: "high", layer: "presentation", tags: ["api", "versioning"] }',
            rationale: 'Enables backward compatibility and smooth API evolution'
          }
        ]
      },
      security: {
        description: 'Security constraints for authentication, authorization, data protection',
        examples: [
          {
            scenario: 'Authentication Required',
            example: '{ action: "add", category: "security", constraint_text: "All non-public endpoints must require JWT authentication", priority: "critical", layer: "presentation", tags: ["auth", "jwt"] }',
            rationale: 'Prevents unauthorized access to protected resources'
          },
          {
            scenario: 'Data Encryption',
            example: '{ action: "add", category: "security", constraint_text: "All PII (Personally Identifiable Information) must be encrypted at rest using AES-256", priority: "critical", layer: "data", tags: ["encryption", "pii"] }',
            rationale: 'Protects sensitive data and ensures compliance'
          },
          {
            scenario: 'Input Validation',
            example: '{ action: "add", category: "security", constraint_text: "All user inputs must be validated and sanitized before processing", priority: "critical", layer: "presentation", tags: ["validation", "injection-prevention"] }',
            rationale: 'Prevents injection attacks (SQL, XSS, etc.)'
          }
        ]
      }
    },
    workflows: {
      constraint_validation: {
        description: 'Workflow for validating code against constraints',
        steps: [
          {
            step: 1,
            action: 'Retrieve active constraints for layer',
            example: '{ action: "get", layer: "business", active_only: true }'
          },
          {
            step: 2,
            action: 'Check code changes against constraints',
            example: 'Review file changes and verify compliance with each constraint'
          },
          {
            step: 3,
            action: 'Report violations',
            example: 'Use message tool to send warnings for constraint violations'
          },
          {
            step: 4,
            action: 'Link violations to tasks',
            example: 'Create tasks to fix violations and link to relevant constraints'
          }
        ]
      },
      requirement_tracking: {
        description: 'Workflow for tracking requirements as constraints',
        steps: [
          {
            step: 1,
            action: 'Add requirement as constraint',
            example: '{ action: "add", category: "performance", constraint_text: "System must handle 1000 concurrent users", priority: "high", tags: ["requirement", "load"] }'
          },
          {
            step: 2,
            action: 'Link related decisions',
            example: 'Use decision tool to record architectural decisions that address the constraint'
          },
          {
            step: 3,
            action: 'Create implementation tasks',
            example: 'Use task tool to break down implementation and link to constraint'
          },
          {
            step: 4,
            action: 'Validate compliance',
            example: 'Test implementation against constraint criteria'
          }
        ]
      }
    },
    best_practices: {
      writing_constraints: [
        'Be specific and measurable (use numbers, percentages, time limits)',
        'Include rationale in tags or separate documentation',
        'Use appropriate priority (critical for must-have, high for important, medium/low for nice-to-have)',
        'Assign to correct layer (where constraint is enforced)',
        'Tag comprehensively for easy retrieval'
      ],
      managing_constraints: [
        'Review constraints regularly and deactivate outdated ones',
        'Link constraints to related decisions and tasks',
        'Use constraints for both technical and business requirements',
        'Validate code changes against active constraints',
        'Document constraint violations and remediation plans'
      ]
    }
  };
}
