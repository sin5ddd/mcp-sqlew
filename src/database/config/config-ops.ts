/**
 * Configuration operations module
 */

import type { DatabaseAdapter } from '../../adapters/index.js';

/**
 * Get configuration value from m_config table with per-project inheritance
 *
 * Lookup priority:
 * 1. Project-specific config (project_id = provided projectId)
 * 2. Global config (project_id = NULL)
 *
 * @param adapter - Database adapter
 * @param key - Config key
 * @param projectId - Optional project ID (if not provided, only checks global config)
 * @returns Config value or null if not found
 */
export async function getConfigValue(
  adapter: DatabaseAdapter,
  key: string,
  projectId?: number | null
): Promise<string | null> {
  const knex = adapter.getKnex();

  // If projectId provided, try project-specific config first
  if (projectId !== undefined && projectId !== null) {
    const projectConfig = await knex('m_config')
      .where({ key, project_id: projectId })
      .first<{ value: string }>();

    if (projectConfig) {
      return projectConfig.value;
    }
  }

  // Fallback to global config (project_id = NULL)
  const globalConfig = await knex('m_config')
    .where({ key })
    .whereNull('project_id')
    .first<{ value: string }>();

  return globalConfig ? globalConfig.value : null;
}

/**
 * Set configuration value in m_config table
 */
export async function setConfigValue(
  adapter: DatabaseAdapter,
  key: string,
  value: string | number | boolean
): Promise<void> {
  const knex = adapter.getKnex();
  const stringValue = String(value);
  await knex('m_config')
    .insert({ key, value: stringValue })
    .onConflict('key')
    .merge({ value: stringValue });
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
  const rows = await knex('m_config').select('key', 'value');
  const config: Record<string, string> = {};
  for (const row of rows) {
    config[row.key] = row.value;
  }
  return config;
}
