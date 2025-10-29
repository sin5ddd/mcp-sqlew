# sqlew Configuration Guide

**Complete guide to configuring sqlew via config files, CLI arguments, and MCP tools**

## Table of Contents

1. [Overview](#overview)
2. [Configuration Priority](#configuration-priority)
3. [Config File Format](#config-file-format)
4. [Configuration Options](#configuration-options)
5. [Setup Instructions](#setup-instructions)
6. [Validation Rules](#validation-rules)
7. [Runtime Configuration](#runtime-configuration)
8. [Common Configurations](#common-configurations)
9. [Troubleshooting](#troubleshooting)

---

## Overview

sqlew supports flexible configuration through multiple mechanisms:

- **Config file** (`.sqlew/config.toml`) - Persistent project settings
- **CLI arguments** - Override config file at startup
- **MCP tools** - Runtime configuration updates
- **Database** (`m_config` table) - Stores active configuration

### Why Use Config Files?

**Benefits:**
- ✅ **Persistent settings** - No need to specify CLI args every time
- ✅ **Version control** - Commit config to share team settings
- ✅ **Documentation** - Self-documenting project requirements
- ✅ **Type safety** - TOML validation catches errors early
- ✅ **Separation of concerns** - Config separate from code

**When to use:**
- Multi-developer projects with shared settings
- Different settings per environment (dev/staging/prod)
- Complex retention policies (weekend-aware, long retention)
- Custom database locations

---

## Configuration Priority

sqlew applies configuration in this order (highest to lowest priority):

```
1. CLI Arguments (--autodelete-message-hours=48)
   ↓
2. Config File (.sqlew/config.toml)
   ↓
3. Database (m_config table)
   ↓
4. Code Defaults (DEFAULT_CONFIG in types.ts)
```

**Example:**
```toml
# .sqlew/config.toml
[autodelete]
message_hours = 24
```

```bash
# CLI overrides config file
npx sqlew --autodelete-message-hours=48

# Result: message_hours = 48 (CLI wins)
```

**After startup:**
- All settings stored in `m_config` table
- CLI and config file values merged into database
- MCP `config` tool can update settings at runtime

---

## Config File Format

### Location

**Default path:** `.sqlew/config.toml` (relative to project root)

**Custom path:** Specify via `--config-path` CLI argument
```bash
npx sqlew --config-path=config/custom.toml
```

### TOML Structure

Config file uses TOML format with three sections:

```toml
[database]      # Database location
[autodelete]    # Retention policies
[tasks]         # Task management
```

### Complete Example

```toml
# sqlew Configuration File
# Copy from .sqlew/config.toml.example and customize

# ============================================================================
# Database Settings
# ============================================================================
[database]
# Database file path (relative to project root or absolute)
# Default: ".sqlew/sqlew.db"
path = ".sqlew/custom.db"
# path = "/absolute/path/to/database.db"

# ============================================================================
# Auto-Deletion Settings
# ============================================================================
[autodelete]
# Skip weekends when calculating retention periods
# When true: 24 hours on Monday = previous Friday (skips Sat/Sun)
# When false: 24 hours = exactly 24 hours ago
# Default: false
ignore_weekend = false

# Message retention period in hours (1-720)
# Messages older than this are automatically deleted
# Default: 24 (1 day)
message_hours = 24

# File change history retention in days (1-365)
# File changes older than this are automatically deleted
# Default: 7 (1 week)
file_history_days = 7

# ============================================================================
# Task Management Settings
# ============================================================================
[tasks]
# Git-aware auto-complete (v3.4.0)
# Enable automatic completion when all watched files are committed
# Default: true
git_auto_complete_enabled = true

# Require all watched files to be committed for auto-complete
# When true: All watched files must be committed (strict)
# When false: At least one watched file committed (permissive)
# Default: true
require_all_files_committed = true

# Notification threshold for stale waiting_review tasks (hours, 1-720)
# Tasks stuck in 'waiting_review' longer than this → notification
# Note: v3.4.0 removed auto-revert to 'todo' behavior
# Default: 48 (2 days)
stale_review_notification_hours = 48

# Auto-archive done tasks after N days (1-365)
# Tasks in 'done' status older than this are moved to 'archived'
# Keeps task list clean while preserving history
# Default: 2 (48 hours)
auto_archive_done_days = 2

# Stale detection threshold for 'in_progress' tasks (hours, 1-168)
# Tasks stuck in 'in_progress' longer than this → move to 'waiting_review'
# Helps recover from interrupted AI sessions
# Default: 2 (2 hours)
stale_hours_in_progress = 2

# Stale detection threshold for 'waiting_review' tasks (hours, 1-720)
# DEPRECATED in v3.4.0 (kept for backward compatibility)
# No longer auto-reverts to 'todo' - use stale_review_notification_hours instead
# Default: 24 (1 day)
stale_hours_waiting_review = 24

# Enable automatic stale detection
# When true: Runs stale detection on startup and before task operations
# When false: Stale detection disabled (manual only)
# Default: true
auto_stale_enabled = true
```

---

## Configuration Options

### Database Settings

#### `database.path`

**Description:** Database file location

**Type:** String (file path)

**Default:** `.sqlew/sqlew.db`

**Examples:**
```toml
# Relative path (from project root)
[database]
path = ".sqlew/custom.db"

# Absolute path
path = "/var/data/sqlew/production.db"

# Per-environment config
path = ".sqlew/dev.db"    # development
path = ".sqlew/prod.db"   # production
```

**CLI Override:**
```bash
npx sqlew /path/to/database.db
```

---

### Auto-Deletion Settings

#### `autodelete.ignore_weekend`

**Description:** Skip weekends when calculating retention periods

**Type:** Boolean

**Default:** `false`

**Behavior:**
- `false`: Standard time-based (24h = 24 hours ago)
- `true`: Skip weekends (24h on Monday = Friday 24h ago)

**Use cases:**
- Development teams (no work on weekends)
- Business-hours-only projects
- Preserve Friday context through Monday

**Examples:**
```toml
[autodelete]
# Preserve weekend context
ignore_weekend = true
message_hours = 24

# Result on Monday 9am:
# - false: Deletes messages before Sunday 9am
# - true:  Deletes messages before Friday 9am (skips Sat/Sun)
```

**CLI Override:**
```bash
npx sqlew --autodelete-ignore-weekend
npx sqlew --autodelete-ignore-weekend=true
```

#### `autodelete.message_hours`

**Description:** Message retention period in hours

**Type:** Integer (1-720)

**Default:** `24` (1 day)

**Range:** 1 hour to 720 hours (30 days)

**Examples:**
```toml
[autodelete]
message_hours = 1     # Aggressive cleanup (dev)
message_hours = 24    # Default (1 day)
message_hours = 168   # 1 week
message_hours = 720   # 30 days (max)
```

**CLI Override:**
```bash
npx sqlew --autodelete-message-hours=48
```

#### `autodelete.file_history_days`

**Description:** File change history retention in days

**Type:** Integer (1-365)

**Default:** `7` (1 week)

**Range:** 1 day to 365 days (1 year)

**Examples:**
```toml
[autodelete]
file_history_days = 1    # Aggressive cleanup (dev)
file_history_days = 7    # Default (1 week)
file_history_days = 30   # 1 month
file_history_days = 365  # 1 year (max)
```

**CLI Override:**
```bash
npx sqlew --autodelete-file-history-days=30
```

---

### Task Management Settings

#### `tasks.git_auto_complete_enabled`

**Description:** Enable git-aware auto-complete for waiting_review tasks

**Type:** Boolean

**Default:** `true`

**Behavior:**
- `true`: Tasks in `waiting_review` auto-complete to `done` when all watched files are committed to git
- `false`: Manual completion required (no git integration)

**Use cases:**
- Auto-completion based on git commits
- Ensure work is properly tracked in version control
- Reduce manual task management overhead

**Examples:**
```toml
[tasks]
# Enable git-aware auto-complete (default)
git_auto_complete_enabled = true

# Disable git-aware auto-complete
git_auto_complete_enabled = false
```

**No CLI override** (use MCP `config` tool)

#### `tasks.require_all_files_committed`

**Description:** Require all watched files to be committed before auto-complete

**Type:** Boolean

**Default:** `true`

**Behavior:**
- `true`: All watched files must be committed (strict mode)
- `false`: At least one watched file committed triggers auto-complete (permissive mode)

**Use cases:**
- Strict mode: Ensure complete work is committed
- Permissive mode: Allow partial commits to trigger completion

**Examples:**
```toml
[tasks]
# Require all watched files committed (strict - default)
require_all_files_committed = true

# Allow partial commits (permissive)
require_all_files_committed = false
```

**No CLI override** (use MCP `config` tool)

#### `tasks.stale_review_notification_hours`

**Description:** Notification threshold for stale waiting_review tasks (hours)

**Type:** Integer (1-720)

**Default:** `48` (2 days)

**Range:** 1 hour to 720 hours (30 days)

**Behavior:**
- Tasks in `waiting_review` > threshold → generate notification
- Does NOT auto-transition (removed in v3.4.0)
- Helps identify tasks stuck in review

**Examples:**
```toml
[tasks]
stale_review_notification_hours = 24    # Notify after 1 day
stale_review_notification_hours = 48    # Default (2 days)
stale_review_notification_hours = 72    # Notify after 3 days
stale_review_notification_hours = 168   # Notify after 1 week
```

**No CLI override** (use MCP `config` tool)

#### `tasks.auto_archive_done_days`

**Description:** Auto-archive done tasks after N days

**Type:** Integer (1-365)

**Default:** `2` (48 hours)

**Range:** 1 day to 365 days

**Behavior:**
- Tasks in `done` status older than threshold → `archived`
- Keeps task board clean while preserving history
- Archived tasks still queryable via `task` tool

**Examples:**
```toml
[tasks]
auto_archive_done_days = 1    # Quick cleanup (demo/dev)
auto_archive_done_days = 2    # Default (48 hours)
auto_archive_done_days = 7    # 1 week (production)
auto_archive_done_days = 30   # Long retention
```

**No CLI override** (use MCP `config` tool)

#### `tasks.stale_hours_in_progress`

**Description:** Stale detection threshold for `in_progress` tasks

**Type:** Integer (1-168)

**Default:** `2` (2 hours)

**Range:** 1 hour to 168 hours (7 days)

**Behavior:**
- Tasks in `in_progress` > threshold → `waiting_review`
- Helps recover from interrupted AI sessions
- Runs on startup and before task operations

**Examples:**
```toml
[tasks]
stale_hours_in_progress = 1    # Aggressive (1 hour)
stale_hours_in_progress = 2    # Default (2 hours)
stale_hours_in_progress = 4    # Relaxed (4 hours)
stale_hours_in_progress = 24   # Very relaxed (1 day)
```

**No CLI override** (use MCP `config` tool)

#### `tasks.stale_hours_waiting_review`

**Description:** Stale detection threshold for `waiting_review` tasks

**Type:** Integer (1-720)

**Default:** `24` (1 day)

**Range:** 1 hour to 720 hours (30 days)

**Behavior:**
- Tasks in `waiting_review` > threshold → `todo`
- Prevents abandoned reviews from blocking workflow
- Runs on startup and before task operations

**Examples:**
```toml
[tasks]
stale_hours_waiting_review = 8     # Aggressive (8 hours)
stale_hours_waiting_review = 24    # Default (1 day)
stale_hours_waiting_review = 48    # Relaxed (2 days)
stale_hours_waiting_review = 168   # Very relaxed (1 week)
```

**No CLI override** (use MCP `config` tool)

#### `tasks.auto_stale_enabled`

**Description:** Enable automatic stale detection

**Type:** Boolean

**Default:** `true`

**Behavior:**
- `true`: Runs stale detection on startup and before task operations
- `false`: Stale detection disabled (manual only via MCP tool)

**Examples:**
```toml
[tasks]
# Enable auto-stale (default)
auto_stale_enabled = true

# Disable auto-stale (manual control only)
auto_stale_enabled = false
```

**No CLI override** (use MCP `config` tool)

---

## Setup Instructions

### 1. Copy Example Config

```bash
# Navigate to project root
cd /path/to/your/project

# Copy example config
cp .sqlew/config.toml.example .sqlew/config.toml
```

### 2. Customize Settings

Edit `.sqlew/config.toml`:

```toml
[database]
# Use custom database location
path = ".sqlew/my-project.db"

[autodelete]
# Weekend-aware cleanup for development team
ignore_weekend = true
message_hours = 48
file_history_days = 14

[tasks]
# Quick archival for fast-paced projects
auto_archive_done_days = 1
stale_hours_in_progress = 1
stale_hours_waiting_review = 12
```

### 3. Version Control (Optional)

```bash
# Add to git (share team settings)
git add .sqlew/config.toml
git commit -m "Add sqlew configuration"

# Or ignore (per-developer settings)
echo ".sqlew/config.toml" >> .gitignore
```

### 4. Start sqlew

```bash
# Uses .sqlew/config.toml automatically
npx sqlew

# Or specify custom config path
npx sqlew --config-path=config/custom.toml
```

### 5. Verify Configuration

Use MCP `config` tool:

```javascript
// Get all configuration
{
  action: "get"
}

// Returns current settings from m_config table
```

---

## Validation Rules

sqlew validates all configuration values on startup:

### Auto-Deletion Rules

| Setting | Min | Max | Default |
|---------|-----|-----|---------|
| `message_hours` | 1 | 720 | 24 |
| `file_history_days` | 1 | 365 | 7 |

**Validation errors:**
```toml
[autodelete]
message_hours = 0      # ❌ Error: must be >= 1
message_hours = 1000   # ❌ Error: must be <= 720
```

### Task Management Rules

| Setting | Min | Max | Default |
|---------|-----|-----|---------|
| `auto_archive_done_days` | 1 | 365 | 2 |
| `stale_hours_in_progress` | 1 | 168 | 2 |
| `stale_hours_waiting_review` | 1 | 720 | 24 |

**Validation errors:**
```toml
[tasks]
stale_hours_in_progress = 0     # ❌ Error: must be >= 1
stale_hours_in_progress = 200   # ❌ Error: must be <= 168
```

### Error Handling

**On validation failure:**
1. sqlew prints warnings to console
2. Invalid values ignored
3. Falls back to defaults
4. Server continues to start

**Example output:**
```
⚠️  Configuration validation warnings:
   - autodelete.message_hours must be between 1 and 720 (30 days)
   - tasks.stale_hours_in_progress must be between 1 and 168 (7 days)
   Using default configuration
```

---

## Runtime Configuration

### ⚠️ Config Tool Removed (dev branch)

**DEPRECATED**: The `config` MCP tool has been removed in the dev branch.

**Why removed:**
- Messaging system deprecated (primary use case eliminated)
- File-based configuration (`.sqlew/config.toml`) is clearer and more maintainable
- Runtime updates were confusing (changes lost on restart unless manually synced to file)
- Configuration drift between `m_config` table and config file

**Migration path:**
- ✅ **Use `.sqlew/config.toml`** for all configuration (persistent, version-controlled)
- ✅ **Use CLI arguments** for one-time overrides (`--autodelete-message-hours=48`)
- ❌ **Do NOT use** `config` tool (removed in dev, will error)

### File-Based Configuration (Recommended)

Edit `.sqlew/config.toml` directly:

```toml
[database]
path = ".sqlew/custom.db"

[autodelete]
ignore_weekend = true
message_hours = 48  # Messaging system deprecated, but config preserved for backward compatibility
```

**Benefits:**
1. **Version control** - Commit config to git, share with team
2. **No drift** - Single source of truth (no table vs file conflicts)
3. **Clear documentation** - Config file documents project requirements
4. **Type safety** - TOML validation catches errors at startup

### Configuration Persistence (Legacy - v3.6.5 and earlier)

**How it worked (DEPRECATED):**
1. Config file loaded on startup
2. Values merged with CLI arguments
3. Final config written to `m_config` table
4. MCP `config` tool updates `m_config` table
5. Changes persist until next startup (then config file reloads)

**Migration to file-based:**
1. Remove all `config` tool calls from workflows
2. Update `.sqlew/config.toml` directly
3. Restart MCP server to apply changes

---

## Common Configurations

### Development (Aggressive Cleanup)

**Use case:** Fast iteration, minimal data retention

```toml
[autodelete]
ignore_weekend = false
message_hours = 1
file_history_days = 1

[tasks]
auto_archive_done_days = 1
stale_hours_in_progress = 1
stale_hours_waiting_review = 8
auto_stale_enabled = true
```

### Production (Conservative Retention)

**Use case:** Long-term projects, preserve history

```toml
[autodelete]
ignore_weekend = false
message_hours = 168     # 7 days
file_history_days = 30

[tasks]
auto_archive_done_days = 7
stale_hours_in_progress = 4
stale_hours_waiting_review = 48
auto_stale_enabled = true
```

### Weekend-Aware Workflow

**Use case:** Developer teams (no weekend work)

```toml
[autodelete]
ignore_weekend = true   # Skip weekends
message_hours = 48
file_history_days = 14

[tasks]
auto_archive_done_days = 2
stale_hours_in_progress = 2
stale_hours_waiting_review = 24
auto_stale_enabled = true
```

### Manual Control (No Auto-Cleanup)

**Use case:** Full control, manual cleanup only

```toml
[autodelete]
ignore_weekend = false
message_hours = 720     # Max retention (30 days)
file_history_days = 365 # Max retention (1 year)

[tasks]
auto_archive_done_days = 365
stale_hours_in_progress = 168    # 7 days (max)
stale_hours_waiting_review = 720 # 30 days (max)
auto_stale_enabled = false       # Disable auto-stale
```

### Multi-Environment Setup

**Development:**
```toml
# .sqlew/dev.toml
[database]
path = ".sqlew/dev.db"

[autodelete]
message_hours = 1
file_history_days = 1
```

**Production:**
```toml
# .sqlew/prod.toml
[database]
path = ".sqlew/prod.db"

[autodelete]
message_hours = 168
file_history_days = 30
```

**Usage:**
```bash
# Development
npx sqlew --config-path=.sqlew/dev.toml

# Production
npx sqlew --config-path=.sqlew/prod.toml
```

---

## Troubleshooting

### Config File Not Found

**Symptom:**
```
⚠️  Failed to load config file: .sqlew/config.toml
   Error: ENOENT: no such file or directory
   Using default configuration
```

**Solution:**
1. Config file is optional - this is not an error
2. Create config file if needed:
   ```bash
   cp .sqlew/config.toml.example .sqlew/config.toml
   ```

### Invalid TOML Syntax

**Symptom:**
```
⚠️  Failed to load config file: .sqlew/config.toml
   Error: Invalid TOML: Unexpected character at line 5
   Using default configuration
```

**Solution:**
1. Validate TOML syntax: https://www.toml-lint.com/
2. Common errors:
   ```toml
   # ❌ Wrong: Missing quotes for strings with spaces
   path = /path with spaces/db.db

   # ✅ Correct: Quote strings with spaces
   path = "/path with spaces/db.db"

   # ❌ Wrong: Invalid boolean
   ignore_weekend = yes

   # ✅ Correct: Use true/false
   ignore_weekend = true
   ```

### Values Not Applied

**Symptom:** Changed config file but values not reflected

**Solution:**
1. **Check priority:** CLI args override config file
   ```bash
   # CLI wins over config file
   npx sqlew --autodelete-message-hours=24
   ```

2. **Verify config loading:**
   ```bash
   # Check console output on startup
   ✓ Loaded 7 config values from file
   ```

3. **Query active config:**
   ```javascript
   {action: "get"}  // via config tool
   ```

### Validation Warnings

**Symptom:**
```
⚠️  Configuration validation warnings:
   - autodelete.message_hours must be between 1 and 720 (30 days)
```

**Solution:**
1. Check validation rules (see [Validation Rules](#validation-rules))
2. Fix invalid values in config file
3. Restart sqlew

### Database Path Issues

**Symptom:**
```
Error: SQLITE_CANTOPEN: unable to open database file
```

**Solution:**
1. **Check path syntax:**
   ```toml
   # ❌ Wrong: Relative to config file location
   path = "sqlew.db"

   # ✅ Correct: Relative to project root
   path = ".sqlew/sqlew.db"
   ```

2. **Use absolute paths for clarity:**
   ```toml
   path = "/absolute/path/to/database.db"
   ```

3. **Ensure directory exists:**
   - sqlew auto-creates parent directory
   - Check file permissions

### Weekend-Aware Not Working

**Symptom:** Weekend dates not skipped in retention

**Solution:**
1. **Check configuration:**
   ```toml
   [autodelete]
   ignore_weekend = true  # Must be true, not "true"
   ```

2. **Verify via MCP tool:**
   ```javascript
   {action: "get"}
   // Check: autodelete_ignore_weekend = "1" (true)
   ```

3. **Test behavior:**
   - Monday cleanup should reference Friday
   - Not Saturday/Sunday

---

## Related Documentation

- **[Architecture](ARCHITECTURE.md)** - Database schema and `m_config` table structure
- **[Tool Reference](TOOL_REFERENCE.md)** - MCP `config` tool usage
- **[Best Practices](BEST_PRACTICES.md)** - Configuration recommendations

---

## Example Files

### Minimal Configuration

```toml
# .sqlew/config.toml (minimal)
[autodelete]
ignore_weekend = true
message_hours = 48
```

### Full Configuration with Comments

See `.sqlew/config.toml.example` in project root for complete annotated example.

---

**Last Updated:** v3.4.1 (2025-10-22)
