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
