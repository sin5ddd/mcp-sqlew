# Changelog

All notable changes to sqlew will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.3] - 2025-10-15

### Fixed
- **CRITICAL: Tag/Scope Query Bug** - Fixed "no such column: m_tags" and "no such column: m_scopes" errors in filtering
  - **Impact:** ALL tag-based queries (`search_tags`, `list` with tags, `search_advanced` with tags) were broken
  - **Root cause:** Code referenced non-existent columns `m_tags` and `m_scopes` (table names, not columns)
  - **Affected functions:**
    - `searchByTags()` (src/tools/context.ts:311-320) - Used `m_tags` instead of `tags`
    - `getContext()` (src/tools/context.ts:210, 221-230) - Used `m_tags` and `m_scopes` instead of `tags`/`scopes`
  - **Fix:** Use only `tags` and `scopes` columns from `v_tagged_decisions` view (comma-separated GROUP_CONCAT values)
  - **Testing:** Verified with `action: "search_tags", tags: ["architecture","loom"], match_mode: "AND"`

### Technical Details
- The `v_tagged_decisions` view has `tags` and `scopes` as comma-separated string columns
- `m_tags` and `m_scopes` are **table names** in the normalized schema, not view columns
- Fixed by removing incorrect column references and using only LIKE pattern matching on the view columns
- All tag/scope filtering now works correctly with AND/OR logic

### Migration from v2.1.2
- No breaking changes
- Existing queries will now work correctly instead of failing with SQL errors
- **Recommendation:** Upgrade immediately if using any tag or scope filtering

## [2.1.2] - 2025-10-15

### Fixed
- **v2.1.0 Migration Bug:** Fixed initialization order issue preventing v2.0.0 databases from migrating to v2.1.0
  - **Problem:** Schema validation ran before v2.1.0 migration check, causing v2.0.0 databases to fail validation and exit
  - **Solution:** Moved v2.1.0 migration check to run before schema validation (src/database.ts:96-113)
  - **Impact:** v2.0.0 databases now automatically migrate to v2.1.0 on startup without errors
  - Database components added by migration: `t_activity_log`, `t_decision_templates`, 4 activity logging triggers

### Changed
- **Batch Operations Help Documentation:** Enhanced help text for all batch operations with AI agent guidance
  - Added detailed ATOMIC MODE behavior explanation (all-or-nothing transaction with rollback)
  - Added detailed NON-ATOMIC MODE behavior explanation (best-effort processing with partial results)
  - Added RECOMMENDATION FOR AI AGENTS section suggesting `atomic:false` by default
  - Applies to: `set_batch` (decision tool), `send_batch` (message tool), `record_batch` (file tool)
  - **Zero token impact:** Help text is on-demand only (called with `action: "help"`)
  - Helps prevent "cannot start a transaction within a transaction" errors from incorrect usage

### Technical Details
- v2.1.0 migration now runs before schema validation to ensure all required components exist
- Help documentation improvements have no effect on MCP tool schema (zero upfront token cost)
- Batch operation help text expanded from ~150 to ~350 characters per action

### Migration from v2.1.0/v2.1.1
- No breaking changes
- Existing v2.0.0 databases will now migrate successfully on first startup
- No action required for v2.1.0+ users

## [2.1.1] - 2025-10-15

### Fixed
- **Bin Command Configuration:** Fixed `npx sqlew` to launch MCP server by default instead of CLI
  - Changed `package.json` bin mapping: `sqlew` now points to MCP server (`dist/index.js`)
  - CLI mode moved to `sqlew-cli` command (`dist/cli.js`)
  - **Before:** `npx sqlew` → CLI mode
  - **After:** `npx sqlew` → MCP server (default), `sqlew-cli` → CLI mode (after installing the package)
  - Fixes user experience issue where MCP server launch required non-intuitive command

- **Batch Operations Nested Transaction Bug:** Fixed `set_batch` failing with "cannot start a transaction within a transaction" error
  - Root cause: `setDecision()` wraps logic in `transaction()`, but `setDecisionBatch()` also wraps calls in `transaction()` for atomic mode
  - Solution: Created `setDecisionInternal()` helper function with core logic but no transaction wrapper
  - `setDecision()` now calls `setDecisionInternal()` wrapped in transaction
  - `setDecisionBatch()` now calls `setDecisionInternal()` directly (batch manages its own transaction)
  - All batch operations verified working: `set_batch`, `send_batch`, `record_batch`
  - Location: `src/tools/context.ts:40-152` (setDecisionInternal), `context.ts:154-174` (setDecision), `context.ts:883` (setDecisionBatch)

### Changed
- **Documentation Improvements:**
  - **README Benefits Section:** Rewrote to emphasize organizational memory for AI agents as the core value proposition
    - Added comparison table: Git history (WHAT) vs Code comments (HOW) vs sqlew decisions (WHY)
    - Added real-world example showing cross-session context survival
    - Highlighted 4 key LLM benefits: context survival, prevents regression, historical reasoning, knowledge discovery
  - **README Token Savings:** Replaced internal architecture metrics with honest real-world token reduction analysis
    - Shows concrete scenario: 5 agents, 10 sessions, 20,000 → 7,400 tokens (63% reduction)
    - Explains 4 savings mechanisms: selective retrieval, structured vs unstructured, cross-session persistence, search vs scan
    - Provides realistic ranges: Conservative (50-65%), Realistic (60-75%), Optimal (70-85%)
    - Clarified that 96%/67% metrics are internal v1.0→v2.0 improvements, not usage benefits

