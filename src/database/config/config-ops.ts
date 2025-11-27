/**
 * Configuration operations module
 *
 * v4.0: In-memory configuration store
 * Config values are set from CLI arguments or config file at startup.
 * No database dependency - purely in-memory.
 */

import type { DatabaseAdapter } from '../../adapters/index.js';

/**
 * In-memory configuration store
 * Key-value pairs stored as strings (consistent with previous DB implementation)
 */
const configStore: Map<string, string> = new Map();

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Record<string, string> = {
  autodelete_ignore_weekend: '0',
  autodelete_message_hours: '24',
  autodelete_file_history_days: '7',
  auto_archive_done_days: '2',
  review_idle_minutes: '15',
  review_require_all_files_modified: '1',
  review_require_tests_pass: '1',
  review_require_compile: '1',
  git_auto_complete_on_stage: '1',
  git_auto_archive_on_commit: '1',
  require_all_files_staged: '1',
  require_all_files_committed_for_archive: '1',
  git_auto_complete_enabled: '1',
  require_all_files_committed: '1',
};

/**
 * Get configuration value from in-memory store
 *
 * @param _adapter - Deprecated parameter (kept for backward compatibility, ignored)
 * @param key - Config key
 * @param _projectId - Deprecated parameter (kept for backward compatibility, ignored)
 * @returns Config value or null if not found
 */
export async function getConfigValue(
  _adapter: DatabaseAdapter,
  key: string,
  _projectId?: number | null
): Promise<string | null> {
  // Check in-memory store first
  if (configStore.has(key)) {
    return configStore.get(key)!;
  }

  // Return default value if exists
  if (key in DEFAULT_CONFIG) {
    return DEFAULT_CONFIG[key];
  }

  return null;
}

/**
 * Set configuration value in in-memory store
 */
export async function setConfigValue(
  _adapter: DatabaseAdapter,
  key: string,
  value: string | number | boolean
): Promise<void> {
  const stringValue = String(value);
  configStore.set(key, stringValue);
}

/**
 * Get configuration value as boolean
 */
export async function getConfigBool(
  adapter: DatabaseAdapter,
  key: string,
  defaultValue: boolean = false
): Promise<boolean> {
  const value = await getConfigValue(adapter, key);
  if (value === null) return defaultValue;
  return value === '1' || value.toLowerCase() === 'true';
}

/**
 * Get configuration value as integer
 */
export async function getConfigInt(
  adapter: DatabaseAdapter,
  key: string,
  defaultValue: number = 0
): Promise<number> {
  const value = await getConfigValue(adapter, key);
  if (value === null) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Get all configuration as an object
 */
export async function getAllConfig(_adapter: DatabaseAdapter): Promise<Record<string, string>> {
  const config: Record<string, string> = { ...DEFAULT_CONFIG };

  // Override with values from in-memory store
  for (const [key, value] of configStore) {
    config[key] = value;
  }

  return config;
}

/**
 * Clear all configuration (useful for testing)
 */
export function clearConfig(): void {
  configStore.clear();
}

/**
 * Set multiple configuration values at once
 */
export async function setConfigValues(
  _adapter: DatabaseAdapter,
  values: Record<string, string | number | boolean>
): Promise<void> {
  for (const [key, value] of Object.entries(values)) {
    configStore.set(key, String(value));
  }
}
