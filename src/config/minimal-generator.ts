/**
 * Minimal configuration file generator
 * Creates .sqlew/config.toml with sensible defaults
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';

/**
 * Generate minimal config.toml content
 *
 * @returns TOML content string
 */
export function generateMinimalConfig(): string {
  return `# sqlew Minimal Configuration
# Generated automatically - edit as needed
# Documentation: https://github.com/sqlew-io/sqlew
#
# NOTE: As of v5.0.0, Skills/Hooks/Agents are managed by sqlew-plugin.
# Install with: /plugin marketplace add sqlew-io/sqlew-plugin && /plugin add sqlew

# ============================================================================
# Optional Settings (uncomment to customize)
# ============================================================================

# [autodelete]
# # Skip weekends when calculating retention periods
# ignore_weekend = false
# # Message retention period in hours
# message_hours = 24

# [debug]
# # Debug log file path (optional)
# # log_path = ".sqlew/debug.log"
# # Log level: "error", "warn", "info", "debug"
# # log_level = "info"
`;
}

/**
 * Create minimal config.toml if it doesn't exist
 *
 * @param projectRoot - Project root directory (defaults to cwd)
 * @returns true if created, false if already exists
 */
export function createMinimalConfigIfNotExists(projectRoot: string = process.cwd()): boolean {
  const configPath = join(projectRoot, '.sqlew', 'config.toml');

  // If config already exists, don't overwrite
  if (existsSync(configPath)) {
    return false;
  }

  // Create .sqlew directory if it doesn't exist
  const sqlewDir = dirname(configPath);
  if (!existsSync(sqlewDir)) {
    mkdirSync(sqlewDir, { recursive: true });
  }

  // Write minimal config
  const content = generateMinimalConfig();
  writeFileSync(configPath, content, 'utf-8');

  return true;
}

/**
 * Get the config file path
 *
 * @param projectRoot - Project root directory (defaults to cwd)
 * @returns Absolute path to config.toml
 */
export function getConfigPath(projectRoot: string = process.cwd()): string {
  return join(projectRoot, '.sqlew', 'config.toml');
}
