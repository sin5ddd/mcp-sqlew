/**
 * Stats tool parameter types
 */

export interface GetLayerSummaryParams {
  // No parameters - returns all layers
}

export interface ClearOldDataParams {
  messages_older_than_hours?: number;
  file_changes_older_than_days?: number;
}

export interface GetStatsParams {
  // No parameters - returns overall stats
}

export interface GetActivityLogParams {
  since?: string;  // ISO timestamp or relative like "5m", "1h", "2h", "1d"
  agent_names?: string[];  // Filter by agents (or ["*"] for all)
  actions?: string[];  // Filter by action types
  limit?: number;  // Max results (default: 100)
}
