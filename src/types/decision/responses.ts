/**
 * Decision tool response types
 */

import type { TaggedDecision } from '../view-entities.js';

export interface SetDecisionResponse {
  success: boolean;
  key: string;
  key_id: number;
  version: string;
  version_action?: 'initial' | 'explicit' | 'auto_increment_major' | 'auto_increment_minor' | 'auto_increment_patch';
  message?: string;
  // Duplicate risk warning (v3.9.0 - Tier 1: score 50-84)
  duplicate_risk?: {
    severity: 'MODERATE';
    max_score: number;
    recommended_action: 'UPDATE_EXISTING' | 'REVIEW_MANUALLY' | 'CREATE_NEW';
    confidence: {
      is_duplicate: number;     // 0-1 scale: confidence this is a duplicate
      should_update: number;    // 0-1 scale: confidence update is correct action
    };
    suggestions: Array<{
      key: string;
      value: string | number;
      score: number;
      recommended: boolean;     // True for best match
      matches: {
        tags: string[];         // Overlapping tags
        layer?: string;         // Layer match
        key_pattern?: string;   // Key pattern similarity
      };
      differs?: {
        tags?: string;          // Different tags (existing vs proposed)
      };
      last_updated: string;     // Human-readable time (e.g., "2h ago")
      version_info: {
        current: string;
        next_suggested: string;
        recent_changes: string[];  // Last N version changes
      };
      reasoning: string;        // Why this suggestion is relevant
      update_command: {         // Copy-paste ready command
        key: string;
        value: string | number;
        version: string;
        layer?: string;
        tags?: string[];
      };
    }>;
  };
}

export interface QuickSetDecisionResponse {
  success: boolean;
  key: string;
  key_id: number;
  version: string;
  inferred: {
    layer?: string;
    tags?: string[];
    scope?: string;
  };
  message?: string;
}

export interface GetContextResponse {
  decisions: TaggedDecision[];
  count: number;
}

export interface GetDecisionResponse {
  found: boolean;
  decision?: TaggedDecision;
  context?: Array<{
    id: number;
    rationale: string;
    alternatives_considered: any;
    tradeoffs: any;
    decided_by: string | null;
    decision_date: string;
    related_task_id: number | null;
    related_constraint_id: number | null;
  }>;
}

export interface HardDeleteDecisionResponse {
  success: boolean;
  key: string;
  message?: string;
}

export interface SearchByTagsResponse {
  decisions: TaggedDecision[];
  count: number;
}

export interface GetVersionsResponse {
  key: string;
  history: Array<{
    version: string;
    value: string;
    agent: string | null;
    timestamp: string;
  }>;
  count: number;
}

export interface SearchByLayerResponse {
  layer: string;
  decisions: TaggedDecision[];
  count: number;
}

export interface SearchAdvancedResponse {
  decisions: TaggedDecision[];
  count: number;
  total_count: number;
}

export interface HasUpdatesResponse {
  has_updates: boolean;
  counts: {
    decisions: number;
    messages: number;
    files: number;
  };
}
