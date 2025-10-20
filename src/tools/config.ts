/**
 * Configuration management tools for MCP Shared Context Server
 * Provides tools to get and update auto-deletion configuration
 */

import { getDatabase, getAllConfig, setConfigValue, getConfigBool, getConfigInt } from '../database.js';
import { CONFIG_KEYS } from '../constants.js';

/**
 * Get current configuration settings
 *
 * @returns Current configuration values
 */
export function getConfig(): {
  ignoreWeekend: boolean;
  messageRetentionHours: number;
  fileHistoryRetentionDays: number;
} {
  const db = getDatabase();

  const ignoreWeekend = getConfigBool(db, CONFIG_KEYS.AUTODELETE_IGNORE_WEEKEND, false);
  const messageRetentionHours = getConfigInt(db, CONFIG_KEYS.AUTODELETE_MESSAGE_HOURS, 24);
  const fileHistoryRetentionDays = getConfigInt(db, CONFIG_KEYS.AUTODELETE_FILE_HISTORY_DAYS, 7);

  return {
    ignoreWeekend,
    messageRetentionHours,
    fileHistoryRetentionDays,
  };
}

/**
 * Update configuration settings
 * Validates values before updating
 *
 * @param params - Configuration parameters to update
 * @returns Updated configuration
 */
export function updateConfig(params: {
  ignoreWeekend?: boolean;
  messageRetentionHours?: number;
  fileHistoryRetentionDays?: number;
}): {
  success: boolean;
  config: {
    ignoreWeekend: boolean;
    messageRetentionHours: number;
    fileHistoryRetentionDays: number;
  };
  message: string;
} {
  const db = getDatabase();

  // Validate values
  if (params.messageRetentionHours !== undefined) {
    if (params.messageRetentionHours < 1 || params.messageRetentionHours > 168) {
      throw new Error('messageRetentionHours must be between 1 and 168 (1 week)');
    }
  }

  if (params.fileHistoryRetentionDays !== undefined) {
    if (params.fileHistoryRetentionDays < 1 || params.fileHistoryRetentionDays > 90) {
      throw new Error('fileHistoryRetentionDays must be between 1 and 90 days');
    }
  }

  // Update values
  if (params.ignoreWeekend !== undefined) {
    setConfigValue(db, CONFIG_KEYS.AUTODELETE_IGNORE_WEEKEND, params.ignoreWeekend ? '1' : '0');
  }

  if (params.messageRetentionHours !== undefined) {
    setConfigValue(db, CONFIG_KEYS.AUTODELETE_MESSAGE_HOURS, String(params.messageRetentionHours));
  }

  if (params.fileHistoryRetentionDays !== undefined) {
    setConfigValue(db, CONFIG_KEYS.AUTODELETE_FILE_HISTORY_DAYS, String(params.fileHistoryRetentionDays));
  }

  // Get updated config
  const updatedConfig = getConfig();

  return {
    success: true,
    config: updatedConfig,
    message: 'Configuration updated successfully',
  };
}

/**
 * Get help documentation for config tool
 * @returns Help documentation object
 */
export function configHelp(): any {
  return {
    tool: 'config',
    description: 'Manage auto-deletion configuration (weekend-aware retention)',
    note: '💡 TIP: Use action: "example" to see comprehensive usage scenarios and real-world examples for all config actions.',
    actions: {
      get: 'Get current config. No params required',
      update: 'Update config. Params: ignoreWeekend, messageRetentionHours (1-168), fileHistoryRetentionDays (1-90)'
    },
    examples: {
      get: '{ action: "get" }',
      update: '{ action: "update", ignoreWeekend: true, messageRetentionHours: 48 }'
    },
    documentation: {
      shared_concepts: 'docs/SHARED_CONCEPTS.md - Weekend-aware retention behavior explained (339 lines, ~17k tokens)',
      best_practices: 'docs/BEST_PRACTICES.md - Retention strategies, cleanup timing (345 lines, ~17k tokens)',
      architecture: 'docs/ARCHITECTURE.md - Auto-cleanup architecture, configuration system'
    }
  };
}

/**
 * Get comprehensive examples for config tool
 * @returns Examples documentation object
 */
export function configExample(): any {
  return {
    tool: 'config',
    description: 'Configuration management examples',
    scenarios: {
      view_config: {
        title: 'Current Configuration',
        example: {
          request: '{ action: "get" }',
          response: '{ ignoreWeekend: boolean, messageRetentionHours: number, fileHistoryRetentionDays: number }',
          explanation: 'View current auto-deletion settings'
        }
      },
      standard_retention: {
        title: 'Standard Time-Based Retention',
        example: {
          request: '{ action: "update", ignoreWeekend: false, messageRetentionHours: 24, fileHistoryRetentionDays: 7 }',
          explanation: 'Messages deleted after 24 hours, file history after 7 days (strict time-based)'
        }
      },
      weekend_aware: {
        title: 'Weekend-Aware Retention',
        example: {
          request: '{ action: "update", ignoreWeekend: true, messageRetentionHours: 24, fileHistoryRetentionDays: 7 }',
          explanation: 'On Monday, 24h retention = Friday (skips weekend)',
          scenario: 'Useful for business-hour contexts where weekend messages should persist'
        }
      },
      extended_retention: {
        title: 'Long-Term Project Retention',
        example: {
          request: '{ action: "update", messageRetentionHours: 168, fileHistoryRetentionDays: 90 }',
          explanation: '1 week message retention, 90 days file history (max allowed)',
          use_case: 'Long-running projects needing extended context'
        }
      }
    },
    retention_behavior: {
      ignoreWeekend_false: {
        description: 'Standard time-based retention',
        examples: [
          '24h on Monday = 24 hours ago (Sunday)',
          '24h on Friday = 24 hours ago (Thursday)',
          'Straightforward chronological deletion'
        ]
      },
      ignoreWeekend_true: {
        description: 'Business-hours retention (skips Sat/Sun)',
        examples: [
          '24h on Monday = Friday (skips Sat/Sun)',
          '24h on Tuesday = Monday',
          '24h on Friday = Thursday',
          '24h on Saturday/Sunday = Friday',
          'Preserves weekend messages until Monday cleanup'
        ]
      }
    },
    best_practices: {
      choosing_retention: [
        'Short projects: 24h messages, 7d file history',
        'Medium projects: 72h messages, 14d file history',
        'Long projects: 168h (1 week) messages, 30-90d file history',
        'Use ignoreWeekend=true for business-hour focused work'
      ],
      limits: [
        'messageRetentionHours: 1-168 (1 hour to 1 week)',
        'fileHistoryRetentionDays: 1-90',
        'Choose based on your projects needs and database size constraints'
      ],
      cli_override: [
        'Can override config at server startup via CLI args',
        '--autodelete-ignore-weekend, --autodelete-message-hours, --autodelete-file-history-days',
        'Runtime updates via config tool take precedence over CLI'
      ]
    }
  };
}
