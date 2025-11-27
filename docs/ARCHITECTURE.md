# sqlew Architecture Documentation

## Overview

sqlew (SQL Efficient Workflow) is an MCP server designed to achieve **72% token reduction** in context sharing between Claude Code agents through intelligent database design and metadata-driven architecture. **Version 4.0.0** introduces a major schema refactoring with unified v4_ table prefix and action-based MCP tool architecture.

## Core Design Principles

### 1. Token Efficiency Strategy

The 72% token reduction is achieved through five key strategies:

| Strategy | Description | Savings |
|----------|-------------|---------|
| **ID-Based Normalization** | Store strings once in master tables, reference by integer IDs | ~50% |
| **Integer Enums** | Replace string values with integers (status, priority, etc.) | 70-75% |
| **Pre-Aggregated Views** | Eliminate need for multiple joins in client code | ~85% |
| **Type-Based Separation** | Separate tables for numeric vs string values | ~50% |
| **Automatic Cleanup** | Prevent database bloat via triggers | N/A |

### 2. Metadata-Driven Classification

sqlew organizes data through five metadata dimensions:

| Dimension | Purpose | Example |
|-----------|---------|---------|
| **Tags** | Flexible cross-cutting categorization | authentication, security, api |
| **Layers** | Architecture layer organization (9 layers) | business, data, infrastructure |
| **Scopes** | Module/component-level organization | user-service, api-gateway |
| **Versions** | Automatic version history tracking | 1.0.0, 1.1.0 |
| **Priority** | Importance levels (1-4) | low, medium, high, critical |

### 3. Layer System (v4.0)

9 layers organized by file requirement:

**FILE_REQUIRED (6 layers):**
- presentation, business, data, infrastructure, cross-cutting, documentation

**FILE_OPTIONAL (3 layers):**
- planning, coordination, review

### 4. Data Integrity

- **Foreign Key Constraints**: All relationships enforced via SQLite
- **Transaction Guarantees**: ACID properties, WAL mode for concurrency
- **Auto-Registration Pattern**: Master records auto-created on first use

## Database Schema (v4.0)

All tables use unified `v4_` prefix. For detailed schema, see `src/database/migrations/v4/`.

### Master Tables (Normalization)

| Table | Purpose |
|-------|---------|
| `v4_files` | Normalize file paths |
| `v4_context_keys` | Normalize decision keys |
| `v4_layers` | Architecture layers (9 seeded) |
| `v4_tags` | Categorization tags (10 seeded, auto-expandable) |
| `v4_scopes` | Module/component scopes |
| `v4_constraint_categories` | Constraint types (performance, architecture, security) |
| `v4_task_statuses` | Task status types (pending, in_progress, completed, blocked, on_hold) |
| `v4_config` | Configuration storage |

### Transaction Tables (Core Data)

| Table | Purpose |
|-------|---------|
| `v4_decisions` | Store decisions with layer, status, version |
| `v4_decision_history` | Version history for all decision changes |
| `v4_decision_context` | Decision context (rationale, alternatives, tradeoffs) |
| `v4_file_changes` | Track file modifications with layer |
| `v4_constraints` | Project constraints with priority |
| `v4_tasks` | Task management with kanban-style status |

### Relationship Tables

| Table | Purpose |
|-------|---------|
| `v4_decision_tags` | Decision ↔ Tags (many-to-many) |
| `v4_decision_scopes` | Decision ↔ Scopes (many-to-many) |
| `v4_task_file_links` | Task ↔ Files with action types |
| `v4_task_dependencies` | Task dependencies with circular detection |

### Pre-Aggregated Views

| View | Purpose |
|------|---------|
| `v4_tagged_decisions` | Decisions with all metadata (tags, layers, scopes) |
| `v4_layer_summary` | Per-layer aggregated statistics |
| `v4_recent_file_changes` | Recent file changes with metadata |
| `v4_tagged_constraints` | Constraints with category and layer |
| `v4_task_board` | Kanban-style task view with dependencies |

## MCP Tool Architecture

### Action-Based Tool System (v4.0)

6 consolidated action-based MCP tools:

| Tool | Purpose | Key Actions |
|------|---------|-------------|
| **decision** | Decision context management | set, get, list, search, versions |
| **file** | File change tracking | record, get, check_lock |
| **constraint** | Constraint management | add, get, deactivate |
| **task** | Task management with dependencies | create, update, move, link, list |
| **help** | Documentation queries | query_action, query_tool, workflow_hints |
| **suggest** | Decision intelligence | by_key, by_tags, check_duplicate |

All tools support `action: "help"` for in-tool documentation.

## Performance Characteristics

### Query Performance

| Operation | Avg Time |
|-----------|----------|
| decision.set | 2-5 ms |
| decision.get | 5-15 ms |
| file.record | 2-4 ms |
| task.create | 3-7 ms |

### Database Size

- **Empty:** ~28 KB (schema + seed data)
- **Growth Rate:** ~140 bytes/decision (linear)

### Concurrent Access

- **WAL Mode:** Enabled for read/write concurrency
- **Busy Timeout:** 5000ms

## File Structure

| Component | Location |
|-----------|----------|
| MCP Server | `src/index.ts` |
| Database Init | `src/database/initialization/` |
| Migrations | `src/database/migrations/v4/` |
| Tool Implementations | `src/tools/` |
| Types | `src/types.ts` |
| Constants | `src/constants.ts` |

## Known Limitations

1. **No Semantic Search:** Delegated to specialized tools like Serena
2. **Single Project Scope:** Not multi-tenant
3. **No Authentication:** Trust-based (local MCP server)
4. **No Network Access:** Offline-only operation

## Version History

| Version | Key Changes |
|---------|-------------|
| **v4.0.0** | Unified v4_ prefix, agent system removed, 6 action-based tools, 9 layers |
| v3.9.0 | Decision Intelligence System, suggestion policies |
| v3.8.0 | Layer expansion (5→9), file_actions parameter |
| v3.0.0 | Kanban task system, 7-tool consolidation |
| v2.0 | Action-based API, 96% token reduction |

## Related Documentation

- [SHARED_CONCEPTS.md](SHARED_CONCEPTS.md) - Common concepts across tools
- [TOOL_REFERENCE.md](TOOL_REFERENCE.md) - Complete tool parameter reference
- [CONFIGURATION.md](CONFIGURATION.md) - Configuration options
- [TASK_OVERVIEW.md](TASK_OVERVIEW.md) - Task management overview
