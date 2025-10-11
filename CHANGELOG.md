# Changelog

All notable changes to sqlew will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.0.1]: https://github.com/sin5ddd/mcp-sqlew/releases/tag/v1.0.1
[1.0.0]: https://github.com/sin5ddd/mcp-sqlew/releases/tag/v1.0.0
