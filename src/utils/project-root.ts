/**
 * Project Root Determination Utility
 *
 * Determines the project root directory with correct priority order:
 * 1. CLI --db-path argument (absolute path) → use dirname
 * 2. CLI --config-path argument (absolute path) → use dirname
 * 3. Config file database.path (absolute path) → use dirname
 * 4. Fallback to process.cwd()
 *
 * This prevents issues on Windows when launched from system directories
 * like C:\Windows\System32 (e.g., by MCP hosts like Claude Desktop or Junie AI).
 */

import * as path from 'path';

export interface ProjectRootOptions {
  /**
   * CLI argument: --db-path
   * If absolute, its directory becomes the project root
   */
  cliDbPath?: string;

  /**
   * CLI argument: --config-path
   * If absolute, its directory becomes the project root
   */
  cliConfigPath?: string;

  /**
   * Config file setting: database.path
   * If absolute, its directory becomes the project root
   */
  configDbPath?: string;
}

/**
 * Determines the project root directory based on available path information.
 *
 * Priority order (highest to lowest):
 * 1. CLI --db-path (absolute)
 * 2. CLI --config-path (absolute)
 * 3. Config database.path (absolute)
 * 4. process.cwd() (fallback)
 *
 * @param options - Path options from CLI arguments and config file
 * @returns Absolute path to project root directory (forward slashes for cross-platform consistency)
 *
 * @example
 * ```typescript
 * // User specified: npx sqlew --db-path=/absolute/path/to/.sqlew/db.db
 * const root = determineProjectRoot({ cliDbPath: '/absolute/path/to/.sqlew/db.db' });
 * // Returns: '/absolute/path/to/.sqlew' (not System32!)
 *
 * // User specified: npx sqlew --config-path=C:\Project\.sqlew\config.toml (Windows)
 * const root = determineProjectRoot({ cliConfigPath: 'C:\\Project\\.sqlew\\config.toml' });
 * // Returns: 'C:/Project/.sqlew' (normalized to forward slashes)
 *
 * // No arguments, fallback to execution directory
 * const root = determineProjectRoot({});
 * // Returns: process.cwd() (whatever directory sqlew was launched from)
 * ```
 */
export function determineProjectRoot(options: ProjectRootOptions = {}): string {
  // Priority 1: CLI --db-path argument (absolute path)
  if (options.cliDbPath && path.isAbsolute(options.cliDbPath)) {
    const projectRoot = path.dirname(options.cliDbPath);
    // Normalize to forward slashes for cross-platform consistency
    return projectRoot.replace(/\\/g, '/');
  }

  // Priority 2: CLI --config-path argument (absolute path)
  if (options.cliConfigPath && path.isAbsolute(options.cliConfigPath)) {
    const projectRoot = path.dirname(options.cliConfigPath);
    // Normalize to forward slashes for cross-platform consistency
    return projectRoot.replace(/\\/g, '/');
  }

  // Priority 3: Config file database.path (absolute path)
  if (options.configDbPath && path.isAbsolute(options.configDbPath)) {
    const projectRoot = path.dirname(options.configDbPath);
    // Normalize to forward slashes for cross-platform consistency
    return projectRoot.replace(/\\/g, '/');
  }

  // Priority 4: Fallback to process.cwd()
  // This is the current behavior, but now it's the LAST resort instead of the FIRST
  const cwd = process.cwd();
  // Normalize to forward slashes for cross-platform consistency
  return cwd.replace(/\\/g, '/');
}

/**
 * Helper function to check if a path looks like it's in a system directory
 * on Windows (e.g., C:\Windows\System32).
 *
 * Useful for warning users if sqlew is being launched from an unexpected location.
 *
 * @param dirPath - Directory path to check
 * @returns True if path appears to be a Windows system directory
 */
export function isSystemDirectory(dirPath: string): boolean {
  if (process.platform !== 'win32') {
    return false;
  }

  const normalizedPath = dirPath.toLowerCase().replace(/\\/g, '/');

  // Common Windows system directories
  const systemDirs = [
    '/windows/system32',
    '/windows/syswow64',
    '/windows',
    '/program files',
    '/program files (x86)',
  ];

  return systemDirs.some(sysDir => normalizedPath.includes(sysDir));
}
