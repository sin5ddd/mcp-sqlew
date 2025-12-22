/**
 * Global configuration loader
 * Reads user-level configuration from ~/.local/share/sqlew/ (Linux/macOS) or %APPDATA%/sqlew/ (Windows)
 *
 * @since v4.1.0
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';
import { parse as parseTOML, stringify as stringifyTOML } from 'smol-toml';

// ============================================================================
// Types
// ============================================================================

/**
 * Hooks configuration for Claude Code integration
 */
export interface HooksConfig {
  /** Enable Git hooks installation (post-merge, post-rewrite) */
  git_hooks_enabled?: boolean;
}

/**
 * Database configuration for global settings
 */
export interface GlobalDatabaseConfig {
  /** Database type: 'sqlite' | 'postgres' | 'mysql' */
  type?: string;
  /** Database file path (for SQLite) */
  path?: string;
  /** Connection settings (for PostgreSQL/MySQL) */
  connection?: {
    host?: string;
    port?: number;
    database?: string;
  };
  /** Authentication settings */
  auth?: {
    type?: string;
    user?: string;
    password?: string;
    ssl?: {
      rejectUnauthorized?: boolean;
    };
  };
}

/**
 * Autodelete configuration
 */
export interface GlobalAutodeleteConfig {
  ignore_weekend?: boolean;
  message_hours?: number;
  file_history_days?: number;
}

/**
 * Tasks configuration
 */
export interface GlobalTasksConfig {
  auto_archive_done_days?: number;
  stale_hours_in_progress?: number;
  stale_hours_waiting_review?: number;
  auto_stale_enabled?: boolean;
}

/**
 * Debug configuration
 */
export interface GlobalDebugConfig {
  log_path?: string;
  log_level?: string;
}

/**
 * Agents configuration
 */
export interface GlobalAgentsConfig {
  scrum_master?: boolean;
  researcher?: boolean;
  architect?: boolean;
}

/**
 * Commands configuration
 */
export interface GlobalCommandsConfig {
  // Reserved for future use
}

/**
 * Global configuration structure
 * Stored in user's home directory, applies to all projects
 */
export interface GlobalConfig {
  /** Hooks settings */
  hooks?: HooksConfig;
  /** Database settings (for global install) */
  database?: GlobalDatabaseConfig;
  /** Autodelete settings */
  autodelete?: GlobalAutodeleteConfig;
  /** Tasks settings */
  tasks?: GlobalTasksConfig;
  /** Debug settings */
  debug?: GlobalDebugConfig;
  /** Agents settings */
  agents?: GlobalAgentsConfig;
  /** Commands settings */
  commands?: GlobalCommandsConfig;
}

/**
 * Default global configuration values
 */
export const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
  hooks: {
    git_hooks_enabled: true,
  },
};

// ============================================================================
// Path Resolution
// ============================================================================

/**
 * Get the global configuration directory path
 *
 * - Linux/macOS: ~/.local/share/sqlew/
 * - Windows: %APPDATA%/sqlew/
 *
 * @returns Absolute path to global config directory
 */
export function getGlobalConfigDir(): string {
  const home = homedir();

  if (process.platform === 'win32') {
    // Windows: Use APPDATA if available, otherwise fall back to home
    const appData = process.env.APPDATA || join(home, 'AppData', 'Roaming');
    return join(appData, 'sqlew');
  } else {
    // Linux/macOS: Use XDG_DATA_HOME if available, otherwise ~/.local/share
    const xdgDataHome = process.env.XDG_DATA_HOME || join(home, '.local', 'share');
    return join(xdgDataHome, 'sqlew');
  }
}

/**
 * Get the global configuration file path
 *
 * @returns Absolute path to global config.toml
 */
export function getGlobalConfigPath(): string {
  return join(getGlobalConfigDir(), 'config.toml');
}

/**
 * Get the session cache directory path
 * Used for tracking current plan per project
 *
 * @returns Absolute path to session cache directory
 */
export function getSessionCacheDir(): string {
  return join(getGlobalConfigDir(), 'session-cache');
}

// ============================================================================
// Configuration Loading
// ============================================================================

/**
 * Ensure global config directory exists
 */
