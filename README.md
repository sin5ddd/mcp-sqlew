# sqlew
![sqlew_logo](assets/sqlew-logo.png)

[![npm version](https://img.shields.io/npm/v/sqlew.svg)](https://www.npmjs.com/package/sqlew)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

> **SQL Efficient Workflow** - MCP server for efficient context sharing between Claude Code sub-agents

## What is sqlew?

**sqlew** is a Model Context Protocol (MCP) server that gives AI agents organizational memory across sessions.

### The Problem
Without sqlew, every Claude session starts with zero context. You must re-explain decisions, agents can reintroduce bugs, and there's no way to track WHY decisions were made.

It has been possible to keep records using Markdown files. However, large-scale projects or long-term maintenance records tend to generate massive amounts of documentation. This has become a problem, as it causes context rot in AI systems, leading to declining performance.

### The Solution
sqlew builds efficient external memory for AI by using relational databases.
- Records the reasoning behind decisions
- Enables querying past context
- Prevents anti-patterns through constraints
- Eliminates duplicate work via task management

**Example:**
- Session 1 records "API v1 deprecated".
- Session 2 (days later) queries and automatically uses v2.

> *This software does not send any data to external networks. We NEVER collect any data or usage statistics. Please use it with complete security.*

## Why Use sqlew?

### 🧠 Organizational Memory
Traditional code analysis like git tells you **WHAT** is done, sqlew adds **WHY** and **HOW** on it:
- **Decisions** → WHY it was changed
- **Constraints** → HOW should it be written
- **Tasks** → WHAT needs to be done

### ⚡ Token Efficiency
**60-75% token reduction** in multi-session projects through structured data storage and selective querying.

### 🎯 Key Features
- **6 Specialized Tools**: decisions, tasks, files, constraints, stats, **suggest** (NEW in v3.9.0)
- **Decision Intelligence**: Auto-suggest similar decisions, duplicate detection, pattern-based search
- **Runtime Reconnection**: Automatic database connection recovery with exponential backoff
- **Parameter Validation**: Typo detection, required/optional markers, 70-85% more concise error messages
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
![kanban-style task management](assets/kanban-visualizer.png)

## Installation

### Requirements
- Node.js 18.0.0 or higher
- npm or npx

### Quick Install

on `.mcp.json` in your project's root, add these lines:

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
**Recommend to restart claude after initialize**

The first time, sqlew install custom agents and initialize database. Custom agents are not loaded in this time. Please exit claude once, and restart claude again.

It's Ready!

**⚠️Note**: Global install (`npm install -g`) is **not recommended** because sqlew requires an independent settings per project. Each project should maintain its own context database in `.sqlew/sqlew.db`.

**Custom database path:** Add path as argument: `"args": ["sqlew", "/path/to/db.db"]`
**Default location:** `.sqlew/sqlew.db`

### Jetbrains Junie AI

**⚠️ Not Supported:** Junie AI cannot use relative paths in MCP server configurations, which makes it incompatible with sqlew's project-based database model. Each project requires its own isolated database at `.sqlew/sqlew.db`, but Junie AI's global MCP configuration cannot handle per-project database paths.

## Configuration

### Database Support

sqlew supports multiple database backends for different deployment scenarios:

| Database | Use Case | Status |
|----------|----------|--------|
| **SQLite** | Development, small projects | ✅ Default |
| **MySQL 8.0 / MariaDB 10+** | Production, shared environments | ✅ Supported |
| **PostgreSQL 12+** | Production, enterprise | ✅ v3.8.0+ |

### Optional Config File

On first run, `.sqlew/config.toml` will be created for persistent settings:

**SQLite (Default):**
```toml
[database]
path = ".sqlew/custom.db"

[autodelete]
ignore_weekend = true
message_hours = 48
```

**PostgreSQL:**
```toml
[database]
type = "postgres"

[database.connection]
host = "localhost"
port = 5432
database = "sqlew_db"

[database.auth]
type = "direct"
user = "sqlew_user"
password = "secret"
```

**MySQL/MariaDB:**
```toml
[database]
type = "mysql"

[database.connection]
host = "localhost"
port = 3306
database = "sqlew_db"

[database.auth]
type = "direct"
user = "sqlew_user"
password = "secret"
```

Also `.sqlew/config.example.toml` is created for reference.

**Settings Priority:** CLI args > config.toml > database defaults

See [docs/CONFIGURATION.md](docs/CONFIGURATION.md) for all options and validation rules.

### CLI Configuration (Recommended)

Configuration is managed via **`.sqlew/config.toml`** file and **CLI arguments only**. The MCP `config` tool has been removed for simplicity.

**Why CLI-only configuration?**
- **No drift:** Single source of truth (config file)
- **Version control:** Commit config to git, share with team
- **Clear documentation:** Config file documents project requirements
- **Type safety:** TOML validation catches errors at startup

**Common CLI arguments:**
```bash
# Custom database path
npx sqlew /path/to/database.db

# Auto-deletion settings
npx sqlew --autodelete-message-hours=48
npx sqlew --autodelete-file-history-days=30
npx sqlew --autodelete-ignore-weekend

# Custom config file
npx sqlew --config-path=.sqlew/custom.toml
```

For persistent settings, edit `.sqlew/config.toml` instead of using CLI arguments.

## Quick Start

install it, launch claude, exit claude and launch Claude again.

### Basic Usage

You'll never need to call it manually, I recommend to call this tool via prompt.

```
read sqlew usecases, and plan implementation of feature X using sqlew.
```

or invoke Specialized Agent

```
plan implementation of feature X with @agent-scrum-master.
```

Specialized Agents use sqlew more efficiently.

## Specialized Agents

sqlew provides three specialized agents for efficient multi-agent coordination in Claude Code:

| Agent | Purpose | Token Cost | Use When |
|-------|---------|------------|----------|
| **Scrum Master** | Multi-agent coordination, task management, sprint planning | 12KB/conversation | Coordinating complex features, managing dependencies, tracking progress |
| **Researcher** | Query decisions, analyze patterns, investigate context | 14KB/conversation | Understanding past decisions, onboarding new members, sprint retrospectives |
| **Architect** | Document decisions, enforce constraints, maintain standards | 20KB/conversation | Making architectural choices, establishing rules, validating compliance |

### Detailed Installation

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

## Slash Commands

Quick-access workflows that invoke specialized agents to use mcp-sqlew tools. Installed automatically to `.claude/commands/` on server startup.

| Command | Purpose | Agent(s) Used |
|---------|---------|---------------|
| `/sqlew-plan` | Comprehensive planning (architecture + tasks) | architect + scrum-master |
| `/sqlew-architect` | Document architectural decisions | architect |
| `/sqlew-scrum` | Sprint/task management | scrum-master |
| `/sqlew-decide` | Quick decision workflow | architect |
| `/sqlew-research` | Query and analyze context | researcher |
| `/sqlew-review` | Code/design review workflow | researcher + architect |

**Usage Examples**:
```bash
/sqlew-plan "Implement user authentication"
/sqlew-decide "Use PostgreSQL for production database"
/sqlew-research "Why did we choose Knex for migrations?"
```

**Configuration**: Edit `.sqlew/config.toml` to customize which commands are installed:
```toml
[commands]
plan = true        # Comprehensive planning workflow
architect = true   # Architectural documentation
scrum = true       # Task management
decide = true      # Quick decisions
research = true    # Context queries
review = true      # Code/design review
```

**See [docs/SLASH_COMMANDS.md](docs/SLASH_COMMANDS.md) for complete guide, usage patterns, and customization.**

### Available Tools

| Tool | Purpose | Example Use |
|------|---------|------------|
| **decision** | Record choices and reasons | "We chose PostgreSQL" |
| **constraint** | Define rules | "DO NOT use raw SQL, use ORM" |
| **task** | Track work | "Implement feature X" |
| **file** | Track changes | "Modified auth.ts" |
| **stats** | Database metrics | Get layer summary |


## Documentation

Each tool supports `action: "help"` for full documentation and `action: "example"` for comprehensive usage examples.

And `action: "use_case"` shows how to use the tool in a real-world scenario.

### On-Demand Documentation

All tools support:
- `action: "help"` - Parameter reference and descriptions
- `action: "example"` - Usage scenarios and examples
- `action: "use_case"` - Real-world usage examples

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
- [CLI Mode Overview](docs/cli/README.md) - Database migration, export/import commands
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

Current version: **3.7.4**
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
