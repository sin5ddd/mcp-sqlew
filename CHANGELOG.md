# Changelog

All notable changes to sqlew will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2025-10-11

### 🚨 BREAKING CHANGES

**This is a major release with breaking API changes. Migration required for all v1.x users.**

#### Tool Consolidation
- **20 individual tools** → **6 action-based tools** (70% reduction)
- All tools now use action-based routing with `action` parameter
- Tool names completely changed (see migration guide below)

#### Old vs New Tool Names

| Old (v1.x) | New (v2.0) | Actions |
|------------|------------|---------|
| `set_decision`, `get_decision`, `get_context`, `search_by_tags`, `search_by_layer`, `get_versions` | `decision` | `set`, `get`, `list`, `search_tags`, `search_layer`, `versions`, `help` |
| `send_message`, `get_messages`, `mark_read` | `message` | `send`, `get`, `mark_read`, `help` |
| `record_file_change`, `get_file_changes`, `check_file_lock` | `file` | `record`, `get`, `check_lock`, `help` |
| `add_constraint`, `get_constraints`, `deactivate_constraint` | `constraint` | `add`, `get`, `deactivate`, `help` |
| `get_layer_summary`, `get_stats`, `clear_old_data` | `stats` | `layer_summary`, `db_stats`, `clear`, `help` |
| `get_config`, `update_config` | `config` | `get`, `update`, `help` |

### Added

- **Help Actions:** All 6 tools now support `action: "help"` for comprehensive on-demand documentation
  - Returns detailed usage, parameters, and examples
  - Zero token cost until explicitly called
- **Action Hints:** Tool descriptions now include available actions for better discoverability
- **Improved Token Efficiency:** 96% token reduction vs traditional JSON approach
  - Tool definition tokens: ~12,848 → ~481 tokens (96.3% reduction)
  - MCP context usage: ~13,730 → ~4,482 tokens (67% reduction)

### Changed

- **API Surface:** Complete redesign to action-based routing
  - All tools require `action` parameter
  - Parameters consolidated into single input schema per tool
  - Nested switch statement routing for better maintainability
- **Tool Descriptions:** Simplified with action hints in parentheses
- **File Size:** Source reduced 27.4% (25,373 → 18,410 bytes) while adding help docs

### Technical Details

- Action-based routing with two-level switch statements
- Shared parameter schemas across actions within each tool
- Enum deduplication (layer, status, priority defined once per tool)
- On-demand documentation via help actions
- 100% backward compatible database schema (no DB changes)

### Migration Required

**v1.x users must update their tool calls:**

```javascript
// OLD (v1.x)
await callTool('set_decision', { key: 'auth', value: 'jwt' });
await callTool('get_messages', { unread_only: true });

// NEW (v2.0)
await callTool('decision', { action: 'set', key: 'auth', value: 'jwt' });
await callTool('message', { action: 'get', unread_only: true });
```

See `MIGRATION_v2.md` for complete migration guide.

### Performance

- 96% token reduction in tool definitions
- 67% reduction in MCP context consumption
- Same database performance (no schema changes)
- Same query response times

## [1.1.2] - 2025-10-11

### Fixed
- **Schema Validation Bug:** Fixed validation checking for old unprefixed table names instead of new prefixed names
  - Updated `requiredTables` to check for `m_*` and `t_*` prefixed names
  - Updated `requiredViews` to check for `v_*` prefixed names
  - Updated `requiredTriggers` to check for `trg_*` prefixed names
- **Migration Missing Views/Triggers:** After migration, views and triggers are now created automatically
  - Added `initializeSchema()` call after successful migration
  - Ensures v1.0.0 → v1.1.x migration creates all required database objects

### Technical Details
- Migration now runs schema initialization after table renaming to create views/triggers
- Schema validation properly detects v1.1.x databases with prefixed names
- Full backward compatibility maintained with v1.0.0 databases

## [1.1.1] - 2025-10-11

### Fixed
- **Migration Bug:** Fixed migration from v1.0.0 to v1.1.0 failing with "no such table: m_config" error
  - Migration now creates `m_config` table if it doesn't exist (new in v1.1.0, not present in v1.0.0)
  - Automatically inserts default config values during migration
  - Users who already migrated can manually fix by running: `sqlite3 <path-to-db> "CREATE TABLE IF NOT EXISTS m_config (key TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT OR IGNORE INTO m_config VALUES ('autodelete_ignore_weekend', '0'), ('autodelete_message_hours', '24'), ('autodelete_file_history_days', '7');"`

### Technical Details
- Added table creation step to migration script for tables new in v1.1.0
- Migration now handles both table renaming (v1.0.0 → v1.1.0) and new table creation
- 100% backward compatible with v1.0.0 databases

## [1.1.0] - 2025-10-11

### Added
- **Category-Based Table Prefixes:** All database objects now use prefixes for better SQL utility navigation
  - Master tables: `m_` prefix (8 tables)
  - Transaction tables: `t_` prefix (9 tables)
  - Views: `v_` prefix (6 views)
  - Triggers: `trg_` prefix (1 trigger)
- **Automatic Migration System:** Seamless upgrade from v1.0.x to v1.1.0
  - Detects old unprefixed schema automatically
  - Transaction-based migration with rollback on failure
  - Zero downtime - runs on startup
  - Detailed migration logging