export function ensureGlobalConfigDir(): void {
  const dir = getGlobalConfigDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Load global configuration from user's home directory
 *
 * Priority: File config -> Defaults
 *
 * @returns Parsed and merged global configuration
 */
export function loadGlobalConfig(): GlobalConfig {
  const configPath = getGlobalConfigPath();

  // If file doesn't exist, return defaults
  if (!existsSync(configPath)) {
    return DEFAULT_GLOBAL_CONFIG;
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const parsed = parseTOML(content) as GlobalConfig;

    // Merge with defaults (preserve all parsed fields)
    return {
      hooks: {
        ...DEFAULT_GLOBAL_CONFIG.hooks,
        ...parsed.hooks,
      },
      database: parsed.database,
      autodelete: parsed.autodelete,
      tasks: parsed.tasks,
      debug: parsed.debug,
      agents: parsed.agents,
      commands: parsed.commands,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Warning: Failed to load global config: ${configPath}`);
    console.warn(`  Error: ${message}`);
    console.warn(`  Using default configuration`);
    return DEFAULT_GLOBAL_CONFIG;
  }
}

/**
 * Save global configuration to user's home directory
 *
 * @param config - Configuration to save
 */
export function saveGlobalConfig(config: GlobalConfig): void {
  ensureGlobalConfigDir();
  const configPath = getGlobalConfigPath();

  const toml = stringifyTOML(config as Record<string, unknown>);
  writeFileSync(configPath, toml, 'utf-8');
}

/**
 * Check if Git hooks should be installed
 *
 * @returns true if git_hooks_enabled is true (default)
 */
export function isGitHooksEnabled(): boolean {
  const config = loadGlobalConfig();
  return config.hooks?.git_hooks_enabled ?? true;
}

// ============================================================================
// Session Cache
// ============================================================================

/**
 * Current plan tracking information
 */
export interface CurrentPlanInfo {
  /** Unique plan ID (UUID) */
  plan_id: string;
  /** Plan file name (e.g., "rippling-spinning-eagle.md") */
  plan_file: string;
  /** Plan file last updated timestamp (ISO 8601) */
  plan_updated_at: string;
  /** Whether decision has been recorded for this plan */
  recorded: boolean;
  /** Whether decision needs to be created in DB (lazy registration) */
  decision_pending?: boolean;
}

/**
 * Get the session cache file path for a project
 *
 * @param projectPath - Project root path
 * @returns Absolute path to session cache file
 */
export function getSessionCachePath(projectPath: string): string {
  ensureGlobalConfigDir();
  const cacheDir = getSessionCacheDir();
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true });
  }

  // Normalize path for cross-platform consistency
  // - Handle Git Bash/MSYS2 paths (/c/Users → C:\Users) on Windows
  // - Lowercase drive letter ensures consistent cache filename
  // - On macOS/Linux, resolve() is sufficient (no drive letters)
  let normalizedPath = projectPath;

  // Convert Git Bash/MSYS2 paths (/c/Users/...) to Windows paths (C:\Users\...)
  if (process.platform === 'win32' && /^\/[a-zA-Z]\//.test(normalizedPath)) {
    const driveLetter = normalizedPath[1].toUpperCase();
    normalizedPath = driveLetter + ':' + normalizedPath.slice(2).replace(/\//g, '\\');
  }

  // Resolve to absolute path
  normalizedPath = resolve(normalizedPath);

  // Lowercase drive letter for consistency
  if (process.platform === 'win32' && /^[A-Z]:/.test(normalizedPath)) {
    normalizedPath = normalizedPath[0].toLowerCase() + normalizedPath.slice(1);
  }

  // Create a safe filename from project path
  const safeName = normalizedPath
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .slice(-100); // Limit length

  return join(cacheDir, `${safeName}.json`);
}

/**
 * Load current plan info for a project
 *
 * @param projectPath - Project root path
 * @returns Current plan info or null if not found
 */
export function loadCurrentPlan(projectPath: string): CurrentPlanInfo | null {
  const cachePath = getSessionCachePath(projectPath);

  if (!existsSync(cachePath)) {
    return null;
  }

  try {
    const content = readFileSync(cachePath, 'utf-8');
    return JSON.parse(content) as CurrentPlanInfo;
  } catch {
    return null;
  }
}

/**
 * Save current plan info for a project
 *
 * @param projectPath - Project root path
 * @param info - Plan info to save
 */
export function saveCurrentPlan(projectPath: string, info: CurrentPlanInfo): void {
  const cachePath = getSessionCachePath(projectPath);
  writeFileSync(cachePath, JSON.stringify(info, null, 2), 'utf-8');
}

/**
 * Mark current plan as recorded (decision saved)
 *
 * @param projectPath - Project root path
 */
export function markPlanAsRecorded(projectPath: string): void {
  const info = loadCurrentPlan(projectPath);
  if (info) {
    info.recorded = true;
    saveCurrentPlan(projectPath, info);
  }
}