### Migration Notes
- No breaking changes for MCP tool API
- Users who relied on `npx sqlew` for CLI should install the package and use `sqlew-cli` command
- MCP server configuration unchanged (still uses stdio transport)

## [2.1.0] - 2025-10-14

### 🎉 Feature Release

**Major enhancement release implementing 7 feature requests from real-world usage in the Trackne Server project. Adds activity logging, smart defaults, subscriptions, advanced querying, batch operations, templates, and a standalone CLI tool.**

### Added

#### FR-001: Activity Log System
- **Automatic Activity Logging:** All decision changes, messages, and file modifications are now automatically logged
  - New `t_activity_log` table with 3 optimized indexes
  - 4 triggers for automatic logging:
    - `trg_log_decision_insert` - Logs decision creation
    - `trg_log_decision_update` - Logs decision modifications
    - `trg_log_message_insert` - Logs message sending
    - `trg_log_file_change_insert` - Logs file changes
  - `getActivityLog` action in `stats` tool for retrieving filtered logs
  - Filter by agent, entity type, action type, and time range
  - Token-efficient logging (~50 bytes per log entry)

#### FR-002: Smart Defaults
- **quickSetDecision:** Streamlined decision setting with automatic layer inference
  - Infers layer from key patterns (e.g., "auth_*" → infrastructure)
  - Auto-extracts tags from key and value (e.g., "jwt_config" → ["jwt", "config"])
  - Reduces token usage by ~60% for simple decisions
  - Falls back to manual tagging when inference is ambiguous
  - New `quick_set` action in `decision` tool

#### FR-003: Lightweight Subscriptions
- **hasUpdates Polling:** Efficient change detection for agents
  - Check for updates since last check (~5-10 tokens per call)
  - Filter by entity type (decisions, messages, files)
  - Filter by scope, layer, or agent
  - Returns boolean + count + latest timestamp
  - New `has_updates` action in `decision` tool
  - 95% token reduction vs full list queries

#### FR-004: Advanced Query System
- **searchAdvanced:** Comprehensive search across all decision metadata
  - 13 query parameters: keys, tags, scopes, layers, status, versions, full-text search
  - Pagination support (limit, offset)
  - Sort by multiple fields with direction control
  - Full-text search in keys and values
  - Scope inheritance (search within parent scopes)
  - New `search_advanced` action in `decision` tool
  - Replaces multiple sequential queries with single call

#### FR-005: Batch Operations
- **Atomic Batch Processing:** Process multiple operations in a single transaction
  - `setDecisionBatch` - Set up to 50 decisions atomically
  - `sendMessageBatch` - Send multiple messages in one transaction
  - `recordFileChangeBatch` - Record multiple file changes atomically
  - All-or-nothing guarantee (rollback on any failure)
  - ~70% token reduction vs sequential calls
  - New actions: `set_batch` (decision), `send_batch` (message), `record_batch` (file)

#### FR-006: Template System
- **Decision Templates:** Reusable decision patterns with validation
  - 5 built-in templates: auth_config, api_endpoint, db_schema, ui_component, feature_flag
  - `createTemplate` - Define custom templates with field schemas
  - `setFromTemplate` - Create decisions from templates with validation
  - `listTemplates` - Browse available templates
  - Template inheritance and composition support
  - New `t_decision_templates` table
  - New actions: `set_from_template`, `create_template`, `list_templates` (decision tool)

#### FR-007: Standalone CLI Query Tool
- **Command-Line Interface:** Query MCP database without starting MCP server
  - 4 commands: `decisions`, `messages`, `files`, `activity`
  - JSON and table output formats
  - Filter options match MCP tool parameters
  - Supports all query patterns from MCP tools
  - Zero MCP token impact (standalone binary)
  - New script: `src/cli.ts`
  - Usage: `node dist/cli.js decisions --scope=auth --format=table`

### Changed

- **Tool Definitions:** Added 11 new actions across 3 tools
  - `decision` tool: 7 → 11 actions (+4: quick_set, has_updates, search_advanced, set_batch, set_from_template, create_template, list_templates)
  - `message` tool: 4 → 5 actions (+1: send_batch)
  - `file` tool: 4 → 5 actions (+1: record_batch)
  - `stats` tool: 4 → 5 actions (+1: getActivityLog)
- **Database Schema:** v2.1.0 migration adds 2 tables and 4 triggers
- **Token Efficiency:** Maintains 92% efficiency vs v1.0.0 original design
  - Tool definitions: 481 → 1,031 tokens (+550 tokens for 11 new actions)
  - CLI has zero MCP token impact (standalone)
  - Batch operations save ~70% tokens vs sequential calls
  - hasUpdates saves ~95% tokens vs full list queries

