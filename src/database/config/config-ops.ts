/**
 * Configuration operations module
 */

import type { DatabaseAdapter } from '../../adapters/index.js';

/**
 * Get configuration value from v4_config table
 *
 * v4_config is a simple key-value store without project_id
 * (global configuration only)
 *
 * @param adapter - Database adapter
 * @param key - Config key
 * @param _projectId - Deprecated parameter (kept for backward compatibility, ignored)
 * @returns Config value or null if not found
 */
export async function getConfigValue(
  adapter: DatabaseAdapter,
  key: string,
  _projectId?: number | null
): Promise<string | null> {
  const knex = adapter.getKnex();

  // v4_config is a simple key-value store (no project_id column)
  const config = await knex('v4_config')
    .where({ config_key: key })
    .first<{ config_value: string }>();

  return config ? config.config_value : null;
}

/**
 * Set configuration value in v4_config table
 */
export async function setConfigValue(
  adapter: DatabaseAdapter,
  key: string,
  value: string | number | boolean
): Promise<void> {
  const knex = adapter.getKnex();
  const stringValue = String(value);
  await knex('v4_config')
    .insert({ config_key: key, config_value: stringValue })
    .onConflict('config_key')
    .merge({ config_value: stringValue });
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
export async function getAllConfig(adapter: DatabaseAdapter): Promise<Record<string, string>> {
  const knex = adapter.getKnex();
  const rows = await knex('v4_config').select('config_key', 'config_value');
  const config: Record<string, string> = {};
  for (const row of rows) {
    config[row.config_key] = row.config_value;
  }
  return config;
}
