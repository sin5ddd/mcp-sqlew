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

## ⚠️ Decision vs Task: WHY vs WHAT

**Critical distinction**: `decision` stores WHY (reasoning), `task` stores WHAT (work status).

| Question | Answer | Tool |
|----------|--------|------|
| **WHY** did we choose this approach? | "Chose JWT because stateless auth scales horizontally" | **decision** |
| **WHAT** needs to be done? | "Implement JWT authentication (status: in_progress)" | **task** |
| **WHY** was this bug introduced? | "Nested transaction bug: setDecision wraps in transaction, batch also wraps" | **decision** |
| **WHAT** is the completion status? | "Fixed nested transaction bug (status: done)" | **task** |

### Common Mistakes

```javascript
// ❌ WRONG - Using decision for task completion
{
  action: "set",
  key: "jwt-implementation-complete",
  value: "JWT authentication implemented. All tests passing."
}
// This is WHAT was done (completion status), not WHY decisions were made.
// FIX: Use task tool for tracking implementation progress.

// ✅ CORRECT - Using decision for architectural reasoning
{
  action: "set",
  key: "api/auth/jwt-choice",
  value: "Chose JWT over sessions because: (1) Stateless design scales, (2) Mobile clients cache tokens, (3) Microservice auth requires distributed validation."
}
// This explains WHY JWT was chosen with architectural reasoning.

// ✅ CORRECT - Using task for work tracking
{
  action: "create",
  title: "Implement JWT authentication with refresh tokens",
  status: "in_progress",
  assigned_agent: "backend-agent"
}
// This tracks WHAT work is being done and its current status.
```

💡 **See [BEST_PRACTICES.md](BEST_PRACTICES.md#critical-what-to-store-in-decisions) for detailed examples of WHY vs WHAT.**

## Scenario-Based Tool Selection

### Scenario 1: Breaking API Change

```javascript
// 1. Record the decision (WHY the change was necessary)
{
  action: "set",
  key: "api/v2/versioning-decision",
  value: "Moved /users to /v2/users because: (1) Enables backward compatibility via versioning, (2) Allows gradual client migration without breaking production apps, (3) Future API changes won't force all clients to update simultaneously. Trade-off: More complex routing layer, but necessary for production stability with 50+ client apps.",
  layer: "presentation",
  tags: ["api", "versioning", "architecture-decision"]
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
// 1. Record the analysis and solution decision (WHY this approach)
{
  action: "set",
  key: "db/user_sessions/index-strategy",
  value: "Adding composite index (user_id, created_at DESC) to user_sessions table because: (1) Query analysis shows 300% latency increase from full table scans on 10M+ rows, (2) 95% of queries filter by user_id + sort by timestamp, (3) Index reduces query time from 850ms to <50ms in staging tests. Trade-off: 15% slower inserts and 200MB additional storage, but read performance critical for user experience.",
  layer: "data",
  tags: ["performance", "database", "indexing-strategy"]
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
// 1. Record the solution decision (WHY this mitigation approach)
{
  action: "set",
  key: "security/jwt/timing-attack-mitigation",
  value: "Upgrading JWT library to v9.2.0+ and implementing constant-time comparison because: (1) CVE-2025-1234 timing attack allows token forgery via timing analysis, (2) Library v9.2.0+ includes constant-time string comparison preventing timing leaks, (3) Alternative approach (rewriting auth layer) would take 3 weeks vs 2-day upgrade. Trade-off: Breaking change requires updating all microservices, but security risk is critical and affects all user sessions.",
  layer: "business",
  tags: ["security", "authentication", "mitigation-strategy"]
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
