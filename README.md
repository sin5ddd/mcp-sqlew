# sqlew
![sqlew_logo](assets/sqlew-logo.png)

[![npm version](https://img.shields.io/npm/v/sqlew.svg)](https://www.npmjs.com/package/sqlew)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

> **SQL Efficient Workflow** - MCP server for efficient context sharing between Claude Code sub-agents

## What is sqlew?

**sqlew** is a Model Context Protocol (MCP) server that gives AI agents organizational memory. It solves a critical problem: **AI agents can't remember decisions across sessions**.

### The Problem

Without sqlew:
- 🔴 Every new Claude session starts with zero context
- 🔴 Must re-explain architectural decisions every time
- 🔴 Agents can reintroduce bugs that were already fixed
- 🔴 No way to track WHY decisions were made

### The Solution

With sqlew, AI agents can:
- ✅ **Remember** architectural decisions across sessions
- ✅ **Query** past context: "What breaking changes were made to the API?"
- ✅ **Prevent** regressions by storing constraints: "Duration must NOT occur in Loom module"
- ✅ **Coordinate** between multiple agents with messaging and task tracking

**Real-World Example:**
```typescript
// Agent in Session 1 records:
{
  key: "api_v1_deprecated",
  value: "/v1/users endpoint deprecated, use /v2/users",
  tags: ["api", "breaking-change"]
}

// Agent in Session 2 (days later) queries:
"What API changes should I know about?"
→ Finds the deprecation decision
→ Uses /v2/users endpoint automatically!
```

## Why Use sqlew?

### 🧠 Organizational Memory
Traditional code only tells you **WHAT** and **HOW**. sqlew adds **WHY**:
- Git history → WHAT changed
- Code comments → HOW it works
- **sqlew decisions** → **WHY** it was changed
- **sqlew constraints** → **WHY** it must work this way

### ⚡ Token Efficiency
**60-75% token reduction** in multi-session projects:
- Store decisions once, query selectively
- Structured data (20-30 tokens) vs prose (50-200 tokens)
- Cross-session persistence eliminates context re-explanation

### 🎯 Key Features
- **7 Specialized Tools**: decisions, messages, tasks, files, constraints, stats, config
- **Metadata-Driven**: Tag, layer, scope, and version everything
- **Decision Context** (v3.2.2): Rich decision documentation with rationale and trade-offs
  - Document **WHY** decisions were made, not just **WHAT**
  - Store alternatives considered and pros/cons analysis
  - Perfect for multi-session AI development and team handoffs
  - Link decisions to tasks and constraints for full traceability
- **Task Dependencies** (v3.2.0): Blocking relationships with circular detection
  - Sequential workflow management (API before UI, DB before ORM)
  - Bidirectional queries (find blockers and blocking tasks)
  - Token-efficient metadata-only queries (~88% reduction)
- **Auto-File Tracking** (v3.0.2): Zero-token task management via automatic file watching
  - Auto-transition: `todo` → `in_progress` on file edit
  - Auto-complete: `in_progress` → `done` when acceptance criteria pass
  - 97% token reduction (4,650 tokens saved per 6-task session)
- **Smart Review Detection** (v3.3.0): Quality-based auto-transition to `waiting_review`
  - All watched files modified + TypeScript compiles + Tests pass + 15min idle
  - Purely algorithmic - no AI instructions needed
  - Configurable quality gates via `.sqlew/config.toml`
  - Hybrid mode: Tasks with acceptance_criteria skip review → go directly to `done`
- **Auto-Stale Detection & Auto-Archive**: Tasks automatically transition when idle
  - `in_progress` → `waiting_review` (quality gates or >2 hours idle)
  - `waiting_review` → `todo` (>24 hours idle)
  - `done` → `archived` (>48 hours idle, weekend-aware)
- **Weekend-Aware Cleanup**: Smart retention that pauses during weekends
- **Batch Operations**: Process up to 50 items atomically

### 🔖Kanban-style AI Scrum
![kanban-style task management](assets/kanban-style.png)

## Installation

### Requirements
- Node.js 18.0.0 or higher
- npm or npx

### Quick Install

```bash
npm install sqlew
```

### Add to Claude Desktop

Edit `claude_desktop_config.json`:

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

That's it! Restart Claude Desktop and sqlew is ready.

### Custom Database Path (Optional)

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

Default location: `.sqlew/sqlew.db` in current directory

## Configuration

### Optional Config File

sqlew supports TOML configuration files for persistent settings (`.sqlew/config.toml`):

```toml
[database]
path = ".sqlew/custom.db"  # Override database location

[autodelete]
ignore_weekend = true       # Skip weekends in retention
message_hours = 48          # Keep messages 48 hours
file_history_days = 14      # Keep file history 14 days

[tasks]
auto_archive_done_days = 2
stale_hours_in_progress = 2
auto_stale_enabled = true
```

**Setup:**
```bash
# Copy example config
cp .sqlew/config.toml.example .sqlew/config.toml

# Edit settings
nano .sqlew/config.toml

# Start sqlew (automatically loads config)
npx sqlew
```

**Priority:** CLI args > config.toml > database defaults

**Complete Guide:** See [docs/CONFIGURATION.md](docs/CONFIGURATION.md) for:
- All configuration options and validation rules
- Common configurations (dev/prod/weekend-aware)
- Runtime updates via MCP tools
- Troubleshooting

## Quick Start

### For AI Agents

⚠️ **Most Important Rule**: ALWAYS include the `action` parameter in every tool call.

```javascript
// ❌ WRONG
{key: "auth_method", value: "jwt"}

// ✅ CORRECT
{action: "set", key: "auth_method", value: "jwt", layer: "business"}
```

### Basic Usage

```javascript
// Store a decision
{
  action: "set",
  key: "auth_method",
  value: "JWT with refresh tokens",
  layer: "business",
  tags: ["authentication", "security"]
}

// Query it later
{
  action: "get",
  key: "auth_method"
}

// Search by tags
{
  action: "search_tags",
  tags: ["security"],
  status: "active"
}
```

### Available Tools

| Tool | Purpose | Example Use |
|------|---------|------------|
| **decision** | Record choices | "We chose PostgreSQL" |
| **message** | Agent communication | "Task completed" |
| **task** | Track work | "Implement feature X" |
| **file** | Track changes | "Modified auth.ts" |
| **constraint** | Define rules | "API must be <100ms" |
| **stats** | Database metrics | Get layer summary |
| **config** | Retention settings | Auto-cleanup config |

Each tool supports `action: "help"` for full documentation and `action: "example"` for comprehensive usage examples.

## Documentation

### On-Demand Documentation

**All tools provide built-in documentation with zero upfront token cost:**
- `action: "help"` - Detailed parameter reference, action descriptions, examples
- `action: "example"` - Comprehensive usage scenarios, workflows, best practices

**Example:**
```javascript
// Get detailed help for decision tool
{action: "help"}

// Get comprehensive examples for task tool
{action: "example"}
```

### For AI Agents (68% Token Reduction)

**Tool Selection & Workflows:**
- 📖 **[Tool Selection](docs/TOOL_SELECTION.md)** - Decision tree, when to use each tool (236 lines, ~12k tokens)
- 🔄 **[Workflows](docs/WORKFLOWS.md)** - Multi-step examples, multi-agent coordination (602 lines, ~30k tokens)
- 📚 **[Tool Reference](docs/TOOL_REFERENCE.md)** - Parameters, batch operations, templates (471 lines, ~24k tokens)
- ✅ **[Best Practices](docs/BEST_PRACTICES.md)** - Common errors, troubleshooting (345 lines, ~17k tokens)

**Task System:**
- 📋 **[Task Overview](docs/TASK_OVERVIEW.md)** - Lifecycle, status transitions, auto-stale (363 lines, ~10k tokens)
- ⚙️ **[Task Actions](docs/TASK_ACTIONS.md)** - All actions with examples (1,100+ lines, ~28k tokens)
- 🔗 **[Task Dependencies](docs/TASK_DEPENDENCIES.md)** - Blocking relationships, circular detection (500+ lines, ~13k tokens) **NEW v3.2.0**
- 🔗 **[Task Linking](docs/TASK_LINKING.md)** - Link tasks to decisions/constraints/files/tasks (900+ lines, ~23k tokens)
- 🔄 **[Task Migration](docs/TASK_MIGRATION.md)** - Migrate from decision-based tracking (701 lines, ~18k tokens)

**Decision Context (v3.2.2):**
- 📝 **[Decision Context](docs/DECISION_CONTEXT.md)** - Rich decision documentation with rationale, alternatives, and tradeoffs (500+ lines, ~15k tokens) **NEW v3.2.2**

**Auto File Tracking (v3.0.2):**
- 🤖 **[Auto File Tracking](docs/AUTO_FILE_TRACKING.md)** - Zero-token task management, setup, troubleshooting
- ✅ **[Acceptance Criteria](docs/ACCEPTANCE_CRITERIA.md)** - All check types (tests_pass, code_removed, code_contains, file_exists)

**Shared References:**
- 📘 **[Shared Concepts](docs/SHARED_CONCEPTS.md)** - Layer definitions, enum values, atomic mode (339 lines, ~17k tokens)
- ⚙️ **[Configuration](docs/CONFIGURATION.md)** - Config file setup, all options, validation rules (800+ lines, ~20k tokens) **NEW v3.3.0**
- 🏗️ **[Architecture](docs/ARCHITECTURE.md)** - Technical architecture and database schema

### For Developers

- **[Configuration Guide](docs/CONFIGURATION.md)** - TOML config file setup and options
- **[Building from Source](docs/ARCHITECTURE.md#development)** - Setup and build instructions
- **[Migration Guides](docs/MIGRATION_v2.md)** - Version upgrade guides
- **[CLI Tool](docs/AI_AGENT_GUIDE.md#cli-usage)** - Query database from terminal

## Examples

### Multi-Agent Coordination

```javascript
// Orchestrator creates tasks
{
  action: "batch_create",
  tasks: [
    {title: "Setup database", assigned_agent: "db-agent"},
    {title: "Create API", assigned_agent: "api-agent"}
  ]
}

// Agents send status updates
{
  action: "send",
  from_agent: "db-agent",
  to_agent: "orchestrator",
  message: "Database ready",
  priority: "high"
}
```

### Breaking Change Management

```javascript
// Record deprecation
{
  action: "set",
  key: "api_v1_deprecated",
  value: "/v1 endpoints deprecated, use /v2",
  tags: ["breaking-change", "api"]
}

// Add constraint
{
  action: "add",
  category: "architecture",
  constraint_text: "All endpoints must use /v2 prefix",
  priority: "high"
}
```

### Decision Context (v3.2.2)

```javascript
// Record a decision with rich context
{
  action: "set",
  key: "database_choice",
  value: "PostgreSQL over MongoDB",
  layer: "data",
  tags: ["architecture", "database"]
}

// Add rationale and tradeoffs
{
  action: "add_decision_context",
  key: "database_choice",
  rationale: "Selected PostgreSQL because: (1) Complex relational queries required for reporting, (2) ACID compliance critical for financial data, (3) Team has strong SQL expertise",
  alternatives_considered: [
    {
      option: "MongoDB",
      reason: "Rejected due to weak consistency guarantees for financial data"
    },
    {
      option: "MySQL",
      reason: "Rejected due to limited JSON support needed for metadata"
    }
  ],
  tradeoffs: {
    pros: ["Strong consistency", "Complex queries", "Team expertise"],
    cons: ["Less flexible schema", "Vertical scaling limitations"]
  }
}

// Retrieve decision with full context
{
  action: "get",
  key: "database_choice",
  include_context: true
}
// → Returns decision + rationale + alternatives + tradeoffs
```

### Session Continuity

```javascript
// Session 1: Save state
{
  action: "set",
  key: "refactor_progress",
  value: "Completed 3/5 modules",
  tags: ["session-state"]
}

// Session 2: Resume work
{
  action: "get",
  key: "refactor_progress"
}
// → Returns: "Completed 3/5 modules"
```

## Performance

- **Query speed**: 2-50ms
- **Concurrent agents**: 5+ simultaneous
- **Storage efficiency**: ~140 bytes per decision
- **Token savings**: 60-75% in typical projects

## 💖 Support sqlew

### One-time Support
Perfect for trying out sponsorship!
- ☕ $5 - Buy me a coffee
- 🍕 $10 - Buy me a pizza

### Monthly Support
For ongoing development support:
- ⭐ $1/month - Support Continual Development
- 🚀 $5/month - Active support for Request
- 💼 $10/month - Buy me more AI tokens

on [GitHub Sponsors](https://github.com/sponsors/sin5ddd)

## Version

Current version: **3.3.0**
See [CHANGELOG.md](CHANGELOG.md) for release history.

## License

AGPLv3 - **Free to use**, open-source required when embedding/modifying.

See [LICENSE](LICENSE) file for details.

**Free to use for:**
- Personal and commercial projects
- Using sqlew as-is in Claude Desktop
- Managing AI agent context

**Open-source required when:**
- Embedding sqlew into your application
- Modifying and distributing sqlew
- Offering sqlew as a network service

## Links

- [npm package](https://www.npmjs.com/package/sqlew)
- [GitHub repository](https://github.com/sin5ddd/mcp-sqlew)
- [Model Context Protocol](https://modelcontextprotocol.io/)

## Support

- **Issues**: [GitHub Issues](https://github.com/sin5ddd/mcp-sqlew/issues)
- **Documentation**: [docs/](docs/) directory

## Acknowledgments

Built with [Model Context Protocol SDK](https://github.com/modelcontextprotocol/sdk), [better-sqlite3](https://github.com/WiseLibs/better-sqlite3), and TypeScript.

**Author**: sin5ddd
