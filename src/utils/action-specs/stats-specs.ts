/**
 * Stats Tool Action Specifications
 *
 * Parameter requirements and examples for all stats tool actions (5 actions).
 * Used for aggregated statistics, cleanup, and activity logging.
 */

import { ActionSpec } from './types.js';

export const STATS_ACTION_SPECS: Record<string, ActionSpec> = {
  layer_summary: {
    required: [],
    optional: [],
    example: {
      action: 'layer_summary'
    },
    hint: "Returns decision, file change, and constraint counts per layer"
  },

  db_stats: {
    required: [],
    optional: [],
    example: {
      action: 'db_stats'
    },
    hint: "Comprehensive statistics including task counts by status and priority"
  },

  clear: {
    required: [],
    optional: ['messages_older_than_hours', 'file_changes_older_than_days'],
    example: {
      action: 'clear',
      messages_older_than_hours: 48,
      file_changes_older_than_days: 14
    },
    hint: "If no parameters provided, uses config-based weekend-aware retention"
  },

  activity_log: {
    required: [],
    optional: ['since', 'agent_names', 'actions', 'limit'],
    example: {
      action: 'activity_log',
      since: '1h',
      agent_names: ['bot1', 'bot2'],
      limit: 50
    },
    hint: "Use relative time formats: '5m', '1h', '2d' or ISO 8601 timestamps"
  },

  flush: {
    required: [],
    optional: [],
    example: {
      action: 'flush'
    },
    hint: "Forces WAL checkpoint to flush pending transactions. Run before git commits."
  }
};
