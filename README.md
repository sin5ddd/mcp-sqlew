# sqlew

[![npm version](https://img.shields.io/npm/v/sqlew.svg)](https://www.npmjs.com/package/sqlew)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**sqlew** (SQL Efficient Workflow) is a Model Context Protocol (MCP) server for efficient context sharing between Claude Code sub-agents. Achieve **96% token reduction** through action-based tools while managing structured data through a metadata-driven SQLite database.

## ⚠️ Version 2.0.0 - Breaking Changes

**v2.0.0 introduces action-based tools that consolidate the API from 20 tools to 6 tools.** This is a breaking change in the MCP tool API only.

**Database Compatibility:** ✅ **100% compatible** - v2.0 uses the same database schema as v1.x. No data migration needed.

**Migration Required:** Only for code that calls MCP tools - see [MIGRATION_v2.md](MIGRATION_v2.md) for upgrade guide.

## Why sqlew?

When coordinating multiple Claude Code agents on a complex project, context sharing becomes critical. Traditional JSON-based approaches consume massive amounts of tokens. sqlew solves this with:

- **96% Token Reduction:** Action-based API eliminates tool duplication (12,848 → 481 tokens)
- **67% MCP Context Reduction:** From ~13,730 to ~4,482 tokens in MCP server definitions
- **Structured Metadata:** Tags, layers, scopes, versions, and priorities for intelligent organization
- **Fast & Reliable:** SQLite-backed with ACID guarantees and automatic cleanup
- **6 Action-Based Tools:** Comprehensive API for decisions, messaging, file tracking, constraints, config, and stats
- **Help Actions:** On-demand documentation with zero token cost until called

## Features

- **Context Management:** Record and retrieve decisions with advanced filtering (tags, layers, scopes, versions)
- **Agent Messaging:** Priority-based messaging system with broadcast support
- **File Change Tracking:** Layer-based file organization with lock detection
- **Constraint Management:** Track performance, architecture, and security constraints
- **Token Efficient:** Pre-aggregated views and integer enums minimize token consumption
- **Weekend-Aware Auto-Cleanup:** Smart retention policies that pause during weekends
- **Configurable Retention:** Adjust cleanup periods via CLI args or MCP tools
- **Version History:** Track decision evolution over time
- **Concurrent Access:** Supports multiple agents simultaneously

## Installation

```bash
npm install sqlew
```

## Quick Start

### Add to Claude Desktop

Add sqlew to your Claude Desktop configuration (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "sqlew": {
      "command": "npx",
      "args": ["sqlew"]
    }
  }
}
```

Or with a custom database path:

```json
{
  "mcpServers": {
    "sqlew": {
      "command": "npx",
      "args": ["sqlew", "/path/to/database.db"]
    }
  }
}
```

Or with weekend-aware auto-deletion enabled:

```json
{
  "mcpServers": {
    "sqlew": {
      "command": "npx",
      "args": [
        "sqlew",
        "--autodelete-ignore-weekend",
        "--autodelete-message-hours=48",
        "--autodelete-file-history-days=10"
      ]
    }
  }
}
```

### Using with MCP Inspector

Test all tools interactively:

```bash
npx @modelcontextprotocol/inspector npx sqlew
```

### Database Location

Default: `.sqlew/sqlew.db` (created in current directory)

## Available Tools (v2.0.0)

All tools now use action-based routing. Call any tool with `action: "help"` for comprehensive documentation.

### `decision` - Context Management

Manage decisions with metadata (tags, layers, versions, scopes).

**Actions:** `set`, `get`, `list`, `search_tags`, `search_layer`, `versions`, `help`

```typescript
// Set a decision
{
  action: "set",
  key: "auth_method",
  value: "JWT",
  agent: "auth-agent",
  layer: "business",
  tags: ["authentication", "security"],
  scopes: ["user-service"],
  version: "1.0.0",
  status: "active"
}

// Get decision by key
{
  action: "get",
  key: "auth_method"
}

// List with filtering
{
  action: "list",
  status: "active",
  layer: "business"
}

// Search by tags
{
  action: "search_tags",
  tags: ["authentication", "security"],
  tag_match: "AND"
}

// Get version history
{
  action: "versions",
  key: "auth_method"
}

// Get help
{ action: "help" }
```

### `message` - Agent Messaging

Send and retrieve messages between agents with priority levels.

**Actions:** `send`, `get`, `mark_read`, `help`

```typescript
// Send message
{
  action: "send",
  from_agent: "agent1",
  to_agent: "agent2",
  msg_type: "warning",
  message: "File locked",
  priority: "high",
  payload: { file: "/src/auth.ts" }
}

// Get messages
{
  action: "get",
  unread_only: true,
  priority_filter: "high"
}

// Mark as read
{
  action: "mark_read",
  message_ids: [1, 2, 3]
}
```

### `file` - File Change Tracking

Track file modifications with layer assignment and lock detection.

**Actions:** `record`, `get`, `check_lock`, `help`

```typescript
// Record file change
{
  action: "record",
  file_path: "/src/auth.ts",
  agent_name: "auth-agent",
  change_type: "modified",
  layer: "business",
  description: "Updated JWT validation"
}

// Get file changes
{
  action: "get",
  since: "2025-01-10T10:00:00Z",
  layer: "business"
}

// Check file lock
{
  action: "check_lock",
  file_path: "/src/auth.ts",
  lock_duration: 300
}
```

### `constraint` - Constraint Management

Manage architectural, performance, and security constraints.

**Actions:** `add`, `get`, `deactivate`, `help`

```typescript
// Add constraint
{
  action: "add",
  category: "performance",
  constraint_text: "Response time < 200ms",
  priority: "high",
  layer: "business",
  tags: ["api", "performance"]
}

// Get constraints
{
  action: "get",
  category: "performance",
  active_only: true
}

// Deactivate constraint
{
  action: "deactivate",
  constraint_id: 42
}
```

### `stats` - Statistics & Utilities

Get database statistics and manage data cleanup.

**Actions:** `layer_summary`, `db_stats`, `clear`, `help`

```typescript
// Layer summary
{ action: "layer_summary" }

// Database stats
{ action: "db_stats" }

// Clear old data (weekend-aware)
{
  action: "clear",
  messages_older_than_hours: 48,
  file_changes_older_than_days: 14
}
```

### `config` - Configuration

Manage auto-deletion and retention settings.

**Actions:** `get`, `update`, `help`

```typescript
// Get config
{ action: "get" }

// Update config
{
  action: "update",
  ignoreWeekend: true,
  messageRetentionHours: 48,
  fileHistoryRetentionDays: 10
}
```

## Database Schema

sqlew uses a normalized SQLite schema (v1.3.0) optimized for token efficiency with category-based table prefixes:

**Master Tables (m_ prefix):** m_agents, m_files, m_context_keys, m_layers, m_tags, m_scopes, m_constraint_categories, m_config

**Transaction Tables (t_ prefix):** t_decisions, t_decisions_numeric, t_decision_history, t_decision_tags, t_decision_scopes, t_agent_messages, t_file_changes, t_constraints, t_constraint_tags

**Token-Efficient Views (v_ prefix):** v_tagged_decisions, v_active_context, v_layer_summary, v_unread_messages_by_priority, v_recent_file_changes, v_tagged_constraints

**Triggers (trg_ prefix):** trg_record_decision_history

### Automatic Migration

When upgrading from v1.2.0 to v1.3.0, the server automatically migrates your database to use the new prefixed table names. The migration is safe and runs in a transaction - if it fails, the database is unchanged.

## Token Efficiency

sqlew achieves **96% token reduction** through:

1. **Action-Based Tools (v2.0):** Consolidates 20 tools → 6 tools, eliminating duplication
2. **ID-Based Normalization:** Strings stored once, referenced by integer IDs
3. **Integer Enums:** Status, priority, message types use integers (1-4) instead of strings
4. **Pre-Aggregated Views:** Common queries use pre-computed results
5. **Type-Based Tables:** Separate storage for numeric vs string values
6. **Automatic Cleanup:** Prevents database bloat

### v2.0.0 Token Savings

- **Tool Definitions:** 12,848 → 481 tokens (96.3% reduction)
- **MCP Context Usage:** ~13,730 → ~4,482 tokens (67% reduction)

### Example Comparison

**Traditional JSON (1000 tokens):**
```json
{
  "key": "auth_method",
  "value": "JWT",
  "agent": "auth-agent",
  "layer": "business",
  "status": "active",
  "tags": ["authentication", "security"],
  "scopes": ["user-service"],
  "updated": "2025-01-10T12:00:00Z"
}
```

**sqlew Response (280 tokens):**
```json
{
  "key_id": 42,
  "value": "JWT",
  "agent_id": 5,
  "layer_id": 2,
  "status": 1,
  "tag_ids": [1,4],
  "scope_ids": [3],
  "ts": 1736510400
}
```

**Token Savings: 720 tokens (72%)**

## Architecture Layers

sqlew organizes code by standard architecture layers:

- **presentation:** UI, API endpoints, views
- **business:** Business logic, services, use cases
- **data:** Repositories, database access
- **infrastructure:** Configuration, external services
- **cross-cutting:** Logging, security, utilities

## Development

### Building from Source

```bash
git clone https://github.com/sin5ddd/mcp-sqlew.git
cd mcp-sqlew
npm install
npm run build
```

### Running Locally

```bash
npm start
```

### Testing

```bash
# Use MCP Inspector to test all tools
npm run inspector

# Or test individual tools via CLI
npx @modelcontextprotocol/inspector npx sqlew
```

### Project Structure

```
sqlew/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── database.ts           # Database initialization
│   ├── schema.ts             # Schema management
│   ├── types.ts              # TypeScript types
│   ├── constants.ts          # Constants & enums
│   └── tools/
│       ├── context.ts        # Context management
│       ├── messaging.ts      # Messaging system
│       ├── files.ts          # File tracking
│       ├── constraints.ts    # Constraint management
│       └── utils.ts          # Utilities
├── dist/                     # Compiled JavaScript
└── package.json
```

## Configuration

### Weekend-Aware Auto-Deletion

sqlew supports weekend-aware retention policies that intelligently handle 3-day weekends and holidays:

**How it works:**
- When `ignoreWeekend: false` (default): Standard time-based deletion
- When `ignoreWeekend: true`: Weekends (Sat/Sun) don't count toward retention period

**Example:** With 24-hour retention and `ignoreWeekend: true`:
- Message sent Friday 3pm → Deleted Monday 3pm (skips Sat/Sun)
- Message sent Monday 10am → Deleted Tuesday 10am (no weekend in between)

**Configuration Methods:**

1. **CLI Arguments (at startup):**
```bash
npx sqlew \
  --autodelete-ignore-weekend \
  --autodelete-message-hours=48 \
  --autodelete-file-history-days=10
```

2. **MCP Tools (runtime):**
```typescript
// Get current config
get_config()

// Update config
update_config({
  ignoreWeekend: true,
  messageRetentionHours: 72,
  fileHistoryRetentionDays: 14
})
```

3. **Database (persisted):**
Config is stored in the database and travels with the DB file.

### Default Retention Periods

- **Messages:** 24 hours (weekend-aware optional)
- **File Changes:** 7 days (weekend-aware optional)
- **Decisions:** Permanent (version history preserved)
- **Constraints:** Permanent (soft delete only)

### Environment Variables

- `DEBUG_SQL`: Set to enable SQL query logging

## License

MIT - see [LICENSE](LICENSE) file for details

## Contributing

Contributions welcome! Areas of interest:

- Performance optimizations
- Additional metadata features
- Enhanced querying capabilities
- Integration with other MCP tools

### Development Guidelines

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Support

- **Issues:** [GitHub Issues](https://github.com/sin5ddd/mcp-sqlew/issues)
- **Documentation:** See [ARCHITECTURE.md](ARCHITECTURE.md) for technical details
- **Schema Reference:** See source code for complete schema

## Acknowledgments

Built with:
- [Model Context Protocol SDK](https://github.com/modelcontextprotocol/sdk)
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- TypeScript

## Author

**sin5ddd**

## Links

- [npm package](https://www.npmjs.com/package/sqlew)
- [GitHub repository](https://github.com/sin5ddd/mcp-sqlew)
- [Model Context Protocol](https://modelcontextprotocol.io/)
