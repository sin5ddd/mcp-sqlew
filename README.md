# sqlew
![sqlew_logo](assets/sqlew-logo.png)

[![npm version](https://img.shields.io/npm/v/sqlew.svg)](https://www.npmjs.com/package/sqlew)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

> **ADR (Architecture Decision Record) for AI Agents** – An MCP server that enables AI agents to create, query, and maintain architecture decision records in a structured SQL database

## What is sqlew?

**sqlew** is a Model Context Protocol (MCP) server that brings ADR (Architecture Decision Record) capabilities to AI agents through a shared SQL-backed repository.

### The Problem: AI Agents Lack Decision Memory
Every AI session starts with zero context. Agents must re-learn architectural decisions, can reintroduce previously rejected patterns, and have no systematic way to understand WHY past choices were made.

Traditional ADR approaches use Markdown files scattered across repositories. While human-readable, this format creates challenges for AI agents:
- **No structured querying** – AI must read entire files to find relevant decisions
- **Context explosion** – Token costs grow linearly with decision history
- **No duplicate detection** – AI cannot easily identify similar or conflicting decisions
- **Poor discoverability** – Finding related decisions requires full-text search across many files

### *sqlew* brings structured ADR to AI agents
sqlew transforms ADR from static documentation into a **queryable, AI-native decision database**:

- **Structured records** – Decisions stored as relational data with metadata, tags, and relationships
- **Efficient querying** – AI agents retrieve only relevant decisions via SQL queries
- **Smart suggestions** – Three-tier similarity system detects duplicate or related decisions
- **Constraint tracking** – Architectural rules and principles as first-class entities
- **Task integration** – Link decisions to implementation tasks and affected files

> *This software does not send any data to external networks. We NEVER collect any data or usage statistics. Please use it with complete security.*

## Concept: ADR (Architecture Decision Record) for AI Agents

**Architecture Decision Records (ADR)** document the architectural decisions made on a project, including context, consequences, and alternatives considered. sqlew extends this proven pattern to AI agents.

### Core ADR Concepts in sqlew

**Decisions** capture architectural choices with full context:
- **What** was decided (the decision itself)
- **Why** it was chosen (rationale, trade-offs)
- **What else** was considered (alternatives rejected)
- **Impact** on the system (consequences, affected components)

**Constraints** define architectural principles and rules:
- **Performance requirements** (response time limits, throughput goals)
- **Technology choices** ("must use PostgreSQL", "avoid microservices")
- **Coding standards** ("async/await only", "no any types")
- **Security policies** (authentication patterns, data handling rules)

**Implementation tracking** connects decisions to reality:
- **Tasks** link decisions to actual implementation work
- **File tracking** shows which code was affected by decisions
- **Status evolution** tracks decision lifecycle (draft → active → deprecated)

### Why SQL for ADR?

Traditional text-based ADR forces AI to:
- Read complete files even for simple queries
- Parse unstructured text to find relationships
- Manually detect duplicate or conflicting decisions

sqlew's **SQL-backed ADR repository** enables AI to:
- Query by layer, tags, status in milliseconds (2-50ms)
- Join decisions with constraints, tasks, and files
- Leverage similarity algorithms to prevent duplicates
- Scale to thousands of decisions without context explosion

**Token efficiency**: 60-75% reduction compared to reading Markdown ADRs

### Why RDBMS + MCP for ADR?

**RDBMS (Relational Database)** provides efficient structured queries:
- **Indexed searches** – Find decisions by tags/layers in milliseconds, not seconds
- **JOIN operations** – Query related decisions, constraints, and tasks in a single operation
- **Transaction support** – ACID guarantees ensure data integrity across concurrent AI agents
- **Scalability** – Handle thousands of ADRs without performance degradation

**MCP (Model Context Protocol)** enables seamless AI integration:
- **Direct tool access** – AI agents call ADR operations as native functions
- **Token efficiency** – Retrieve only required data, avoiding full-file reads
- **Type safety** – Structured parameters prevent errors and guide correct usage
- **Cross-session persistence** – ADRs survive beyond individual chat sessions

**Together**: AI agents gain SQL-powered ADR capabilities without managing databases directly.

## Why Use sqlew?

### 🏛️ ADR Made AI-Native
Traditional ADR approaches weren't designed for AI agents. sqlew reimagines ADR for the AI era:

| Traditional ADR (Markdown) | sqlew ADR (SQL) |
|---------------------------|-----------------|
| Read entire files | Query specific decisions |
| Manual duplicate checking | Automatic similarity detection |
| Text parsing required | Structured, typed data |
| Linear token scaling | Constant-time lookups |
| File-based organization | Relational queries with JOINs |

### 🎯 Key Benefits for AI-Driven Development

#### 📚 **Persistent Architectural Memory**
- **Zero context loss** – AI agents remember every architectural decision across sessions
- **Rationale preservation** – Never forget WHY a decision was made, not just WHAT
- **Alternative tracking** – Document rejected options to prevent circular debates
- **Evolution history** – See how decisions changed over time with full version history

#### 🛡️ **Prevent Architectural Drift**
- **Constraint enforcement** – Define architectural rules once, AI follows them forever
- **Pattern consistency** – AI generates code matching established patterns automatically
- **Anti-pattern prevention** – Document "what NOT to do" as enforceable constraints
- **Regression prevention** – AI won't reintroduce previously rejected approaches

#### 🔍 **Intelligent Decision Discovery**
- **Similarity detection** – AI identifies duplicate or related decisions before creating new ones
- **Context-aware search** – Query by layer, tags, or relationships to find relevant decisions
- **Impact analysis** – Trace which files and tasks are affected by each decision
- **Conflict detection** – Find decisions that contradict or supersede each other

#### 📊 **Implementation Transparency**
- **Decision-to-task linking** – Track implementation status of architectural choices
- **File impact tracking** – See exactly which code implements each decision
- **Status lifecycle** – Draft → Active → Deprecated → Superseded transitions
- **Progress visibility** – Monitor which ADRs are implemented, which are pending

#### ⚡ **Extreme Efficiency**
- **60-75% token reduction** – Query only relevant decisions instead of reading all ADRs
- **Millisecond queries** – 2-50ms response times even with thousands of decisions
- **Scalable architecture** – Perform well with large decision histories
- **Production-ready** – 495/495 tests passing (100%), battle-tested on real projects

---

**Technical Features**: 8 MCP tools (5 core: decision, constraint, task, file, suggest + 3 utility: help, example, use_case), three-tier similarity detection (0-100 point scoring), ACID transaction support, multi-database backend (SQLite/PostgreSQL/MySQL), metadata-driven organization with layers and tags

See [docs/DECISION_CONTEXT.md](docs/DECISION_CONTEXT.md) for ADR data model details.

### 🔖Kanban-style AI Scrum
![kanban-style task management](assets/kanban-visualizer.png)

(This visualizer is not included in this package)

## Installation

### Requirements
- Node.js 20.0.0 or higher
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

The first time, sqlew initializes database, installs custom agents and slash commands. But agents and commands are not loaded in this time. So, please exit claude once, and restart claude again.

It's Ready!

## 🚀 Quick Start: /sqlew Command

**The `/sqlew` command is the easiest way to use sqlew!** Just type `/sqlew` in Claude Code with natural language input.

### Most Common Uses

```bash
# Show status and get suggestions
/sqlew

# Record a decision
/sqlew record we use PostgreSQL 15 for production database

# Search past decisions
/sqlew search why we chose Knex for migrations

# List remaining tasks
/sqlew show remaining tasks

# Plan a new feature (breakdown into tasks)
/sqlew plan implementing user authentication
```

The `/sqlew` command automatically detects your intent (search, record, list, execute, task creation) and invokes the appropriate MCP tools.

---

**⚠️Note**: Global install (`npm install -g`) is **not recommended** because sqlew requires an independent settings per project. Each project should maintain its own context database in `.sqlew/sqlew.db`.

**Custom database path:** Add path as argument: `"args": ["sqlew", "/path/to/db.db"]`
**Default location:** `.sqlew/sqlew.db`

**⚠️ Not Supported:** Junie AI cannot use relative paths in MCP server configurations, which makes it incompatible with sqlew's project-based database model. Each project requires its own isolated database at `.sqlew/sqlew.db`, but Junie AI's global MCP configuration cannot handle per-project database paths.

## Configuration

### Database Support

sqlew supports multiple database backends for different deployment scenarios:

| Database | Use Case                                     | Status      |
|----------|----------------------------------------------|-------------|
| **SQLite** | Personal or small projects                   | ✅ Default   |
| **MySQL 8.0 / MariaDB 10+** | Production, shared environments, remote work | ✅ Supported |
| **PostgreSQL 12+** | Production, shared environments, remote work | ✅ Supported |

Of course, it also works with Docker RDB instances.

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
/sqw-plan implementation of feature X .
```

Specialized Agents use sqlew more efficiently.

---

**Note**: The `/sqlew` command supersedes the previous multi-command system (`/sqw-plan`, `/sqw-scrum`, etc.). All functionality is now available through the unified `/sqlew` interface with automatic intent detection.

### Advanced: Direct MCP Tool Access

Power users can still call MCP tools directly. See [Available Tools](#available-tools) section below.

### Available Tools

#### Core ADR Tools

| Tool | Purpose | Example Use |
|------|---------|------------|
| **decision** | Record architectural decisions with context | "We chose PostgreSQL over MongoDB (ACID requirement)" |
| **constraint** | Define architectural rules and principles | "All API endpoints must use /v2/ prefix" |
| **task** | Track implementation of decisions | "Implement JWT authentication" |
| **file** | Track code changes linked to decisions | "Modified auth.ts per security ADR" |
| **suggest** | Find similar decisions, prevent duplicates | Duplicate detection, similarity search |

#### Utility Tools

| Tool | Purpose | Example Use |
|------|---------|------------|
| **help** | Query action documentation and parameters | Get decision.set parameters |
| **example** | Browse code examples by tool/action | Find task.create examples |
| **use_case** | Complete workflow scenarios | Multi-step ADR workflows |


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
- [Decision Intelligence](docs/DECISION_INTELLIGENCE.md) - Three-tier duplicate detection (v3.9.0)
- [Decision Context](docs/DECISION_CONTEXT.md) - Rich decision documentation
- [Auto File Tracking](docs/AUTO_FILE_TRACKING.md) - Zero-token task management
- [Acceptance Criteria](docs/ACCEPTANCE_CRITERIA.md) - All check types

**Reference:**
- [Shared Concepts](docs/SHARED_CONCEPTS.md) - Layer definitions, enum values
- [Configuration](docs/CONFIGURATION.md) - Config file setup, all options
- [Architecture](docs/ARCHITECTURE.md) - Technical architecture

### Advanced Usage

- [Configuration Guide](docs/CONFIGURATION.md) - TOML config file setup
- [CLI Mode Overview](docs/cli/README.md) - Database migration, export/import commands
- [Building from Source](docs/ARCHITECTURE.md#development) - Setup instructions
- [Migration Guides](docs/MIGRATION_v2.md) - Version upgrade guides

## Use Cases

### ADR-Driven Development with AI
- **Architecture Evolution** – Document major architectural decisions with full context and alternatives
- **Pattern Standardization** – Establish coding patterns as constraints, enforce via AI code generation
- **Technical Debt Tracking** – Record temporary decisions with deprecation paths and future plans
- **Onboarding Acceleration** – New AI sessions instantly understand architectural history

### Cross-Session AI Workflows
- **Multi-Session Projects** – AI maintains context across days/weeks without re-reading documentation
- **Multi-Agent Coordination** – Multiple AI agents share architectural understanding through ADR database
- **Breaking Change Management** – Document API changes, deprecations, and migration paths systematically
- **Refactoring Guidance** – AI references past decisions to maintain architectural consistency during refactors

### Real-World Examples
```bash
# Document an architectural decision with alternatives
/sqlew record we use PostgreSQL over MongoDB. MongoDB was rejected due to lack of ACID transactions for our financial data requirements.

# Search for past decisions before making new ones
/sqlew search why did we choose JWT authentication

# Create constraint to guide AI code generation
/sqlew add constraint all API endpoints must use /v2/ prefix for versioning

# Plan implementation of a decision
/sqlew plan implementing the PostgreSQL connection pool with pgBouncer
```

See [docs/WORKFLOWS.md](docs/WORKFLOWS.md) for detailed multi-step examples.

## Performance

- **Query speed**: 2-50ms
- **Concurrent agents**: 5+ simultaneous
- **Storage efficiency**: ~140 bytes per decision
- **Token savings**: 60-75% in typical projects

## Support

Support development via [GitHub Sponsors](https://github.com/sponsors/sin5ddd) - One-time or monthly options available.

## Version

Current version: **4.0.2**
See [CHANGELOG.md](CHANGELOG.md) for release history.

**What's New in v4.0.2:**
- **Unified CLI Entry Point** - `npx sqlew db:export` works directly (no `npm install` required)
- **Cross-DB Migration via JSON Only** - SQL dump no longer supports cross-database conversion
- **Node.js 20+ Required** - Updated minimum version requirement

**What's New in v4.0.0:**
- **Schema Refactoring** - Unified v4_ table prefix, agent system completely removed
- **Clean Schema** - No legacy columns, optimized for Decision & Constraint repository
- **Improved Migration System** - Reorganized v3/v4 directories

See [docs/DECISION_INTELLIGENCE.md](docs/DECISION_INTELLIGENCE.md) for details on the suggest tool.

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