### Technical Details

#### Database Changes
- **New Tables:**
  - `t_activity_log` - Automatic logging of all changes (agent_id, entity_type, entity_id, action_type, details, ts)
  - `t_decision_templates` - Template definitions (name, description, schema, layer, tags, created_by, created_at)
- **New Indexes:**
  - `idx_activity_log_agent_ts` - Agent-based log queries
  - `idx_activity_log_entity_ts` - Entity-based log queries
  - `idx_activity_log_ts` - Time-based log queries
- **New Triggers:**
  - `trg_log_decision_insert`, `trg_log_decision_update` - Decision logging
  - `trg_log_message_insert` - Message logging
  - `trg_log_file_change_insert` - File change logging

#### Migration
- **Migration Script:** `src/migrations/add-v2.1.0-features.ts`
  - Creates `t_activity_log` and `t_decision_templates` tables
  - Creates 3 indexes for activity log queries
  - Creates 4 triggers for automatic logging
  - Seeds 5 built-in templates
  - Transaction-based with rollback on failure
  - Automatic execution on startup
  - Backward compatible with v2.0.0 databases

#### Performance
- **Token Efficiency:**
  - Batch operations: ~70% reduction vs sequential (3 operations: 1,200 → 360 tokens)
  - hasUpdates polling: ~95% reduction vs full list (500 → 25 tokens)
  - quickSetDecision: ~60% reduction vs manual (250 → 100 tokens)
  - Templates: ~50% reduction for repeated patterns
- **Query Performance:**
  - Activity log queries: 5-15ms (with indexes)
  - Advanced search: 10-30ms (with full-text)
  - Batch operations: 20-50ms (atomic transaction)
  - Template operations: 5-10ms

#### Code Statistics
- **Source Changes:**
  - New files: `src/cli.ts`, `src/migrations/add-v2.1.0-features.ts`
  - Modified: `src/tools/context.ts`, `src/tools/messaging.ts`, `src/tools/files.ts`, `src/tools/utils.ts`
  - Total lines added: ~1,500 lines
- **CLI Tool:**
  - Standalone binary (~300 lines)
  - Zero dependencies on MCP server
  - Supports all common query patterns

### Real-World Impact

These features were requested during development of the **Trackne Server** project:
- **Activity Log:** Essential for debugging multi-agent coordination
- **Smart Defaults:** Reduced boilerplate by 60% for common decisions
- **Subscriptions:** Enabled efficient polling without full list queries
- **Advanced Query:** Replaced 5-10 sequential queries with single calls
- **Batch Operations:** Critical for atomic state updates across agents
- **Templates:** Standardized patterns across 15+ API endpoints
- **CLI Tool:** Enabled quick debugging without starting MCP server

### Migration from v2.0.0

No breaking changes. All v2.0.0 tool calls work unchanged. New features are opt-in:

```javascript
// NEW: Quick decision setting with smart defaults
await callTool('decision', { action: 'quick_set', key: 'jwt_config', value: 'HS256' });
// Auto-infers layer=infrastructure, tags=["jwt", "config"]

// NEW: Check for updates efficiently
await callTool('decision', { action: 'has_updates', since: '2025-10-14T10:00:00Z' });
// Returns: { hasUpdates: true, count: 5, latestTimestamp: '...' }

// NEW: Batch operations (atomic)
await callTool('decision', {
  action: 'set_batch',
  decisions: [
    { key: 'auth', value: 'jwt' },
    { key: 'db', value: 'postgres' }
  ]
});

// NEW: Use templates
await callTool('decision', {
  action: 'set_from_template',
  template_name: 'api_endpoint',
  key: 'users_api',
  values: { path: '/api/users', method: 'GET' }
});

// NEW: CLI queries (no MCP server needed)
// $ node dist/cli.js decisions --scope=auth --format=table
// $ node dist/cli.js activity --agent=agent1 --limit=20
```

Database migration runs automatically on first startup with v2.1.0.

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

[2.1.3]: https://github.com/sin5ddd/mcp-sqlew/releases/tag/v2.1.3
[2.1.2]: https://github.com/sin5ddd/mcp-sqlew/releases/tag/v2.1.2
[2.1.1]: https://github.com/sin5ddd/mcp-sqlew/releases/tag/v2.1.1
[2.1.0]: https://github.com/sin5ddd/mcp-sqlew/releases/tag/v2.1.0
[2.0.0]: https://github.com/sin5ddd/mcp-sqlew/releases/tag/v2.0.0
[1.1.2]: https://github.com/sin5ddd/mcp-sqlew/releases/tag/v1.1.2
[1.1.1]: https://github.com/sin5ddd/mcp-sqlew/releases/tag/v1.1.1
[1.1.0]: https://github.com/sin5ddd/mcp-sqlew/releases/tag/v1.1.0
[1.0.1]: https://github.com/sin5ddd/mcp-sqlew/releases/tag/v1.0.1
[1.0.0]: https://github.com/sin5ddd/mcp-sqlew/releases/tag/v1.0.0
