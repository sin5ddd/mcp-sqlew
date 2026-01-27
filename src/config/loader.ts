/**
 * Configuration file loader
 * Reads .sqlew/config.toml and merges with defaults
 *
 * Worktree Support (v4.1.0+):
 * - Detects if current directory is a git worktree
 * - Loads config from main repository if worktree has no local config
 * - Local worktree config overrides main repository config
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { parse as parseTOML } from 'smol-toml';
import type { SqlewConfig, FlatConfig, DatabaseConfig } from './types.js';
import { DEFAULT_CONFIG } from './types.js';
import { GitAdapter } from '../utils/vcs-adapter.js';

/**
 * Default config file path (relative to project root)
 */
export const DEFAULT_CONFIG_PATH = '.sqlew/config.toml';

/**
 * Load configuration from TOML file
 *
 * Priority: File config → Defaults
 *
 * @param projectRoot - Project root directory (defaults to process.cwd())
 * @param configPath - Path to config file (optional, defaults to .sqlew/config.toml)
 * @returns Parsed and merged configuration
 */
export function loadConfigFile(projectRoot: string = process.cwd(), configPath?: string): SqlewConfig {
  const finalPath = configPath || DEFAULT_CONFIG_PATH;
  const absolutePath = resolve(projectRoot, finalPath);

  // If file doesn't exist, return defaults
  if (!existsSync(absolutePath)) {
    return DEFAULT_CONFIG;
  }

  try {
    // Read and parse TOML file
    const content = readFileSync(absolutePath, 'utf-8');
    const parsed = parseTOML(content) as SqlewConfig;

    // Normalize database config with defaults
    let databaseConfig = DEFAULT_CONFIG.database;
    if (parsed.database) {
      databaseConfig = normalizeDatabaseConfig({
        ...DEFAULT_CONFIG.database,
        ...parsed.database,
      });
    }

    // Merge with defaults (file config takes priority)
    const merged: SqlewConfig = {
      database: databaseConfig,
      autodelete: {
        ...DEFAULT_CONFIG.autodelete,
        ...parsed.autodelete,
      },
      tasks: {
        ...DEFAULT_CONFIG.tasks,
        ...parsed.tasks,
      },
      debug: {
        ...DEFAULT_CONFIG.debug,
        ...parsed.debug,
      },
      agents: {
        ...DEFAULT_CONFIG.agents,
        ...parsed.agents,
      },
      commands: {
        ...DEFAULT_CONFIG.commands,
        ...parsed.commands,
      },
    };

    // Validate the merged configuration
    const validation = validateConfig(merged);
    if (!validation.valid) {
      console.error(`⚠️  Configuration validation failed: ${finalPath}`);
      validation.errors.forEach(err => console.error(`   - ${err}`));
      console.error(`   Using default configuration`);
      return DEFAULT_CONFIG;
    }

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
 * @param projectRoot - Project root directory (defaults to process.cwd())
 * @param configPath - Optional path to config file
 * @returns Flattened configuration ready for database
 */
export function loadAndFlattenConfig(projectRoot: string = process.cwd(), configPath?: string): FlatConfig {
  const config = loadConfigFile(projectRoot, configPath);
  return flattenConfig(config);
}

/**
 * Validate database configuration
 * Ensures database type, connection, and auth settings are correct
 *
 * @param config - Database configuration to validate
 * @returns Validation result with errors if any
 */
export function validateDatabaseConfig(
  config: DatabaseConfig
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // If path is specified (SQLite), no further validation needed
  if (config.path) {
    return { valid: true, errors: [] };
  }

  // If no type specified and no path, use defaults
  if (!config.type) {
    return { valid: true, errors: [] };
  }

  // Validate database type
  const validTypes = ['sqlite', 'postgres', 'mysql', 'cloud'];
  if (!validTypes.includes(config.type)) {
    errors.push(`database.type must be one of: ${validTypes.join(', ')}`);
    return { valid: false, errors };
  }

  // SQLite doesn't need connection or auth
  if (config.type === 'sqlite') {
    return { valid: true, errors: [] };
  }

  // Cloud mode: API key validation is done in backend-factory
  if (config.type === 'cloud') {
    return { valid: true, errors: [] };
  }

  // PostgreSQL and MySQL require connection and auth
  if (!config.connection) {
    errors.push(`database.connection is required for ${config.type}`);
  } else {
    // Validate connection fields
    if (!config.connection.host) {
      errors.push('database.connection.host is required');
    }
    if (!config.connection.port) {
      errors.push('database.connection.port is required');
    } else {
      const port = config.connection.port;
      if (port < 1 || port > 65535) {
        errors.push('database.connection.port must be between 1 and 65535');
      }
    }
    if (!config.connection.database) {
      errors.push('database.connection.database is required');
    }
  }

  if (!config.auth) {
    errors.push(`database.auth is required for ${config.type}`);
  } else {
    // Validate auth type (SSH removed - users must set up tunnels manually)
    const validAuthTypes = ['direct', 'aws-iam', 'gcp-iam'];
    if (!validAuthTypes.includes(config.auth.type)) {
      errors.push(`database.auth.type must be one of: ${validAuthTypes.join(', ')}`);
    }

    // Validate auth fields based on type
    if (config.auth.type === 'direct') {
      if (!config.auth.user) {
        errors.push('database.auth.user is required for direct authentication');
      }
      if (!config.auth.password) {
        errors.push('database.auth.password is required for direct authentication');
      }
    } else if (config.auth.type === 'aws-iam' || config.auth.type === 'gcp-iam') {
      errors.push(`${config.auth.type} authentication is not yet implemented`);
    }

    // Validate SSL configuration if present
    if (config.auth.ssl) {
      if (config.auth.ssl.rejectUnauthorized !== undefined) {
        if (typeof config.auth.ssl.rejectUnauthorized !== 'boolean') {
          errors.push('database.auth.ssl.rejectUnauthorized must be a boolean');
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Normalize and apply defaults to database configuration
 *
 * @param config - Partial database configuration
 * @returns Complete database configuration with defaults
 */
export function normalizeDatabaseConfig(config: DatabaseConfig): DatabaseConfig {
  // If path is specified, it's SQLite
  if (config.path) {
    return { path: config.path };
  }

  // If no type, use SQLite default
  if (!config.type) {
    return {};
  }

  // SQLite doesn't need connection or auth
  if (config.type === 'sqlite') {
    return { type: 'sqlite', path: config.path };
  }

  // Apply defaults to connection
  const connection = config.connection ? { ...config.connection } : undefined;

  // Apply defaults to auth
  let auth = config.auth ? { ...config.auth } : undefined;
  if (auth) {
    // Apply SSL defaults
    if (auth.ssl) {
      auth = {
        ...auth,
        ssl: {
          rejectUnauthorized: true,
          ...auth.ssl,
        },
      };
    }
  }

  return {
    type: config.type,
    connection,
    auth,
  };
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

  // Validate database configuration
  if (config.database) {
    const dbValidation = validateDatabaseConfig(config.database);
    if (!dbValidation.valid) {
      errors.push(...dbValidation.errors);
    }
  }

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

  // Validate agents settings
  if (config.agents) {
    const validKeys = ['scrum_master', 'researcher', 'architect'];
    const configKeys = Object.keys(config.agents);
    const invalidKeys = configKeys.filter(k => !validKeys.includes(k));

    if (invalidKeys.length > 0) {
      errors.push(`agents section has invalid keys: ${invalidKeys.join(', ')}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// Worktree Support (v4.1.0+)
// ============================================================================

/**
 * Resolve config path with worktree support
 *
 * If the current directory is a git worktree:
 * 1. Check for local config in worktree
 * 2. If not found, check for config in main repository
 * 3. If neither exists, return null
 *
 * @param projectRoot - Current project root directory
 * @returns Resolved config path or null if not found
 */
export async function resolveConfigPath(projectRoot: string): Promise<string | null> {
  const localConfigPath = resolve(projectRoot, DEFAULT_CONFIG_PATH);

  // Check local config first
  if (existsSync(localConfigPath)) {
    return localConfigPath;
  }

  // Check if we're in a worktree
  const gitAdapter = new GitAdapter(projectRoot);
  const isWorktree = await gitAdapter.isWorktree();

  if (isWorktree) {
    const mainRoot = await gitAdapter.getMainRepositoryRoot();
    if (mainRoot) {
      const mainConfigPath = resolve(mainRoot, DEFAULT_CONFIG_PATH);
      if (existsSync(mainConfigPath)) {
        return mainConfigPath;
      }
    }
  }

  return null;
}

/**
 * Load configuration with worktree support (v4.1.0+)
 *
 * This function automatically detects worktree environments and loads
 * config from the main repository if the worktree doesn't have its own config.
 *
 * Priority:
 * 1. Local worktree config (.sqlew/config.toml in current directory)
 * 2. Main repository config (if in worktree)
 * 3. Default config
 *
 * @param projectRoot - Project root directory
 * @returns Loaded configuration
 */
export async function loadConfigWithWorktreeSupport(
  projectRoot: string = process.cwd()
): Promise<SqlewConfig> {
  const configPath = await resolveConfigPath(projectRoot);

  if (configPath) {
    // Load config from resolved path
    // Extract directory from config path to use as base
    const configDir = resolve(configPath, '..');
    const configFile = configPath.slice(configDir.length + 1);

    return loadConfigFile(configDir, configFile);
  }

  // No config found - use defaults
  return DEFAULT_CONFIG;
}

/**
 * Get the effective project root for configuration
 *
 * If in a worktree and config comes from main repo, returns main repo root.
 * Otherwise returns the current project root.
 *
 * @param projectRoot - Current project root directory
 * @returns Effective project root for configuration
 */
export async function getEffectiveConfigRoot(projectRoot: string): Promise<string> {
  const localConfigPath = resolve(projectRoot, DEFAULT_CONFIG_PATH);

  // If local config exists, use current project root
  if (existsSync(localConfigPath)) {
    return projectRoot;
  }

  // Check if we're in a worktree
  const gitAdapter = new GitAdapter(projectRoot);
  const isWorktree = await gitAdapter.isWorktree();

  if (isWorktree) {
    const mainRoot = await gitAdapter.getMainRepositoryRoot();
    if (mainRoot) {
      const mainConfigPath = resolve(mainRoot, DEFAULT_CONFIG_PATH);
      if (existsSync(mainConfigPath)) {
        return mainRoot;
      }
    }
  }

  // No config found - use current project root
  return projectRoot;
}
