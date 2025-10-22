/**
 * Constraint management tools for MCP Shared Context Server
 * Handles constraint tracking with priority, layer assignment, and tags
 */

import { getDatabase, getOrCreateAgent, getLayerId, transaction, getOrCreateTag, getOrCreateCategoryId } from '../database.js';
import {
  STRING_TO_PRIORITY,
  PRIORITY_TO_STRING,
  DEFAULT_PRIORITY,
  SQLITE_TRUE,
  SQLITE_FALSE
} from '../constants.js';
import { validateCategory, validatePriority } from '../utils/validators.js';
import type {
  AddConstraintParams,
  AddConstraintResponse,
  GetConstraintsParams,
  GetConstraintsResponse,
  DeactivateConstraintParams,
  DeactivateConstraintResponse,
  TaggedConstraint,
  Priority,
  Database
} from '../types.js';

/**
 * Get or create constraint category ID
 * Uses INSERT OR IGNORE for idempotent operation
 */

/**
 * Add a constraint with priority, layer, and tags
 *
 * @param params - Constraint parameters
 * @param db - Optional database instance (for testing)
 * @returns Constraint ID and timestamp
 */
export function addConstraint(params: AddConstraintParams, db?: Database): AddConstraintResponse {
  const actualDb = db ?? getDatabase();

  try {
    // Validate required parameters
    if (!params.category || !params.constraint_text) {
      throw new Error('category and constraint_text are required');
    }

    // Validate category
    validateCategory(params.category);

    // Validate priority if provided
    const priorityStr = params.priority || 'medium';
    validatePriority(priorityStr);
    const priority = STRING_TO_PRIORITY[priorityStr] || DEFAULT_PRIORITY;

    // Validate and get layer ID if provided
    let layerId: number | null = null;
    if (params.layer) {
      const validLayers = ['presentation', 'business', 'data', 'infrastructure', 'cross-cutting'];
      if (!validLayers.includes(params.layer)) {
        throw new Error(`Invalid layer. Must be one of: ${validLayers.join(', ')}`);
      }
      layerId = getLayerId(actualDb, params.layer);
      if (!layerId) {
        throw new Error(`Layer not found: ${params.layer}`);
      }
    }

    // Use transaction for multi-table insert
    const result = transaction(actualDb, () => {
      // Get or create category
      const categoryId = getOrCreateCategoryId(actualDb, params.category);

      // Get or create created_by agent
      const createdBy = params.created_by || 'system';
      const agentId = getOrCreateAgent(actualDb, createdBy);

      // Insert constraint
      const insertResult = actualDb.prepare(`
        INSERT INTO t_constraints (category_id, layer_id, constraint_text, priority, active, created_by, ts)
        VALUES (?, ?, ?, ?, ?, ?, unixepoch())
      `).run(categoryId, layerId, params.constraint_text, priority, SQLITE_TRUE, agentId);

      const constraintId = insertResult.lastInsertRowid as number;

      // Insert m_tags if provided
      if (params.tags && params.tags.length > 0) {
        const tagStmt = actualDb.prepare('INSERT INTO t_constraint_tags (constraint_id, tag_id) VALUES (?, ?)');

        for (const tagName of params.tags) {
          const tagId = getOrCreateTag(actualDb, tagName);
          tagStmt.run(constraintId, tagId);
        }
      }

      return { constraintId };
    });

    return {
      success: true,
      constraint_id: result.constraintId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to add constraint: ${message}`);
  }
}

/**
 * Retrieve t_constraints with advanced filtering
 * Uses v_tagged_constraints view for token efficiency
 *
 * @param params - Filter parameters
 * @param db - Optional database instance (for testing)
 * @returns Array of t_constraints matching filters
 */
export function getConstraints(params: GetConstraintsParams, db?: Database): GetConstraintsResponse {
  const actualDb = db ?? getDatabase();

  try {
    // Build query conditions
    const conditions: string[] = [];
    const values: any[] = [];

    // Use v_tagged_constraints view (already filters active=1)
    let sql = 'SELECT * FROM v_tagged_constraints WHERE 1=1';

    // Filter by category
    if (params.category) {
      validateCategory(params.category);
      conditions.push('category = ?');
      values.push(params.category);
    }

    // Filter by layer
    if (params.layer) {
      conditions.push('layer = ?');
      values.push(params.layer);
    }

    // Filter by priority
    if (params.priority) {
      conditions.push('priority = ?');
      values.push(params.priority);
    }

    // Filter by m_tags (OR logic - match ANY tag)
    if (params.tags && params.tags.length > 0) {
      const tagConditions = params.tags.map(() => 'tags LIKE ?').join(' OR ');
      conditions.push(`(${tagConditions})`);
      for (const tag of params.tags) {
        values.push(`%${tag}%`);
      }
    }

    // Add all conditions to query
    if (conditions.length > 0) {
      sql += ' AND ' + conditions.join(' AND ');
    }

    // Note: v_tagged_constraints view already orders by priority DESC, category, ts DESC
    // Add limit if provided
    const limit = params.limit || 50;
    sql += ' LIMIT ?';
    values.push(limit);

    // Execute query
    const rows = actualDb.prepare(sql).all(...values) as TaggedConstraint[];

    // Parse m_tags from comma-separated to array for consistency
    const constraints = rows.map(row => ({
      ...row,
      tags: row.tags ? row.tags.split(',') : null,
    })) as any[];

    return {
      constraints,
      count: constraints.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get constraints: ${message}`);
  }
}

