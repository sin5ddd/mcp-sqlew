# sqlew
![sqlew_logo](assets/sqlew-logo.png)

[![npm version](https://img.shields.io/npm/v/sqlew.svg)](https://www.npmjs.com/package/sqlew)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

> **SQL Efficient Workflow** - MCP server for efficient context sharing between Claude Code sub-agents

## What is sqlew?

**sqlew** is a Model Context Protocol (MCP) server that gives AI agents organizational memory across sessions.

**The Problem:** Without sqlew, every Claude session starts with zero context. You must re-explain decisions, agents can reintroduce bugs, and there's no way to track WHY decisions were made.

**The Solution:** sqlew lets agents remember decisions, query past context, prevent regressions with constraints, and coordinate via messaging and tasks.

**Example:** Session 1 records "API v1 deprecated". Session 2 (days later) queries and automatically uses v2.

## Why Use sqlew?

### 🧠 Organizational Memory
Traditional code tells you **WHAT** and **HOW**. sqlew adds **WHY**:
- **Decisions** → WHY it was changed
- **Constraints** → WHY it must work this way

### ⚡ Token Efficiency
**60-75% token reduction** in multi-session projects through structured data storage and selective querying.

### 🎯 Key Features
- **5 Specialized Tools**: decisions, tasks, files, constraints, stats (config tool removed in dev)
- **Parameter Validation**: Typo detection, required/optional markers, helpful error messages (NEW in dev)
- **Metadata-Driven**: Tag, layer, scope, and version everything
- **Decision Context**: Document WHY with rationale, alternatives, and trade-offs
- **Task Dependencies**: Blocking relationships with circular detection
- **Auto-File Tracking**: Zero-token task management via file watching
- **Smart Review Detection**: Quality-based auto-transition to `waiting_review`
- **Auto-Stale Detection**: Tasks auto-transition when idle
- **Weekend-Aware Cleanup**: Smart retention during weekends
- **Batch Operations**: Process up to 50 items atomically

See [docs/TASK_OVERVIEW.md](docs/TASK_OVERVIEW.md) and [docs/DECISION_CONTEXT.md](docs/DECISION_CONTEXT.md) for details.

### 🔖Kanban-style AI Scrum
![kanban-style task management](assets/kanban-style.png)

## Installation

### Requirements
- Node.js 18.0.0 or higher
- npm or npx

### Quick Install

**Recommended (npx):**
```bash
npx sqlew
```

**Or install per project:**
```bash
npm install sqlew
```

**Note**: Global install (`npm install -g`) is **not recommended** because sqlew requires an independent database per project. Each project should maintain its own context database in `.sqlew/sqlew.db`.

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

Restart Claude Desktop. Done!

**Custom database path:** Add path as argument: `"args": ["sqlew", "/path/to/db.db"]`
**Default location:** `.sqlew/sqlew.db`

### Jetbrains Junie AI

**⚠️ Not Supported:** Junie AI cannot use relative paths in MCP server configurations, which makes it incompatible with sqlew's project-based database model. Each project requires its own isolated database at `.sqlew/sqlew.db`, but Junie AI's global MCP configuration cannot handle per-project database paths.

## Configuration

### Optional Config File

Create `.sqlew/config.toml` for persistent settings:

```toml
[database]
path = ".sqlew/custom.db"

[autodelete]
ignore_weekend = true
message_hours = 48
```

**Priority:** CLI args > config.toml > database defaults

See [docs/CONFIGURATION.md](docs/CONFIGURATION.md) for all options and validation rules.

## Quick Start

### Basic Usage

All tools require an `action` parameter. Example:

```javascript
// Store a decision
{action: "set", key: "auth_method", value: "JWT", layer: "business", tags: ["security"]}

// Query later
{action: "get", key: "auth_method"}
```

For detailed examples, see [docs/TOOL_REFERENCE.md](docs/TOOL_REFERENCE.md).

## Specialized Agents

sqlew provides three specialized agents for efficient multi-agent coordination in Claude Code:

| Agent | Purpose | Token Cost | Use When |
|-------|---------|------------|----------|
| **Scrum Master** | Multi-agent coordination, task management, sprint planning | 12KB/conversation | Coordinating complex features, managing dependencies, tracking progress |
| **Researcher** | Query decisions, analyze patterns, investigate context | 14KB/conversation | Understanding past decisions, onboarding new members, sprint retrospectives |
| **Architect** | Document decisions, enforce constraints, maintain standards | 20KB/conversation | Making architectural choices, establishing rules, validating compliance |

### Installation

**By default, all three specialized agents are automatically installed** to your project's `.claude/agents/` directory on first run.

To disable specific agents, create `.sqlew/config.toml`:

```toml
[agents]
scrum_master = true   # Coordination specialist (12KB)
researcher = false    # Disable this agent
architect = true      # Documentation specialist (20KB)
```

**Note**: Set an agent to `false` in the config file to prevent it from being installed.

**Usage**: Invoke agents with the `@` prefix: `@sqlew-scrum-master`, `@sqlew-researcher`, `@sqlew-architect`

**Recommendation**: Use all three agents together - they're complementary specialists (46KB total).

**Token Optimization** (if needed): Disable unused agents in config.
Savings: Scrum + Architect = 32KB (30%) | Scrum only = 12KB (74%)

**See [docs/SPECIALIZED_AGENTS.md](docs/SPECIALIZED_AGENTS.md) for complete installation guide, usage examples, and customization.**

### Available Tools

| Tool | Purpose | Example Use |
|------|---------|------------|
| **decision** | Record choices | "We chose PostgreSQL" |
| **task** | Track work | "Implement feature X" |
| **file** | Track changes | "Modified auth.ts" |
| **constraint** | Define rules | "API must be <100ms" |
| **stats** | Database metrics | Get layer summary |
| **config** | Retention settings | Auto-cleanup config |

Each tool supports `action: "help"` for full documentation and `action: "example"` for comprehensive usage examples.

## Documentation

### On-Demand Documentation

All tools support:
- `action: "help"` - Parameter reference and descriptions
- `action: "example"` - Usage scenarios and examples

### For AI Agents

**Essential Guides:**
- [Tool Selection](docs/TOOL_SELECTION.md) - Decision tree, when to use each tool
- [Workflows](docs/WORKFLOWS.md) - Multi-step examples, multi-agent coordination
- [Tool Reference](docs/TOOL_REFERENCE.md) - Parameters, batch operations, templates
- [Best Practices](docs/BEST_PRACTICES.md) - Common errors, troubleshooting

**Task System:**
- [Task Overview](docs/TASK_OVERVIEW.md) - Lifecycle, status transitions
- [Task Actions](docs/TASK_ACTIONS.md) - All actions with examples
- [Task Dependencies](docs/TASK_DEPENDENCIES.md) - Blocking relationships
- [Task Linking](docs/TASK_LINKING.md) - Link to decisions/constraints/files
- [Task Migration](docs/TASK_MIGRATION.md) - Migrate from decision-based tracking

**Advanced Features:**
- [Decision Context](docs/DECISION_CONTEXT.md) - Rich decision documentation
- [Auto File Tracking](docs/AUTO_FILE_TRACKING.md) - Zero-token task management
- [Acceptance Criteria](docs/ACCEPTANCE_CRITERIA.md) - All check types

**Reference:**
- [Shared Concepts](docs/SHARED_CONCEPTS.md) - Layer definitions, enum values
- [Configuration](docs/CONFIGURATION.md) - Config file setup, all options
- [Architecture](docs/ARCHITECTURE.md) - Technical architecture

### For Developers

- [Configuration Guide](docs/CONFIGURATION.md) - TOML config file setup
- [Database Migration](docs/DATABASE_MIGRATION.md) - SQLite → MySQL/PostgreSQL migration
- [Building from Source](docs/ARCHITECTURE.md#development) - Setup instructions
- [Migration Guides](docs/MIGRATION_v2.md) - Version upgrade guides

## Use Cases

- **Multi-Agent Coordination**: Orchestrators create tasks, agents send status updates
- **Breaking Change Management**: Record deprecations and add architectural constraints
- **Decision Context**: Document rationale, alternatives considered, and trade-offs
- **Session Continuity**: Save progress in Session 1, resume in Session 2

See [docs/WORKFLOWS.md](docs/WORKFLOWS.md) for detailed multi-step examples.

## Performance

- **Query speed**: 2-50ms
- **Concurrent agents**: 5+ simultaneous
- **Storage efficiency**: ~140 bytes per decision
- **Token savings**: 60-75% in typical projects

## Support

Support development via [GitHub Sponsors](https://github.com/sponsors/sin5ddd) - One-time or monthly options available.

## Version

Current version: **3.6.6**
See [CHANGELOG.md](CHANGELOG.md) for release history.

## License

AGPLv3 - Free to use. Open-source required when embedding or modifying. See [LICENSE](LICENSE) for details.

## Links

- [npm package](https://www.npmjs.com/package/sqlew)
- [GitHub repository](https://github.com/sin5ddd/mcp-sqlew)
- [Model Context Protocol](https://modelcontextprotocol.io/)

## Support & Documentation

- Issues: [GitHub Issues](https://github.com/sin5ddd/mcp-sqlew/issues)
- Docs: [docs/](docs/) directory

## Acknowledgments

Built with [Model Context Protocol SDK](https://github.com/modelcontextprotocol/sdk), [better-sqlite3](https://github.com/WiseLibs/better-sqlite3), and TypeScript.

**Author**: sin5ddd
