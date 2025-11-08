/**
 * File Tool Action Specifications
 *
 * Parameter requirements and examples for all file tool actions (4 actions).
 * Used for file change tracking with layer association and lock prevention.
 */

import { ActionSpec } from './types.js';

export const FILE_ACTION_SPECS: Record<string, ActionSpec> = {
  record: {
    required: ['file_path', 'agent_name', 'change_type'],
    optional: ['layer', 'description'],
    example: {
      action: 'record',
      file_path: 'src/api/auth.ts',
      agent_name: 'refactor-agent',
      change_type: 'modified',
      layer: 'business',
      description: 'Added JWT validation'
    },
    hint: "Valid change_type: created, modified, deleted"
  },

  get: {
    required: [],
    optional: ['file_path', 'agent_name', 'layer', 'change_type', 'since', 'limit'],
    example: {
      action: 'get',
      agent_name: 'refactor-agent',
      layer: 'business',
      limit: 10
    },
    hint: "Use 'since' with ISO 8601 timestamp for time-based filtering"
  },

  check_lock: {
    required: ['file_path'],
    optional: ['lock_duration'],
    example: {
      action: 'check_lock',
      file_path: 'src/database/schema.sql',
      lock_duration: 300
    },
    hint: "Default lock_duration is 300 seconds (5 minutes). Prevents concurrent edits."
  },

  record_batch: {
    required: ['file_changes'],
    optional: ['atomic'],
    example: {
      action: 'record_batch',
      file_changes: [
        { file_path: 'src/api.ts', agent_name: 'bot1', change_type: 'modified', layer: 'presentation' },
        { file_path: 'src/types.ts', agent_name: 'bot1', change_type: 'modified', layer: 'data' }
      ],
      atomic: false
    },
    hint: "Max 50 file changes per batch. Use atomic:false for best-effort recording."
  }
};