/**
 * Deactivate a constraint (soft delete)
 * Idempotent - deactivating already-inactive constraint is safe
 *
 * @param params - Constraint ID to deactivate
 * @param db - Optional database instance (for testing)
 * @returns Success status
 */
export function deactivateConstraint(params: DeactivateConstraintParams, db?: Database): DeactivateConstraintResponse {
  const actualDb = db ?? getDatabase();

  try {
    // Validate constraint_id
    if (!params.constraint_id || typeof params.constraint_id !== 'number') {
      throw new Error('constraint_id is required and must be a number');
    }

    // Check if constraint exists
    const constraint = actualDb.prepare('SELECT id, active FROM t_constraints WHERE id = ?').get(params.constraint_id) as { id: number; active: number } | undefined;

    if (!constraint) {
      throw new Error(`Constraint not found: ${params.constraint_id}`);
    }

    // Update constraint to inactive (idempotent)
    actualDb.prepare('UPDATE t_constraints SET active = ? WHERE id = ?').run(SQLITE_FALSE, params.constraint_id);

    return {
      success: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to deactivate constraint: ${message}`);
  }
}

/**
 * Get help documentation for constraint tool
 * @returns Help documentation object
 */
export function constraintHelp(): any {
  return {
    tool: 'constraint',
    description: 'Manage project constraints (performance, architecture, security)',
    note: '💡 TIP: Use action: "example" to see comprehensive usage scenarios and real-world examples for all constraint actions.',
    actions: {
      add: 'Add constraint. Params: category (required), constraint_text (required), priority, layer, tags, created_by',
      get: 'Get constraints. Params: category, layer, priority, tags, active_only, limit',
      deactivate: 'Deactivate constraint. Params: constraint_id (required)'
    },
    examples: {
      add: '{ action: "add", category: "performance", constraint_text: "API response time <100ms", priority: "high", tags: ["api"] }',
      get: '{ action: "get", category: "performance", active_only: true }',
      deactivate: '{ action: "deactivate", constraint_id: 5 }'
    },
    documentation: {
      tool_selection: 'docs/TOOL_SELECTION.md - Decision tree, constraint vs decision comparison (236 lines, ~12k tokens)',
      workflows: 'docs/WORKFLOWS.md - Constraint validation workflows, requirement tracking (602 lines, ~30k tokens)',
      shared_concepts: 'docs/SHARED_CONCEPTS.md - Layer definitions, enum values (category/priority) (339 lines, ~17k tokens)',
      best_practices: 'docs/BEST_PRACTICES.md - When to use constraints, common patterns (345 lines, ~17k tokens)'
    }
  };
}

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
