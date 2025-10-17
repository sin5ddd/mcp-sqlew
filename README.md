# sqlew
![sqlew_logo](assets/sqlew-logo.png)

[![npm version](https://img.shields.io/npm/v/sqlew.svg)](https://www.npmjs.com/package/sqlew)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **SQL Efficient Workflow** - MCP server for efficient context sharing between Claude Code sub-agents

## Overview

**sqlew** is a Model Context Protocol (MCP) server that enables efficient context sharing between multiple Claude Code agents through a SQLite-backed database. It dramatically reduces token consumption while providing structured data management through metadata-driven organization.

**Current Version:** 3.0.0

## Benefits

### 🧠 Organizational Memory for AI Agents

**sqlew solves the "organizational memory" problem that traditional code can't:**

| What Traditional Code Provides | What sqlew Adds |
|-------------------------------|-----------------|
| ✅ **Git history** - WHAT changed | ✅ **Decisions** - WHY it changed |
| ✅ **Code comments** - HOW it works | ✅ **Constraints** - WHY it must work this way |
| ❌ **Architectural decisions** - Missing! | ✅ **Context survival** - Across sessions |

**Real-World Example:**
```typescript
// Agent in Session 1 records:
{
  key: "loom/duration-constraint",
  value: "Duration must NOT occur in Loom module",
  layer: "business",
  tags: ["architecture", "constraint", "breaking"]
}

// Agent in Session 2 queries:
"What are business layer constraints for Loom module?"
→ Finds: "Duration must NOT occur in Loom"
→ Avoids introducing the same bug you just fixed!
```

### 💡 Why This Matters for LLMs

1. **Context Survival**: Next Claude session can query architectural decisions from previous sessions
2. **Prevents Regression**: Constraints like "Duration must NOT occur in Loom" prevent reintroducing bugs
3. **Historical Reasoning**: Captures WHY decisions were made, not just WHAT changed
4. **Knowledge Discovery**: Searchable by layer/tag/scope - "Show me all breaking changes in business layer"

### ⚡ Real-World Token Savings

**Scenario: 5 Agents Working Across 10 Sessions**

| Approach | Token Usage | Details |
|----------|-------------|---------|
| **Without sqlew** | ~20,000 tokens | All context re-provided every session |
| **With sqlew** | ~7,400 tokens | Selective queries, persistent storage |
| **Savings** | **63% reduction** | Realistic multi-session project |

**Why sqlew Saves Tokens:**

1. **Selective Retrieval** (50-70% savings)
   - Without: Must read ALL context every time
   - With: Query only what's needed - `search_layer("business")` returns 5 decisions, not 100

2. **Structured vs Unstructured** (60-85% savings)
   - Without: "We decided to use JWT because..." (50-200 tokens in prose)
   - With: `{key: "auth", value: "JWT", layer: "business"}` (20-30 tokens)

3. **Cross-Session Persistence** (80-95% savings)
   - Without: Context re-provided every new session
   - With: Query from database, context survives sessions

4. **Search Instead of Scan** (70-90% savings)
   - Without: Read all 100 decisions to find 5 relevant ones
   - With: `search_tags(["breaking", "api"])` → only relevant results

**Expected Token Reduction (Typical Multi-Agent Project):**
- Conservative: 50-65% reduction
- Realistic: 60-75% reduction
- Optimal: 70-85% reduction

*Note: Internal architecture improvements (v1.0.0→v2.0.0) achieved 96% tool definition reduction and 67% MCP context reduction. The percentages above reflect real-world usage benefits.*

**Performance:**
- Query response: 2-50ms
- Concurrent access: 5+ simultaneous agents
- Storage efficiency: ~140 bytes per decision

**Reliability:**
- SQLite ACID transactions
- 100% backward compatible upgrades

## Features

### Core Capabilities
- **Context Management** - Store and retrieve decisions with tags, layers, scopes, and versions
- **Agent Messaging** - Priority-based messaging system with broadcast support
- **File Change Tracking** - Layer-based file organization with lock detection
- **Constraint Management** - Track performance, architecture, and security constraints
- **Activity Logging** - Automatic tracking of all agent actions (v2.1.0)
- **Weekend-Aware Auto-Cleanup** - Smart retention policies that pause during weekends
- **Kanban Task Watcher** - AI-optimized task management with auto-stale detection (v3.0.0)

### Advanced Features (v2.1.0)
- **Smart Defaults** - Auto-infer layer and tags from file paths (60% token reduction)
- **Batch Operations** - Process up to 50 operations atomically (70% token reduction)
- **Update Polling** - Lightweight subscription mechanism (95% token reduction)
- **Advanced Query** - Complex multi-criteria filtering with full-text search
- **Templates** - 5 built-in templates + custom template support
- **CLI Tool** - Standalone query commands without MCP server

### 7 Consolidated Tools (35 Actions)
1. **`decision`** (13 actions) - Context management with metadata
2. **`message`** (4 actions) - Agent-to-agent messaging
3. **`file`** (4 actions) - File change tracking
4. **`constraint`** (3 actions) - Constraint management
5. **`stats`** (4 actions) - Statistics and cleanup
6. **`config`** (2 actions) - Configuration management
7. **`task`** (9 actions) - Kanban task management (v3.0.0)

## Installation

### Requirements
- Node.js 18.0.0 or higher
- npm or npx

### Install from npm

```bash
npm install sqlew
```

### Quick Test

```bash
# Test with MCP Inspector
npx @modelcontextprotocol/inspector npx sqlew
```

## Quick Start

### Add to Claude Desktop

Add to your Claude Desktop configuration (`claude_desktop_config.json`):

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

### Custom Database Path

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

### Weekend-Aware Auto-Deletion

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

### Default Database Location

`.sqlew/sqlew.db` (created in current directory)

## For AI Agents

**🤖 Claude Code and other AI agents: Read this section first!**

### Most Important Rule

⚠️ **ALWAYS include the `action` parameter** - This is required in ALL tool calls and is the #1 cause of errors.

```javascript
// ❌ WRONG
{key: "auth_method", value: "jwt"}

// ✅ CORRECT
{action: "set", key: "auth_method", value: "jwt", layer: "business"}
```

### Quick Parameter Reference

Every tool requires an `action` parameter. Use `{action: "help"}` on any tool for detailed documentation.

| Tool | Common Actions | Required Parameters (besides action) |
|------|----------------|-------------------------------------|
| **decision** | set, get, list, search_tags | set: key, value, layer |
| **message** | send, get, mark_read | send: from_agent, msg_type, message |
| **file** | record, get, check_lock | record: file_path, agent_name, change_type |
| **constraint** | add, get, deactivate | add: category, constraint_text |
| **stats** | layer_summary, db_stats, clear | (no additional required) |
| **config** | get, update | (no additional required) |
| **task** | create, update, get, list, move | create: title |

### Common Errors & Quick Fixes

```javascript
// Error: "Unknown action: undefined"
// Fix: Add action parameter
{action: "set", ...}

// Error: "Parameter \"value\" is required"
// Fix: Don't nest in defaults, provide directly
{action: "set_from_template", template: "...", key: "...", value: "..."}

// Error: "Invalid layer"
// Fix: Use one of 5 valid layers
{layer: "business"}  // Valid: presentation, business, data, infrastructure, cross-cutting

// Error: "Invalid status"
// Fix: Use one of 3 valid statuses
{status: "active"}  // Valid: active, deprecated, draft
```

### Best Practices for AI Agents

1. **Use `atomic: false` for batch operations** (recommended for AI agents to avoid transaction failures)
2. **Specify `layer` when setting decisions** (helps organize architectural concerns)
3. **Use `search_advanced` for complex queries** (more powerful than `list` or `search_tags`)
4. **Check `has_updates` before fetching** (95% token savings vs full data retrieval)
5. **Use templates for common patterns** (consistent metadata, enforced requirements)

### Comprehensive Guide

For complete documentation with parameter matrices, search decision trees, batch operation guides, and troubleshooting:

**📖 [AI Agent Guide](docs/AI_AGENT_GUIDE.md)** ← Full reference for AI agents

### Valid Enum Values

**layer**: `presentation` | `business` | `data` | `infrastructure` | `cross-cutting`

**status**: `active` | `deprecated` | `draft`

**msg_type**: `decision` | `warning` | `request` | `info`

**priority**: `low` | `medium` | `high` | `critical`

**change_type**: `created` | `modified` | `deleted`

**category** (constraints): `performance` | `architecture` | `security`

## MCP Tools Reference

All tools use action-based routing. Call any tool with `action: "help"` for comprehensive documentation.

### 1. `decision` - Context Management

Manage decisions with metadata (tags, layers, versions, scopes).

**Actions:** `set`, `get`, `list`, `search_tags`, `search_layer`, `versions`, `quick_set`, `search_advanced`, `set_batch`, `has_updates`, `set_from_template`, `create_template`, `list_templates`, `help`

**Examples:**

```typescript
// Standard set
{
  action: "set",
  key: "auth_method",
  value: "JWT",
  agent: "auth-agent",
  layer: "business",
  tags: ["authentication", "security"],
  version: "1.0.0"
}

// Quick set with smart defaults (auto-infers layer, tags)
{
  action: "quick_set",
  key: "api/users/auth",
  value: "JWT validation updated",
  agent: "auth-agent"
  // Auto-infers: layer="presentation", tags=["api", "users", "auth"]
}

// Batch set (up to 50 decisions atomically)
{
  action: "set_batch",
  decisions: [
    { key: "api_v1", value: "REST", layer: "presentation" },
    { key: "api_v2", value: "GraphQL", layer: "presentation" }
  ],
  atomic: true
}

// Check for updates (lightweight polling)
{
  action: "has_updates",
  agent_name: "my-agent",
  since_timestamp: "2025-10-15T10:00:00Z"
}

// Advanced search with complex filtering
{
  action: "search_advanced",
  layers: ["business", "data"],
  tags_all: ["security"],
  search_text: "authentication",
  status: "active",
  limit: 20
}

// Set from template
{
  action: "set_from_template",
  template: "api-endpoint",
  key: "user_api",
  value: "GET /api/users"
}

// Get decision
{
  action: "get",
  key: "auth_method"
}

// Get version history
{
  action: "versions",
  key: "auth_method"
}

// Get help
{ action: "help" }
```

### 2. `message` - Agent Messaging

Send and retrieve messages with priority levels.

**Actions:** `send`, `get`, `mark_read`, `send_batch`, `help`

**Examples:**

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

// Batch send (up to 50 messages)
{
  action: "send_batch",
  messages: [
    {
      from_agent: "orchestrator",
      to_agent: "auth-agent",
      msg_type: "request",
      message: "Start setup",
      priority: "high"
    },
    {
      from_agent: "orchestrator",
      to_agent: "db-agent",
      msg_type: "request",
      message: "Initialize schema",
      priority: "high"
    }
  ]
}

// Get messages
{
  action: "get",
  agent_name: "agent1",
  unread_only: true,
  priority_filter: "high"
}

// Mark as read
{
  action: "mark_read",
  agent_name: "agent1",
  message_ids: [1, 2, 3]
}
```

### 3. `file` - File Change Tracking

Track file modifications with layer assignment.

**Actions:** `record`, `get`, `check_lock`, `record_batch`, `help`

**Examples:**

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

// Batch record (up to 50 file changes)
{
  action: "record_batch",
  file_changes: [
    {
      file_path: "/src/auth/jwt.ts",
      agent_name: "auth-agent",
      change_type: "created",
      layer: "business"
    },
    {
      file_path: "/src/auth/validation.ts",
      agent_name: "auth-agent",
      change_type: "created",
      layer: "business"
    }
  ]
}

// Get file changes
{
  action: "get",
  since: "2025-10-15T10:00:00Z",
  layer: "business"
}

// Check file lock
{
  action: "check_lock",
  file_path: "/src/auth.ts",
  lock_duration: 300
}
```

### 4. `constraint` - Constraint Management

Manage architectural, performance, and security constraints.

**Actions:** `add`, `get`, `deactivate`, `help`

**Examples:**

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

### 5. `stats` - Statistics & Utilities

Get database statistics and manage data cleanup.

**Actions:** `layer_summary`, `db_stats`, `clear`, `activity_log`, `help`

**Examples:**

```typescript
// Layer summary
{ action: "layer_summary" }

// Database stats
{ action: "db_stats" }

// Activity log (v2.1.0)
{
  action: "activity_log",
  since: "1h",
  agent_names: ["auth-agent"],
  limit: 100
}

// Clear old data (weekend-aware)
{
  action: "clear",
  messages_older_than_hours: 48,
  file_changes_older_than_days: 14
}
```

### 6. `config` - Configuration

Manage auto-deletion and retention settings.

**Actions:** `get`, `update`, `help`

**Examples:**

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

### 7. `task` - Kanban Task Watcher (v3.0.0)

AI-optimized task management with automatic stale task detection.

**Actions:** `create`, `update`, `get`, `list`, `move`, `link`, `archive`, `batch_create`, `help`

**Examples:**

```typescript
// Create task
{
  action: "create",
  title: "Implement authentication",
  description: "Add JWT-based authentication to API",
  status: "todo",
  priority: "high",
  assignee: "auth-agent",
  tags: ["security", "api"],
  layer: "business"
}

// Update task
{
  action: "update",
  task_id: 1,
  status: "in_progress",
  description: "Updated with new requirements"
}

// Get task
{
  action: "get",
  task_id: 1
}

// List tasks (metadata only for token efficiency)
{
  action: "list",
  status: "in_progress",
  assignee: "auth-agent",
  tags: ["security"]
}

// Move task (with status validation)
{
  action: "move",
  task_id: 1,
  new_status: "waiting_review"
}

// Link task to decision/constraint/file
{
  action: "link",
  task_id: 1,
  link_type: "decision",
  link_key: "auth_method"
}

// Archive completed task
{
  action: "archive",
  task_id: 1
}

// Batch create tasks
{
  action: "batch_create",
  tasks: [
    { title: "Task 1", status: "todo" },
    { title: "Task 2", status: "todo" }
  ],
  atomic: false
}
```

**Key Features:**

- **Auto-Stale Detection:** Tasks automatically transition based on time thresholds
  - `in_progress` >2h → `waiting_review`
  - `waiting_review` >24h → `todo`
- **Token Efficiency:** 70% reduction via metadata-only list queries
- **Status Validation:** Enforces valid Kanban state machine transitions
- **Linking:** Connect tasks to decisions, constraints, and files
- **Flat Hierarchy:** Simple task-only structure (no subtasks)

**Status Lifecycle:**

```
todo → in_progress → waiting_review → done → archived
         ↓              ↓
      blocked ────────┘
```

See [TASK_SYSTEM.md](TASK_SYSTEM.md) for comprehensive task management guide.

## CLI Tool (v2.1.0)

Query your database directly from terminal without MCP server.

### Available Commands

```bash
# Query decisions
npx sqlew-cli query decisions --layer=business --tags=breaking --output=table

# Query messages
npx sqlew-cli query messages --unread --priority=high --output=json

# Query file changes
npx sqlew-cli query files --since=1h --layer=data --output=table

# Query activity log
npx sqlew-cli query activity --since=5m --agent=* --output=json
```

### Common Options

- `--output <format>` - Output format: `json` or `table` (default: json)
- `--layer <layer>` - Filter by layer
- `--tags <tags>` - Filter by tags (comma-separated)
- `--since <time>` - Time filter (e.g., "5m", "1h", "2d", or ISO timestamp)
- `--limit <number>` - Limit results
- `--db-path <path>` - Custom database path
- `--help` - Show help

## Architecture Layers

sqlew organizes code by standard architecture layers:

- **presentation** - UI, API endpoints, views
- **business** - Business logic, services, use cases
- **data** - Repositories, database access
- **infrastructure** - Configuration, external services
- **cross-cutting** - Logging, security, utilities

## Database Schema

**Master Tables (m_ prefix):** Normalization layer (agents, files, keys, layers, tags, scopes, categories, config, templates)

**Transaction Tables (t_ prefix):** Core data (decisions, history, messages, file changes, constraints, activity log)

**Views (v_ prefix):** Token-efficient pre-aggregated queries

**Triggers (trg_ prefix):** Automatic version history and activity logging

### Automatic Migration

- **v1.x → v2.x:** Automatic migration adds table prefixes and new features
- **v2.0 → v2.1:** Adds activity log and template tables
- All migrations are safe with rollback protection

## Development

### Building from Source

```bash
git clone https://github.com/sin5ddd/mcp-sqlew.git
cd mcp-sqlew
npm install
npm run build
```

### Available Scripts

```bash
npm start          # Start MCP server
npm run cli        # Run CLI tool
npm run inspector  # Test with MCP Inspector
npm run build      # Build TypeScript
npm run dev        # Watch mode
npm run rebuild    # Clean and rebuild
```

## Configuration

### Retention Periods (Defaults)

- **Messages:** 24 hours (weekend-aware optional)
- **File Changes:** 7 days (weekend-aware optional)
- **Decisions:** Permanent (version history preserved)
- **Constraints:** Permanent (soft delete only)

### Weekend-Aware Cleanup

When enabled, weekends (Saturday/Sunday) don't count toward retention periods:

- Message sent Friday 3pm → Deleted Monday 3pm (skips weekend)
- Message sent Monday 10am → Deleted Tuesday 10am

Configure via CLI args or MCP tools at runtime.

## Migration Guide

### From v2.1.0 to v2.1.1

No breaking changes. Only bin command configuration changed:

- **Old:** `npx sqlew` → CLI, `npx sqlew-server` → MCP server
- **New:** `npx sqlew` → MCP server (default), `sqlew-cli` → CLI (after installing the package)

Update Claude Desktop config if using custom commands.

### From v2.0.0 to v2.1.0

No breaking changes. Database migrates automatically on startup.

New features are opt-in via new actions.

### From v1.x to v2.0.0

Requires migration. See [MIGRATION_v2.md](MIGRATION_v2.md) for details.

## License

MIT - see [LICENSE](LICENSE) file for details

## Links

- [npm package](https://www.npmjs.com/package/sqlew)
- [GitHub repository](https://github.com/sin5ddd/mcp-sqlew)
- [Changelog](CHANGELOG.md)
- [Architecture Documentation](ARCHITECTURE.md)
- [Model Context Protocol](https://modelcontextprotocol.io/)

## Author

**sin5ddd**

## Support

- **Issues:** [GitHub Issues](https://github.com/sin5ddd/mcp-sqlew/issues)
- **Documentation:** See [ARCHITECTURE.md](ARCHITECTURE.md) for technical details

## Acknowledgments

Built with:
- [Model Context Protocol SDK](https://github.com/modelcontextprotocol/sdk)
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- TypeScript
