/**
 * Constraint management tools for MCP Shared Context Server
 * Handles constraint tracking with priority, layer assignment, and tags
 *
 * CONVERTED: Using Knex.js with DatabaseAdapter (async/await)
 */

import { DatabaseAdapter } from '../adapters/index.js';
import {
  getAdapter,
  getOrCreateAgent,
  getLayerId,
  getOrCreateTag,
  getOrCreateCategoryId
} from '../database.js';
import {
  STRING_TO_PRIORITY,
  PRIORITY_TO_STRING,
  DEFAULT_PRIORITY,
  SQLITE_TRUE,
  SQLITE_FALSE
} from '../constants.js';
import { validateCategory, validatePriority } from '../utils/validators.js';
import { validateActionParams } from '../utils/parameter-validator.js';
import { logConstraintAdd } from '../utils/activity-logging.js';
import { parseStringArray } from '../utils/param-parser.js';
import { Knex } from 'knex';
import type {
  AddConstraintParams,
  AddConstraintResponse,
  GetConstraintsParams,
  GetConstraintsResponse,
  DeactivateConstraintParams,
  DeactivateConstraintResponse,
  TaggedConstraint,
  Priority
} from '../types.js';

/**
 * Get or create constraint category ID
 * Uses INSERT OR IGNORE for idempotent operation
 */

/**
 * Add a constraint with priority, layer, and tags
 *
 * @param params - Constraint parameters
 * @param adapter - Optional database adapter (for testing)
 * @returns Constraint ID and timestamp
 */
export async function addConstraint(
  params: AddConstraintParams,
  adapter?: DatabaseAdapter
): Promise<AddConstraintResponse> {
  const actualAdapter = adapter ?? getAdapter();

  try {
    // Validate parameters
    validateActionParams('constraint', 'add', params);

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
      layerId = await getLayerId(actualAdapter, params.layer);
      if (!layerId) {
        throw new Error(`Layer not found: ${params.layer}`);
      }
    }

    // Use transaction for multi-table insert
    const result = await actualAdapter.transaction(async (trx) => {
      // Get or create category
      const categoryId = await getOrCreateCategoryId(actualAdapter, params.category, trx);

      // Get or create created_by agent (default to generic pool)
      const createdBy = params.created_by || '';
      const agentId = await getOrCreateAgent(actualAdapter, createdBy, trx);

      // Calculate timestamp
      const ts = Math.floor(Date.now() / 1000);

      // Insert constraint
      const [constraintId] = await trx('t_constraints').insert({
        category_id: categoryId,
        layer_id: layerId,
        constraint_text: params.constraint_text,
        priority: priority,
        active: SQLITE_TRUE,
        agent_id: agentId,
        ts: ts
      });

      // Insert m_tags if provided
      if (params.tags && params.tags.length > 0) {
        // Parse tags (handles both arrays and JSON strings from MCP)
        const tags = parseStringArray(params.tags);
        for (const tagName of tags) {
          const tagId = await getOrCreateTag(actualAdapter, tagName, trx);
          await trx('t_constraint_tags').insert({
            constraint_id: Number(constraintId),
            tag_id: tagId
          });
        }
      }

      // Activity logging (replaces trigger)
      await logConstraintAdd(trx, {
        constraint_id: Number(constraintId),
        category: params.category,
        constraint_text: params.constraint_text,
        priority: priorityStr,
        layer: params.layer || null,
        created_by: createdBy,
        agent_id: agentId
      });

      return { constraintId: Number(constraintId) };
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
 * @param adapter - Optional database adapter (for testing)
 * @returns Array of t_constraints matching filters
 */
export async function getConstraints(
  params: GetConstraintsParams,
  adapter?: DatabaseAdapter
): Promise<GetConstraintsResponse> {
  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  try {
    // Validate parameters
    validateActionParams('constraint', 'get', params);

    // Build query using v_tagged_constraints view (already filters active=1)
    let query = knex('v_tagged_constraints');

    // Filter by category
    if (params.category) {
      validateCategory(params.category);
      query = query.where('category', params.category);
    }

    // Filter by layer
    if (params.layer) {
      query = query.where('layer', params.layer);
    }

    // Filter by priority
    if (params.priority) {
      query = query.where('priority', params.priority);
    }

    // Filter by m_tags (OR logic - match ANY tag)
    if (params.tags && params.tags.length > 0) {
      // Parse tags (handles both arrays and JSON strings from MCP)
      const tags = parseStringArray(params.tags);
      query = query.where((builder) => {
        for (const tag of tags) {
          builder.orWhere('tags', 'like', `%${tag}%`);
        }
      });
    }

    // Note: v_tagged_constraints view already orders by priority DESC, category, ts DESC
    // Add limit if provided
    const limit = params.limit || 50;
    query = query.limit(limit);

    // Execute query
    const rows = await query.select('*') as TaggedConstraint[];

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
 * @param adapter - Optional database adapter (for testing)
 * @returns Success status
 */
export async function deactivateConstraint(
  params: DeactivateConstraintParams,
  adapter?: DatabaseAdapter
): Promise<DeactivateConstraintResponse> {
  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  try {
    // Validate parameters
    validateActionParams('constraint', 'deactivate', params);

    // Check if constraint exists
    const constraint = await knex('t_constraints')
      .where({ id: params.constraint_id })
      .select('id', 'active')
      .first() as { id: number; active: number } | undefined;

    if (!constraint) {
      throw new Error(`Constraint not found: ${params.constraint_id}`);
    }

    // Update constraint to inactive (idempotent)
    await knex('t_constraints')
      .where({ id: params.constraint_id })
      .update({ active: SQLITE_FALSE });

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


