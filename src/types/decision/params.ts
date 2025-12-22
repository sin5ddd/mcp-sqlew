/**
 * Decision tool parameter types
 */

import type { StatusString } from '../../types.js';

export interface SetDecisionParams {
  key: string;
  value: string | number;
  agent?: string;
  layer?: string;
  version?: string;
  auto_increment?: 'major' | 'minor' | 'patch';
  status?: StatusString;
  tags?: string[];
  scopes?: string[];
  // Policy validation context (v3.9.0)
  rationale?: string;
  alternatives?: any[];
  tradeoffs?: any;
  policy_name?: string;  // Explicit policy to validate against
  // Duplicate detection bypass (v3.9.0)
  ignore_suggest?: boolean;  // Skip similarity checks
  ignore_reason?: string;    // Explanation for bypassing check
}

export interface QuickSetDecisionParams {
  key: string;
  value: string | number;
  agent?: string;
  layer?: string;
  version?: string;
  status?: StatusString;
  tags?: string[];
  scopes?: string[];
}

export interface GetContextParams {
  tags?: string[];
  layer?: string;
  status?: StatusString;
  scope?: string;
  tag_match?: 'AND' | 'OR';
  _reference_project?: string;
}

export interface GetDecisionParams {
  key: string;
}

export interface HardDeleteDecisionParams {
  key: string;
}

export interface SearchByTagsParams {
  tags: string[];
  match_mode?: 'AND' | 'OR';
  status?: StatusString;
  layer?: string;
}

export interface GetVersionsParams {
  key: string;
}

export interface SearchByLayerParams {
  layer: string;
  status?: StatusString;
  include_tags?: boolean;
  _reference_project?: string;
}

export interface SearchAdvancedParams {
  layers?: string[];
  tags_all?: string[];
  tags_any?: string[];
  exclude_tags?: string[];
  scopes?: string[];
  updated_after?: string;
  updated_before?: string;
  decided_by?: string[];
  statuses?: StatusString[];
  search_text?: string;
  sort_by?: 'updated' | 'key' | 'version';
  sort_order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface HasUpdatesParams {
  agent_name: string;
  since_timestamp: string;
}
