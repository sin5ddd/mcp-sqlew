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
- **Auto-Stale Detection**: Tasks automatically transition when idle
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
- ⚙️ **[Task Actions](docs/TASK_ACTIONS.md)** - All actions with examples (854 lines, ~21k tokens)
- 🔗 **[Task Linking](docs/TASK_LINKING.md)** - Link tasks to decisions/constraints/files (729 lines, ~18k tokens)
- 🔄 **[Task Migration](docs/TASK_MIGRATION.md)** - Migrate from decision-based tracking (701 lines, ~18k tokens)

**Shared References:**
- 📘 **[Shared Concepts](docs/SHARED_CONCEPTS.md)** - Layer definitions, enum values, atomic mode (339 lines, ~17k tokens)
- 🏗️ **[Architecture](docs/ARCHITECTURE.md)** - Technical architecture and database schema

### For Developers

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

Current version: **3.0.0**
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
