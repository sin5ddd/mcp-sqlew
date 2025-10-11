/**
 * Constraint management tools for MCP Shared Context Server
 * Handles constraint tracking with priority, layer assignment, and tags
 */

import { getDatabase, getOrCreateAgent, getLayerId, transaction, getOrCreateTag } from '../database.js';
import {
  STRING_TO_PRIORITY,
  PRIORITY_TO_STRING,
  DEFAULT_PRIORITY,
  SQLITE_TRUE,
  SQLITE_FALSE
} from '../constants.js';
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
 * Validate constraint category (must be one of predefined)
 * Categories: performance, architecture, security
 */
function validateCategory(category: string): void {
  const validCategories = ['performance', 'architecture', 'security'];
  if (!validCategories.includes(category)) {
    throw new Error(`Invalid category. Must be one of: ${validCategories.join(', ')}`);
  }
}

/**
 * Get or create constraint category ID
 * Uses INSERT OR IGNORE for idempotent operation
 */
function getOrCreateCategoryId(db: Database, category: string): number {
  // Insert if doesn't exist
  db.prepare('INSERT OR IGNORE INTO m_constraint_categories (name) VALUES (?)').run(category);

  // Get the ID
  const result = db.prepare('SELECT id FROM m_constraint_categories WHERE name = ?').get(category) as { id: number } | undefined;

  if (!result) {
    throw new Error(`Failed to get or create category: ${category}`);
  }

  return result.id;
}

/**
 * Add a constraint with priority, layer, and tags
 *
 * @param params - Constraint parameters
 * @returns Constraint ID and timestamp
 */
export function addConstraint(params: AddConstraintParams): AddConstraintResponse {
  const db = getDatabase();

  try {
    // Validate required parameters
    if (!params.category || !params.constraint_text) {
      throw new Error('category and constraint_text are required');
    }

    // Validate category
    validateCategory(params.category);

    // Validate priority if provided
    const priorityStr = params.priority || 'medium';
    if (!['low', 'medium', 'high', 'critical'].includes(priorityStr)) {
      throw new Error('Invalid priority. Must be: low, medium, high, or critical');
    }
    const priority = STRING_TO_PRIORITY[priorityStr] || DEFAULT_PRIORITY;

    // Validate and get layer ID if provided
    let layerId: number | null = null;
    if (params.layer) {
      const validLayers = ['presentation', 'business', 'data', 'infrastructure', 'cross-cutting'];
      if (!validLayers.includes(params.layer)) {
        throw new Error(`Invalid layer. Must be one of: ${validLayers.join(', ')}`);
      }
      layerId = getLayerId(db, params.layer);
      if (!layerId) {
        throw new Error(`Layer not found: ${params.layer}`);
      }
    }

    // Use transaction for multi-table insert
    const result = transaction(db, () => {
      // Get or create category
      const categoryId = getOrCreateCategoryId(db, params.category);

      // Get or create created_by agent
      const createdBy = params.created_by || 'system';
      const agentId = getOrCreateAgent(db, createdBy);

      // Insert constraint
      const insertResult = db.prepare(`
        INSERT INTO t_constraints (category_id, layer_id, constraint_text, priority, active, created_by, ts)
        VALUES (?, ?, ?, ?, ?, ?, unixepoch())
      `).run(categoryId, layerId, params.constraint_text, priority, SQLITE_TRUE, agentId);

      const constraintId = insertResult.lastInsertRowid as number;

      // Insert m_tags if provided
      if (params.tags && params.tags.length > 0) {
        const tagStmt = db.prepare('INSERT INTO t_constraint_tags (constraint_id, tag_id) VALUES (?, ?)');

        for (const tagName of params.tags) {
          const tagId = getOrCreateTag(db, tagName);
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
 * @returns Array of t_constraints matching filters
 */
export function getConstraints(params: GetConstraintsParams): GetConstraintsResponse {
  const db = getDatabase();

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
    const rows = db.prepare(sql).all(...values) as TaggedConstraint[];

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
 * @returns Success status
 */
export function deactivateConstraint(params: DeactivateConstraintParams): DeactivateConstraintResponse {
  const db = getDatabase();

  try {
    // Validate constraint_id
    if (!params.constraint_id || typeof params.constraint_id !== 'number') {
      throw new Error('constraint_id is required and must be a number');
    }

    // Check if constraint exists
    const constraint = db.prepare('SELECT id, active FROM t_constraints WHERE id = ?').get(params.constraint_id) as { id: number; active: number } | undefined;

    if (!constraint) {
      throw new Error(`Constraint not found: ${params.constraint_id}`);
    }

    // Update constraint to inactive (idempotent)
    db.prepare('UPDATE t_constraints SET active = ? WHERE id = ?').run(SQLITE_FALSE, params.constraint_id);

    return {
      success: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to deactivate constraint: ${message}`);
  }
}
