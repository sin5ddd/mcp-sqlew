/**
 * Configuration file loader
 * Reads .sqlew/config.toml and merges with defaults
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { parse as parseTOML } from 'smol-toml';
import type { SqlewConfig, FlatConfig } from './types.js';
import { DEFAULT_CONFIG } from './types.js';

/**
 * Default config file path (relative to project root)
 */
export const DEFAULT_CONFIG_PATH = '.sqlew/config.toml';

/**
 * Load configuration from TOML file
 *
 * Priority: File config → Defaults
 *
 * @param configPath - Path to config file (optional, defaults to .sqlew/config.toml)
 * @returns Parsed and merged configuration
 */
export function loadConfigFile(configPath?: string): SqlewConfig {
  const finalPath = configPath || DEFAULT_CONFIG_PATH;
  const absolutePath = resolve(process.cwd(), finalPath);

  // If file doesn't exist, return defaults
  if (!existsSync(absolutePath)) {
    return DEFAULT_CONFIG;
  }

  try {
    // Read and parse TOML file
    const content = readFileSync(absolutePath, 'utf-8');
    const parsed = parseTOML(content) as SqlewConfig;

    // Merge with defaults (file config takes priority)
    const merged: SqlewConfig = {
      database: {
        ...DEFAULT_CONFIG.database,
        ...parsed.database,
      },
      autodelete: {
        ...DEFAULT_CONFIG.autodelete,
        ...parsed.autodelete,
      },
      tasks: {
        ...DEFAULT_CONFIG.tasks,
        ...parsed.tasks,
      },
    };

    return merged;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`⚠️  Failed to load config file: ${finalPath}`);
    console.warn(`   Error: ${message}`);
    console.warn(`   Using default configuration`);
    return DEFAULT_CONFIG;
  }
}

/**
 * Flatten nested config structure to database key-value format
 * Converts TOML sections (autodelete.message_hours) to flat keys (autodelete_message_hours)
 *
 * @param config - Nested configuration
 * @returns Flattened configuration for database storage
 */
export function flattenConfig(config: SqlewConfig): FlatConfig {
  const flat: FlatConfig = {};

  // Flatten autodelete section
  if (config.autodelete) {
    if (config.autodelete.ignore_weekend !== undefined) {
      flat.autodelete_ignore_weekend = config.autodelete.ignore_weekend;
    }
    if (config.autodelete.message_hours !== undefined) {
      flat.autodelete_message_hours = config.autodelete.message_hours;
    }
    if (config.autodelete.file_history_days !== undefined) {
      flat.autodelete_file_history_days = config.autodelete.file_history_days;
    }
  }

  // Flatten tasks section
  if (config.tasks) {
    if (config.tasks.auto_archive_done_days !== undefined) {
      flat.auto_archive_done_days = config.tasks.auto_archive_done_days;
    }
    if (config.tasks.stale_hours_in_progress !== undefined) {
      flat.task_stale_hours_in_progress = config.tasks.stale_hours_in_progress;
    }
    if (config.tasks.stale_hours_waiting_review !== undefined) {
      flat.task_stale_hours_waiting_review = config.tasks.stale_hours_waiting_review;
    }
    if (config.tasks.auto_stale_enabled !== undefined) {
      flat.task_auto_stale_enabled = config.tasks.auto_stale_enabled;
    }
  }

  return flat;
}

/**
 * Load config file and prepare for database insertion
 * Combines loading and flattening in one call
 *
 * @param configPath - Optional path to config file
 * @returns Flattened configuration ready for database
 */
export function loadAndFlattenConfig(configPath?: string): FlatConfig {
  const config = loadConfigFile(configPath);
  return flattenConfig(config);
}

/**
 * Validate configuration values
 * Ensures all values are within acceptable ranges
 *
 * @param config - Configuration to validate
 * @returns Validation result with errors if any
 */
export function validateConfig(config: SqlewConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate autodelete settings
  if (config.autodelete) {
    if (config.autodelete.message_hours !== undefined) {
      if (config.autodelete.message_hours < 1 || config.autodelete.message_hours > 720) {
        errors.push('autodelete.message_hours must be between 1 and 720 (30 days)');
      }
    }
    if (config.autodelete.file_history_days !== undefined) {
      if (config.autodelete.file_history_days < 1 || config.autodelete.file_history_days > 365) {
        errors.push('autodelete.file_history_days must be between 1 and 365');
      }
    }
  }

  // Validate task settings
  if (config.tasks) {
    if (config.tasks.auto_archive_done_days !== undefined) {
      if (config.tasks.auto_archive_done_days < 1 || config.tasks.auto_archive_done_days > 365) {
        errors.push('tasks.auto_archive_done_days must be between 1 and 365');
      }
    }
    if (config.tasks.stale_hours_in_progress !== undefined) {
      if (config.tasks.stale_hours_in_progress < 1 || config.tasks.stale_hours_in_progress > 168) {
        errors.push('tasks.stale_hours_in_progress must be between 1 and 168 (7 days)');
      }
    }
    if (config.tasks.stale_hours_waiting_review !== undefined) {
      if (config.tasks.stale_hours_waiting_review < 1 || config.tasks.stale_hours_waiting_review > 720) {
        errors.push('tasks.stale_hours_waiting_review must be between 1 and 720 (30 days)');
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
