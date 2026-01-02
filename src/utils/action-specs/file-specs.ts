/**
 * File Tool Action Specifications
 *
 * Parameter requirements and examples for all file tool actions (4 actions).
 * Used for file change tracking with layer association and lock prevention.
 */

import { ActionSpec } from './types.js';

export const FILE_ACTION_SPECS: Record<string, ActionSpec> = {
  record: {
    required: ['file_path', 'change_type'],
    optional: ['layer', 'description', 'agent_name'],  // agent_name optional since v4.1.2
    example: {
      action: 'record',
      file_path: 'src/api/auth.ts',
      change_type: 'modified',
      layer: 'business',
      description: 'Added JWT validation'
    },
    hint: "Valid change_type: created, modified, deleted. Aliases: path→file_path, type→change_type"
  },

  get: {
    required: [],
    optional: ['file_path', 'agent_name', 'layer', 'change_type', 'since', 'limit'],
    example: {
      action: 'get',
      layer: 'business',
      limit: 10
    },
    hint: "Use 'since' with ISO 8601 timestamp for time-based filtering. Alias: path→file_path"
  },

  check_lock: {
    required: ['file_path'],
    optional: ['lock_duration'],
    example: {
      action: 'check_lock',
      file_path: 'src/database/schema.sql',
      lock_duration: 300
    },
    hint: "Default lock_duration is 300 seconds (5 minutes). Aliases: path→file_path, duration→lock_duration"
  },

  record_batch: {
    required: ['file_changes'],
    optional: ['atomic'],
    example: {
      action: 'record_batch',
      file_changes: [
        { file_path: 'src/api.ts', change_type: 'modified', layer: 'presentation' },
        { file_path: 'src/types.ts', change_type: 'modified', layer: 'data' }
      ],
      atomic: false
    },
    hint: "Max 50 file changes per batch. Use atomic:false for best-effort recording. Alias: changes→file_changes"
  }
};
