/**
 * Decision tool response types
 */

import type { TaggedDecision } from '../view-entities.js';

export interface SetDecisionResponse {
  success: boolean;
  key: string;
  key_id: number;
  version: string;
  message?: string;
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