- **Migration Script:** New `src/migrations/add-table-prefixes.ts` module
  - Safe table renaming in transaction
  - Backward compatibility check
  - Comprehensive error handling

### Changed
- Database schema structure updated to v1.1.0
- All SQL queries updated to use prefixed table names
- Schema initialization now supports both old and new table structures
- Documentation updated to reflect new table naming convention

### Technical Details
- 24 database objects renamed (8 master tables, 9 transaction tables, 6 views, 1 trigger)
- Migration preserves all existing data
- No breaking changes for MCP tool API
- Full backward compatibility with existing databases

## [1.0.1] - 2025-10-11

### Added
- **Database Schema Validation:** Comprehensive validation on startup for existing databases
  - Detects missing tables, views, and triggers
  - Verifies standard data integrity (layers, categories, tags)
  - Displays detailed error messages with actionable solutions
  - Prevents data corruption from incompatible schemas
  - Graceful exit with error code 1 on validation failure

### Fixed
- Database initialization now validates existing schema before proceeding
- Organized test files into `tests/` directory for better project structure

### Changed
- Updated `.gitignore` to properly handle test files (root vs tests directory)

## [1.0.0] - 2025-01-10

### Initial Release

First production release of sqlew - MCP server for efficient context sharing between Claude Code sub-agents.

### Added

#### Context Management (6 tools)
- `set_decision` - Set or update decisions with metadata (tags, layers, scopes, versions)
- `get_context` - Advanced filtering for decision retrieval
- `get_decision` - Retrieve specific decision by key
- `search_by_tags` - Tag-based search with AND/OR logic
- `get_versions` - Version history tracking
- `search_by_layer` - Layer-based decision filtering

#### Messaging System (3 tools)
- `send_message` - Agent-to-agent messaging with priority levels
- `get_messages` - Message retrieval with filtering (priority, unread status)
- `mark_read` - Mark messages as read

#### File Change Tracking (3 tools)
- `record_file_change` - Track file modifications with layer assignment
- `get_file_changes` - File change history retrieval
- `check_file_lock` - Concurrent edit prevention

#### Constraint Management (3 tools)
- `add_constraint` - Add constraints with priority and metadata
- `get_constraints` - Complex constraint filtering
- `deactivate_constraint` - Soft delete constraints

#### Utilities (3 tools)
- `get_layer_summary` - Per-layer aggregated statistics
- `clear_old_data` - Manual cleanup of old data
- `get_stats` - Comprehensive database statistics

### Features

- **Token Efficiency:** 72% reduction through ID-based normalization, integer enums, and pre-aggregated views
- **Metadata System:** Tags, layers, scopes, versions, and priorities for intelligent organization
- **SQLite Database:** Fast, reliable, offline-only operation with ACID guarantees
- **Automatic Cleanup:** Configurable retention policies (24h for messages, 7 days for file changes)
- **Version History:** Automatic tracking of decision evolution
- **Concurrent Access:** Support for multiple agents simultaneously
- **WAL Mode:** Write-Ahead Logging for improved concurrency

### Database Schema

- 7 Master tables for normalization (agents, files, context_keys, layers, tags, scopes, constraint_categories)
- 10 Transaction tables for core data
- 6 Token-efficient pre-aggregated views
- 9 Optimized indexes for common queries
- 3 Automatic triggers for cleanup and history

### Architecture

- **Standard Layers:** presentation, business, data, infrastructure, cross-cutting
- **Constraint Categories:** performance, architecture, security
- **Priority Levels:** low, medium, high, critical
- **Message Types:** decision, warning, request, info
- **Change Types:** created, modified, deleted
- **Status Values:** active, deprecated, draft

### Performance

- Query performance: 2-20ms for typical operations
- Concurrent access: Tested with 5 simultaneous agents
- Database size: ~140 bytes per decision (efficient storage)
- Token reduction: 72% compared to traditional JSON approach

### Documentation

- Comprehensive README with quick start guide
- Complete tool reference with examples
- Architecture documentation
- Schema reference
- Development guidelines

### Testing

- 100% tool coverage (all 18 tools verified)
- Comprehensive test suite
- MCP Inspector compatibility

### Technical Details

- **Runtime:** Node.js 18+
- **Language:** TypeScript 5.0+
- **Database:** better-sqlite3 ^11.0.0
- **MCP SDK:** @modelcontextprotocol/sdk (latest)
- **Transport:** stdio (standard MCP pattern)

### Code Statistics

- 3,424 lines of TypeScript
- 10 source files
- Full type safety
- Comprehensive error handling

[2.0.0]: https://github.com/sin5ddd/mcp-sqlew/releases/tag/v2.0.0
[1.1.2]: https://github.com/sin5ddd/mcp-sqlew/releases/tag/v1.1.2
[1.1.1]: https://github.com/sin5ddd/mcp-sqlew/releases/tag/v1.1.1
[1.1.0]: https://github.com/sin5ddd/mcp-sqlew/releases/tag/v1.1.0
[1.0.1]: https://github.com/sin5ddd/mcp-sqlew/releases/tag/v1.0.1
[1.0.0]: https://github.com/sin5ddd/mcp-sqlew/releases/tag/v1.0.0
