# Tool Selection Guide

**Quick reference for choosing the right sqlew tool for your task**

## Understanding Tool Purposes

Each tool serves a distinct purpose in the MCP sqlew ecosystem:

```
┌──────────────────────────────────────────────────────────┐
│ What do you need to do?                                  │
└────────────────┬─────────────────────────────────────────┘
                 │
                 ├─ Record a CHOICE that was made?
                 │  └─> Use `decision` tool
                 │      • Examples: "We chose JWT auth", "Selected PostgreSQL"
                 │      • Key: Captures PAST decisions
                 │      • Supports: versioning, tags, layers, scopes
                 │
                 ├─ Communicate with other agents?
                 │  └─> Use `message` tool
                 │      • Examples: Task updates, warnings, requests
                 │      • Key: Real-time communication
                 │      • Supports: priority, broadcast, read tracking
                 │
                 ├─ Define a REQUIREMENT that must be followed?
                 │  └─> Use `constraint` tool
                 │      • Examples: "API must be <100ms", "Code coverage >80%"
                 │      • Key: Enforces RULES
                 │      • Supports: priority, categories, layers
                 │
                 ├─ Track WORK to be done?
                 │  └─> Use `task` tool
                 │      • Examples: "Implement feature X", "Fix bug Y"
                 │      • Key: Tracks TODO items and progress
                 │      • Supports: status transitions, auto-stale, linking
                 │
                 ├─ Record file modifications?
                 │  └─> Use `file` tool
                 │      • Examples: Track changes, check locks
                 │      • Key: File change history
                 │      • Supports: layers, change types, lock detection
                 │
                 └─ Get statistics or manage data?
                    └─> Use `stats` or `config` tools
                        • stats: Database metrics, cleanup, activity logs
                        • config: Retention settings, auto-deletion
```

## Tool Comparison Table

| Tool | Use For | Don't Use For | Key Feature |
|------|---------|---------------|-------------|
| **decision** | Recording choices made | Future work, requirements | Version history tracking |
| **message** | Agent communication | Permanent records, decisions | Priority-based delivery |
| **constraint** | Requirements & rules | Decisions, tasks | Category-based organization |
| **task** | Work tracking (TODO) | Decisions, history | Auto-stale detection |
| **file** | File change tracking | Code search, content | Layer-based organization |
| **stats** | Metrics & cleanup | Data storage | Aggregated views |
| **config** | Retention settings | Business logic | Auto-deletion control |

## Decision vs Constraint vs Task

This is the most common confusion. Here's the distinction:

| Concept | Definition | Example | Tool |
|---------|------------|---------|------|
| **Decision** | A choice that WAS made | "We chose JWT authentication" | `decision` |
| **Constraint** | A requirement that MUST be followed | "Response time must be <100ms" | `constraint` |
| **Task** | Work that NEEDS to be done | "Implement JWT authentication" | `task` |

## Scenario-Based Tool Selection

### Scenario 1: Breaking API Change

```javascript
// 1. Record the decision (what changed)
{
  action: "set",
  key: "api_v2_breaking_change",
  value: "Moved /users endpoint to /v2/users",
  layer: "presentation",
  tags: ["api", "breaking-change", "v2.0.0"]
}

// 2. Add a constraint (requirement going forward)
{
  action: "add",
  category: "architecture",
  constraint_text: "All API endpoints must include version prefix",
  layer: "presentation",
  tags: ["api", "versioning"]
}

// 3. Create migration task
{
  action: "create",
  title: "Migrate clients to /v2/users endpoint",
  status: "todo",
  layer: "presentation",
  tags: ["migration", "v2.0.0"]
}

// 4. Notify other agents
{
  action: "send",
  from_agent: "api-agent",
  msg_type: "warning",
  message: "Breaking change: /users moved to /v2/users",
  priority: "critical"
}
```

### Scenario 2: Performance Issue

```javascript
// 1. Record the finding (decision to investigate)
{
  action: "set",
  key: "db_performance_issue_found",
  value: "Query latency increased 300% in production",
  layer: "data",
  tags: ["performance", "database", "production"]
}

// 2. Add performance constraint
{
  action: "add",
  category: "performance",
  constraint_text: "Database queries must complete within 50ms",
  priority: "high",
  layer: "data"
}

// 3. Create optimization task
{
  action: "create",
  title: "Add indexes to user_sessions table",
  status: "in_progress",
  priority: 4,
  layer: "data",
  tags: ["performance", "database"]
}
```

### Scenario 3: Security Vulnerability

```javascript
// 1. Record the vulnerability (decision about issue)
{
  action: "set",
  key: "auth_vulnerability_CVE_2025_1234",
  value: "JWT library vulnerable to timing attacks",
  layer: "business",
  tags: ["security", "vulnerability", "auth"]
}

// 2. Add security constraint
{
  action: "add",
  category: "security",
  constraint_text: "All auth tokens must use constant-time comparison",
  priority: "critical",
  layer: "business"
}

// 3. Create fix task
{
  action: "create",
  title: "Upgrade JWT library and implement constant-time comparison",
  status: "in_progress",
  priority: 4,
  assigned_agent: "security-agent",
  layer: "business"
}

// 4. Alert all agents
{
  action: "send",
  from_agent: "security-agent",
  to_agent: null,  // Broadcast
  msg_type: "warning",
  message: "URGENT: Auth vulnerability found, fix in progress",
  priority: "critical"
}
```

## Search Actions Decision Tree

### When to use which search action?

```
┌─────────────────────────────────────┐
│ What do you want to search by?     │
└──────────┬──────────────────────────┘
           │
           ├─ Simple filters (status, layer, tags)?
           │  └─> Use action: "list"
           │
           ├─ Primarily by tags?
           │  └─> Use action: "search_tags"
           │      • match_mode: "AND" (all tags) or "OR" (any tag)
           │
           ├─ Primarily by layer?
           │  └─> Use action: "search_layer"
           │
           ├─ Complex multi-filter query?
           │  └─> Use action: "search_advanced"
           │      • Multiple layers (OR)
           │      • Tag combinations (AND/OR)
           │      • Temporal filtering
           │      • Full-text search
           │      • Pagination
           │
           └─ Need version history?
              └─> Use action: "versions"
```

### Detailed Search Comparison

| Action | Use When | Key Features |
|--------|----------|--------------|
| **list** | Basic filtering | Simple status/layer/tag filters, no pagination |
| **search_tags** | Tag-focused search | AND/OR logic for tags, optional status/layer |
| **search_layer** | Layer-focused search | Get all decisions in specific layer(s) |
| **search_advanced** | Complex queries | Full filtering, pagination, sorting, text search |
| **versions** | History tracking | Get all versions of a specific decision |

---

## Related Documentation

- **[TOOL_REFERENCE.md](TOOL_REFERENCE.md)** - Complete parameter reference for all tools
- **[WORKFLOWS.md](WORKFLOWS.md)** - Multi-step workflow examples
- **[BEST_PRACTICES.md](BEST_PRACTICES.md)** - Common errors and best practices
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Layer definitions and system architecture
