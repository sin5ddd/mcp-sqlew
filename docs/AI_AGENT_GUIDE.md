# AI Agent Guide for MCP sqlew

**Quick Reference for Claude Code and other AI agents using sqlew (v4.0.0+)**

## Most Important Rule

**ALWAYS include the `action` parameter in EVERY tool call.** This is the #1 cause of errors.

```javascript
// WRONG - Missing action
{
  key: "some_key",
  value: "some value"
}

// CORRECT - action parameter present
{
  action: "set",
  key: "some_key",
  value: "some value"
}
```

---

## Quick Start

### Basic Decision Workflow

```javascript
// 1. Set a decision
{
  action: "set",
  key: "auth_method",
  value: "jwt",
  layer: "business",
  tags: ["security", "authentication"]
}

// 2. Get the decision
{
  action: "get",
  key: "auth_method"
}

// 3. List decisions with filters
{
  action: "list",
  status: "active",
  layer: "business"
}
```

---

## When to Use Each Tool

| Tool | Use For | Key Feature |
|------|---------|-------------|
| **decision** | Recording choices made | Version history tracking |
| **constraint** | Requirements & rules | Category-based organization |
| **task** | Work tracking (TODO) | Kanban status, dependencies |
| **file** | File change tracking | Layer-based organization |
| **stats** | Metrics & cleanup | Aggregated views |

### Decision vs Constraint vs Task

| Concept | Definition | Example |
|---------|------------|---------|
| **Decision** | A choice that WAS made | "We chose JWT authentication" |
| **Constraint** | A requirement that MUST be followed | "Response time must be <100ms" |
| **Task** | Work that NEEDS to be done | "Implement JWT authentication" |

### Quick Scenario

```javascript
// 1. Record decision
{ action: "set", key: "api_change", value: "Moved to /v2/users", layer: "presentation", tags: ["api"] }

// 2. Add constraint
{ action: "add", category: "architecture", constraint_text: "All API endpoints must include version prefix", layer: "presentation" }

// 3. Create task
{ action: "create", title: "Migrate clients to /v2/users", layer: "presentation", tags: ["migration"] }
```

---

## Common Errors & Solutions

### Error: "Unknown action: undefined"

**Cause**: Missing `action` parameter

```javascript
// WRONG
{ key: "some_key", value: "some value" }

// CORRECT
{ action: "set", key: "some_key", value: "some value" }
```

### Error: "Invalid layer"

**Valid layers** (9 total):
- `presentation`, `business`, `data`, `infrastructure`, `cross-cutting`
- `documentation`, `planning`, `coordination`, `review`

### Error: "Invalid status"

**Valid decision statuses**: `active`, `deprecated`, `draft`

**Valid task statuses**: `pending`, `in_progress`, `blocked`, `on_hold`, `completed`

### Error: "Batch operations are limited to 50 items maximum"

**Solution**: Split into multiple batches of ≤50 items each

---

## Key Parameters Quick Reference

### decision tool

| Action | Required | Optional |
|--------|----------|----------|
| **set** | action, key, value, layer | version, status, tags, scopes |
| **get** | action, key | version |
| **list** | action | status, layer, tags, limit |

### task tool

| Action | Required | Optional |
|--------|----------|----------|
| **create** | action, title | description, priority, layer, tags, status |
| **move** | action, task_id, status | - |
| **list** | action | status, layer, tags, limit |

### constraint tool

| Action | Required | Optional |
|--------|----------|----------|
| **add** | action, category, constraint_text | priority, layer, tags |
| **get** | action | category, layer, active_only |

> **Full parameter reference**: See [TOOL_REFERENCE.md](TOOL_REFERENCE.md)

---

## Best Practices Summary

1. **Always include `action` parameter** - #1 error source
2. **Use `atomic: false` for batch operations** - Avoid all-or-nothing failures
3. **Always specify `layer`** - Required for organization
4. **Use meaningful tags** - Critical for searchability
5. **Use `status` (not `new_status`)** for task.move action

> **Detailed best practices**: See [BEST_PRACTICES.md](BEST_PRACTICES.md)

---

## Built-In Documentation

All tools provide built-in help with zero token cost:

```javascript
// Get detailed help for any tool
{ action: "help" }

// Get comprehensive examples
{ action: "example" }
```

---

## Related Documentation

| Document | Content |
|----------|---------|
| [TOOL_REFERENCE.md](TOOL_REFERENCE.md) | Complete parameter reference |
| [WORKFLOWS.md](WORKFLOWS.md) | Multi-step workflow examples |
| [BEST_PRACTICES.md](BEST_PRACTICES.md) | Detailed best practices |
| [DECISION_INTELLIGENCE.md](DECISION_INTELLIGENCE.md) | Decision duplicate detection |
| [CONSTRAINT_INTELLIGENCE.md](CONSTRAINT_INTELLIGENCE.md) | Constraint duplicate detection |
| [BATCH_VALIDATION.md](BATCH_VALIDATION.md) | Batch operations guide |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System architecture |

---

## Most Common Mistakes

1. **Missing `action` parameter** ← #1 error!
2. Invalid layer/status values
3. Forgetting to specify `layer` when setting decisions
4. Using `atomic: true` by default in batch operations
5. Using `new_status` instead of `status` for task.move

**When in doubt**: Call `{action: "help"}` or `{action: "example"}`!
