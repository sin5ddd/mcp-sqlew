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
# Full example: .sqlew/config.example.toml
# Documentation: https://github.com/sin5ddd/mcp-sqlew

# ============================================================================
# Specialized Agents Settings
# ============================================================================
[agents]
# Which specialized agents to install when running: npx sqlew-init-agents
# Set to false to skip agents you don't need (reduces token consumption)

# Scrum Master: Multi-agent coordination, task management, sprint planning
# Token cost: ~12KB per conversation when loaded in Claude Code
scrum_master = true

# Researcher: Query decisions, analyze patterns, investigate context
# Token cost: ~14KB per conversation when loaded in Claude Code
researcher = true

# Architect: Document decisions, enforce constraints, maintain standards
# Token cost: ~20KB per conversation when loaded in Claude Code
architect = true

# Example: Minimal installation (only Scrum Master for task management)
# [agents]
# scrum_master = true
# researcher = false
# architect = false

# ============================================================================
# Slash Commands Settings
# ============================================================================
[commands]
# Which slash commands to install on server startup
# Set to false to skip commands you don't need

# /sqlew: Unified natural language interface for decisions and tasks
# Usage: /sqlew <what you want to do>
# Examples:
#   /sqlew show remaining tasks
#   /sqlew search for auth decisions
#   /sqlew record that we use PostgreSQL 15
sqlew = true

# ============================================================================
# Other Settings (Optional - uncomment to customize)
# ============================================================================

# [autodelete]
# # Skip weekends when calculating retention periods
# ignore_weekend = false
# # Message retention period in hours
# message_hours = 24
# # File change history retention in days
# file_history_days = 7

# [tasks]
# # Auto-archive done tasks after N days
# auto_archive_done_days = 2
# # Stale detection threshold for in_progress tasks (hours)
# stale_hours_in_progress = 2
# # Stale detection threshold for waiting_review tasks (hours)
# stale_hours_waiting_review = 24
# # Enable automatic stale detection
# auto_stale_enabled = true

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
