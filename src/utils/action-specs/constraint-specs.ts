/**
 * Constraint Tool Action Specifications
 *
 * Parameter requirements and examples for all constraint tool actions (5 actions).
 * Used for architectural rules with priority and metadata.
 */

import { ActionSpec } from './types.js';

export const CONSTRAINT_ACTION_SPECS: Record<string, ActionSpec> = {
  add: {
    required: ['category', 'constraint_text', 'priority'],
    optional: ['layer', 'tags', 'created_by', 'active'],
    example: {
      action: 'add',
      category: 'performance',
      constraint_text: 'API response time must be <100ms for 95th percentile',
      priority: 'high',
      layer: 'business',
      tags: ['api', 'latency']
    },
    hint: "Valid categories: performance, architecture, security, code-style. Valid priorities: low, medium, high, critical. Set active=false for draft constraints."
  },

  get: {
    required: [],
    optional: ['category', 'layer', 'priority', 'tags', 'limit', 'include_inactive'],
    example: {
      action: 'get',
      category: 'performance',
      priority: 'high',
      limit: 50
    },
    hint: "Returns only active constraints by default. Set include_inactive=true to show all."
  },

  activate: {
    required: ['constraint_id'],
    optional: [],
    example: {
      action: 'activate',
      constraint_id: 5
    },
    hint: "Activate an inactive constraint by ID"
  },

  deactivate: {
    required: ['constraint_id'],
    optional: [],
    example: {
      action: 'deactivate',
      constraint_id: 5
    },
    hint: "Soft delete - constraint remains in database but marked inactive"
  },

  suggest_pending: {
    required: [],
    optional: ['project_path'],
    example: {
      action: 'suggest_pending'
    },
    hint: "Returns pending constraint candidates from plan TOML cache. No DB access - reads from session cache only."
  }
};
