# sqlew

[![npm version](https://img.shields.io/npm/v/sqlew.svg)](https://www.npmjs.com/package/sqlew)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**sqlew** (SQL Efficient Workflow) is a Model Context Protocol (MCP) server for efficient context sharing between Claude Code sub-agents. Achieve **67% token reduction** through action-based tools while managing structured data through a metadata-driven SQLite database.

## ⚠️ Version 2.1.0 - Feature Release

**v2.1.0 adds 7 major features** including Activity Log, Smart Defaults, Subscriptions, Advanced Query, Batch Operations, Templates, and CLI Query Tool. This is a feature addition - fully backward compatible with v2.0.0.

**Database Compatibility:** ✅ **100% compatible** - v2.1 automatically migrates v2.0 databases to add new tables and columns.

**Migration from v2.0:** Automatic on startup - see [CHANGELOG.md](CHANGELOG.md) for details.

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
- **Activity Log (v2.1.0):** Automatic tracking of all agent actions with 4 trigger-based monitoring
- **Smart Defaults (v2.1.0):** Quick decision creation with intelligent layer/tag inference from file paths
- **Subscriptions (v2.1.0):** Lightweight polling mechanism to check for updates without fetching all data
- **Advanced Query (v2.1.0):** Complex multi-criteria filtering with full-text search across decisions
- **Batch Operations (v2.1.0):** Bulk create decisions, messages, and file changes in single transactions
- **Templates (v2.1.0):** Pre-configured decision templates (5 built-in) with custom template support
- **CLI Query Tool (v2.1.0):** Standalone CLI commands for fast terminal queries without MCP Inspector
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

### CLI Query Tool (v2.1.0)

Query your context database directly from the terminal without MCP Inspector. The CLI provides 4 specialized query commands with rich filtering capabilities.

```bash
# Query decisions with filtering
sqlew query decisions --layer business --tags breaking --output table
sqlew query decisions --search "auth" --status active --limit 10
sqlew query decisions --key-pattern "api_*" --scope user-service

# Query unread high-priority messages
sqlew query messages --unread --priority high --output json
sqlew query messages --to-agent db-agent --msg-type warning
sqlew query messages --from-agent auth-agent --since 1h

# Query recent file changes (last hour)
sqlew query files --since 1h --output table
sqlew query files --layer data --change-type modified
sqlew query files --agent auth-agent --file-path "*/auth/*"

# Query recent activity from all agents
sqlew query activity --since 5m --agent '*' --output json
sqlew query activity --action-type decision_set --since 30m
sqlew query activity --agent auth-agent --limit 50
```

**Available Commands:**
- `decisions` - Query decisions with multi-criteria filtering and full-text search
- `messages` - Query agent messages with priority, read status, and type filters
- `files` - Query file changes with layer, change type, and path filtering
- `activity` - Query activity log with action type and agent filters

**Common Options:**
- `--output <format>` - Output format: `json` or `table` (default: json)
- `--layer <layer>` - Filter by layer (presentation, business, data, infrastructure, cross-cutting)
- `--tags <tags>` - Filter by tags (comma-separated)
- `--since <time>` - Time filter (e.g., "5m", "1h", "2d", or ISO timestamp)
- `--limit <number>` - Limit results (default: 100)
- `--db-path <path>` - Custom database path
- `--help` - Show help for available options

**Decision-Specific Options:**
- `--search <text>` - Full-text search in keys and values
- `--status <status>` - Filter by status (active, deprecated, draft)
- `--key-pattern <pattern>` - SQL LIKE pattern for keys
- `--scope <scope>` - Filter by scope

**Message-Specific Options:**
- `--unread` - Show only unread messages
- `--priority <priority>` - Filter by priority (low, medium, high, critical)
- `--msg-type <type>` - Filter by message type (decision, warning, request, info)
- `--from-agent <agent>` - Filter by sender agent
- `--to-agent <agent>` - Filter by recipient agent

**File-Specific Options:**
- `--change-type <type>` - Filter by change type (created, modified, deleted)
- `--agent <agent>` - Filter by agent name
- `--file-path <pattern>` - SQL LIKE pattern for file paths

**Activity-Specific Options:**
- `--action-type <type>` - Filter by action type (decision_set, message_send, file_record, constraint_add)
- `--agent <agent>` - Filter by agent name

Run `sqlew query <command> --help` for command-specific documentation.

### Database Location

Default: `.sqlew/sqlew.db` (created in current directory)

## Available Tools (v2.1.0)

All tools now use action-based routing. Call any tool with `action: "help"` for comprehensive documentation.

### `decision` - Context Management

Manage decisions with metadata (tags, layers, versions, scopes).

**Actions:** `set`, `get`, `list`, `search_tags`, `search_layer`, `versions`, `quick_set`, `search_advanced`, `set_batch`, `set_from_template`, `create_template`, `list_templates`, `has_updates`, `help`

```typescript
// Set a decision (standard)
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

// Quick set with smart defaults (v2.1.0)
{
  action: "quick_set",
  key: "database_config",
  value: "PostgreSQL",
  agent: "db-agent",
  file_path: "/src/data/repositories/UserRepository.ts"
  // Automatically infers: layer="data", tags=["database", "repositories"]
}

// Advanced search (v2.1.0)
{
  action: "search_advanced",
  search_text: "authentication",
  layers: ["business", "presentation"],
  tags: ["security"],
  status: "active",
  agent: "auth-agent",
  scopes: ["user-service"]
}

// Batch set (v2.1.0)
{
  action: "set_batch",
  decisions: [
    { key: "api_v1", value: "REST", agent: "api-agent", layer: "presentation" },
    { key: "api_v2", value: "GraphQL", agent: "api-agent", layer: "presentation" }
  ]
}

// Set from template (v2.1.0)
{
  action: "set_from_template",
  template_name: "api-endpoint",
  key: "user_api",
  agent: "api-agent",
  overrides: {
    value: "GET /api/users",
    scopes: ["user-service"]
  }
}

// Create custom template (v2.1.0)
{
  action: "create_template",
  name: "my-template",
  description: "Custom template",
  agent: "admin-agent",
  default_layer: "business",
  default_tags: ["custom"],
  default_status: "active"
}

// List templates (v2.1.0)
{
  action: "list_templates"
}

// Check for updates (v2.1.0)
{
  action: "has_updates",
  agent: "auth-agent",
  since: "2025-01-10T12:00:00Z"
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

**Actions:** `send`, `get`, `mark_read`, `send_batch`, `help`

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

// Send batch messages (v2.1.0)
{
  action: "send_batch",
  messages: [
    {
      from_agent: "orchestrator",
      to_agent: "auth-agent",
      msg_type: "request",
      message: "Start authentication setup",
      priority: "high"
    },
    {
      from_agent: "orchestrator",
      to_agent: "db-agent",
      msg_type: "request",
      message: "Initialize database schema",
      priority: "high"
    }
  ]
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

**Actions:** `record`, `get`, `check_lock`, `record_batch`, `help`

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

// Record batch file changes (v2.1.0)
{
  action: "record_batch",
  changes: [
    {
      file_path: "/src/auth/jwt.ts",
      agent_name: "auth-agent",
      change_type: "created",
      layer: "business",
      description: "Added JWT utility"
    },
    {
      file_path: "/src/auth/validation.ts",
      agent_name: "auth-agent",
      change_type: "created",
      layer: "business",
      description: "Added validation logic"
    }
  ]
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

**Actions:** `layer_summary`, `db_stats`, `clear`, `activity_log`, `help`

```typescript
// Layer summary
{ action: "layer_summary" }

// Database stats
{ action: "db_stats" }

// Activity log (v2.1.0)
{
  action: "activity_log",
  agent: "auth-agent",
  action_type: "decision_set",
  since: "2025-01-10T10:00:00Z",
  limit: 100
}

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

## v2.1.0 Features

### FR-001: Activity Log

Automatic tracking of all agent actions through trigger-based monitoring. Every decision set, message send, file record, and constraint add is logged with timestamps and agent information.

**Use Cases:**
- Audit trail for debugging agent interactions
- Performance monitoring and bottleneck identification
- Historical analysis of agent behavior patterns

**Implementation:**
- `t_activity_log` table with agent_id, action_type, entity_id, and timestamps
- 4 triggers automatically log actions: `trg_activity_decision_set`, `trg_activity_message_send`, `trg_activity_file_record`, `trg_activity_constraint_add`
- Query via `stats` tool with `action: "activity_log"` or CLI with `sqlew query activity`

### FR-002: Smart Defaults

Quick decision creation with intelligent layer and tag inference from file paths. Reduces boilerplate by automatically categorizing decisions based on file context.

**Use Cases:**
- Rapid decision recording during active development
- Consistent layer/tag assignment without manual specification
- Reduced cognitive load for agents

**Implementation:**
- `quick_set` action in `decision` tool
- Path pattern matching: `/src/data/*` → layer="data", tags=["database"]
- `/src/presentation/*` → layer="presentation", tags=["ui", "views"]
- Overridable defaults if explicit values provided

### FR-003: Subscriptions

Lightweight polling mechanism to check for updates without fetching all data. Agents can subscribe to decision changes and efficiently check for updates since last poll.

**Use Cases:**
- Periodic checks for new decisions without full data retrieval
- Token-efficient polling for agents monitoring specific contexts
- Reduced network/token overhead for update detection

**Implementation:**
- `t_subscriptions` table tracks agent_id and last_check timestamps
- `has_updates` action in `decision` tool returns boolean and count
- Agents can poll periodically with minimal token cost

### FR-004: Advanced Query

Complex multi-criteria filtering with full-text search across decisions. Supports AND/OR logic for tags, multiple layer filtering, and text search in keys/values.

**Use Cases:**
- Cross-layer analysis (e.g., all "security" decisions in "business" and "data" layers)
- Full-text search for decisions related to specific features
- Complex filtering scenarios with multiple conditions

**Implementation:**
- `search_advanced` action in `decision` tool
- SQL LIKE search for text patterns in keys and values
- Multiple layer filtering with `layers` array parameter
- Combines with existing tag/status/scope filters

### FR-005: Batch Operations

Bulk creation of decisions, messages, and file changes in single transactions. Reduces round-trips and ensures atomic operations.

**Use Cases:**
- Bulk initialization of project decisions
- Broadcasting messages to multiple agents
- Recording multiple file changes from refactoring operations
- Atomic multi-entity operations

**Implementation:**
- `set_batch` action in `decision` tool (accepts array of decisions)
- `send_batch` action in `message` tool (accepts array of messages)
- `record_batch` action in `file` tool (accepts array of file changes)
- All operations wrapped in transactions for ACID guarantees

### FR-006: Templates

Pre-configured decision templates with 5 built-in templates and custom template support. Ensures consistency and reduces setup time.

**Built-in Templates:**
1. **api-endpoint**: REST/GraphQL endpoint configurations (layer: presentation, tags: api, endpoints)
2. **database-config**: Database connection and schema settings (layer: data, tags: database, config)
3. **security-policy**: Authentication, authorization, encryption rules (layer: cross-cutting, tags: security, policy)
4. **performance-threshold**: Performance metrics and SLA definitions (layer: infrastructure, tags: performance, monitoring)
5. **feature-flag**: Feature toggle configurations (layer: business, tags: feature-flags, config)

**Use Cases:**
- Consistent decision structure across agents
- Quick setup for common decision types
- Team standards enforcement through templates

**Implementation:**
- `m_templates` table stores template definitions
- `set_from_template` action applies template with key and overrides
- `create_template` action for custom templates
- `list_templates` action to view available templates

### FR-007: CLI Query Tool

Standalone CLI commands for fast terminal queries without MCP Inspector. Provides 4 specialized query commands with rich filtering and table/JSON output formats.

**Use Cases:**
- Quick context checks during terminal-based development
- CI/CD integration for decision validation
- Shell scripting with JSON output parsing
- Human-readable table output for debugging

**Implementation:**
- `sqlew query decisions|messages|files|activity` commands
- Rich filtering options per command (see CLI section above)
- Table output uses `cli-table3` for formatted display
- JSON output for programmatic consumption

## Database Schema

sqlew uses a normalized SQLite schema (v2.1.0) optimized for token efficiency with category-based table prefixes:

**Master Tables (m_ prefix):** m_agents, m_files, m_context_keys, m_layers, m_tags, m_scopes, m_constraint_categories, m_config, m_templates (v2.1.0)

**Transaction Tables (t_ prefix):** t_decisions, t_decisions_numeric, t_decision_history, t_decision_tags, t_decision_scopes, t_agent_messages, t_file_changes, t_constraints, t_constraint_tags, t_activity_log (v2.1.0), t_subscriptions (v2.1.0)

**Token-Efficient Views (v_ prefix):** v_tagged_decisions, v_active_context, v_layer_summary, v_unread_messages_by_priority, v_recent_file_changes, v_tagged_constraints

**Triggers (trg_ prefix):** trg_record_decision_history, trg_activity_decision_set (v2.1.0), trg_activity_message_send (v2.1.0), trg_activity_file_record (v2.1.0), trg_activity_constraint_add (v2.1.0)

### Automatic Migration

**From v2.0 to v2.1:** Automatic migration adds new tables (t_activity_log, t_subscriptions, m_templates) and triggers (4 activity monitoring triggers). Migration runs on startup and is safe - if it fails, the database is unchanged.

**From v1.2.0 to v1.3.0:** The server automatically migrates your database to use the new prefixed table names. The migration is safe and runs in a transaction.

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
