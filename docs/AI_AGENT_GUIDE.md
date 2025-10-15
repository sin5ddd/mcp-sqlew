# AI Agent Guide for MCP SQLew

**Quick Reference for Claude Code and other AI agents using sqlew**

## 🚨 Most Important Rule

**ALWAYS include the `action` parameter in EVERY tool call.** This is the #1 cause of errors.

```javascript
// ❌ WRONG - Missing action
{
  key: "some_key",
  value: "some value"
}

// ✅ CORRECT - action parameter present
{
  action: "set",
  key: "some_key",
  value: "some value"
}
```

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Parameter Requirements by Tool](#parameter-requirements-by-tool)
3. [Common Errors & Solutions](#common-errors--solutions)
4. [Search Actions Decision Tree](#search-actions-decision-tree)
5. [Batch Operations Guide](#batch-operations-guide)
6. [Template System](#template-system)
7. [Best Practices](#best-practices)

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

### Basic Messaging Workflow

```javascript
// 1. Send a message
{
  action: "send",
  from_agent: "bot1",
  msg_type: "info",
  message: "Task completed successfully",
  priority: "high"
}

// 2. Get messages
{
  action: "get",
  agent_name: "bot1",
  unread_only: true
}

// 3. Mark as read
{
  action: "mark_read",
  agent_name: "bot1",
  message_ids: [1, 2, 3]
}
```

---

## Parameter Requirements by Tool

### `decision` Tool

| Action | Required | Optional |
|--------|----------|----------|
| **set** | action, key, value, layer | agent, version, status, tags, scopes |
| **get** | action, key | version |
| **list** | action | status, layer, tags, scope, tag_match, limit, offset |
| **search_tags** | action, tags | match_mode, status, layer |
| **search_layer** | action, layer | status, include_tags |
| **versions** | action, key | - |
| **quick_set** | action, key, value | agent, layer, version, status, tags, scopes |
| **search_advanced** | action | layers, tags_all, tags_any, exclude_tags, scopes, updated_after, updated_before, decided_by, statuses, search_text, sort_by, sort_order, limit, offset |
| **set_batch** | action, decisions | atomic |
| **has_updates** | action, agent_name, since_timestamp | - |
| **set_from_template** | action, template, key, value, layer | agent, version, status, tags, scopes |
| **create_template** | action, name, defaults | required_fields, created_by |
| **list_templates** | action | - |

### `message` Tool

| Action | Required | Optional |
|--------|----------|----------|
| **send** | action, from_agent, msg_type, message | to_agent, priority, payload |
| **get** | action, agent_name | unread_only, priority_filter, msg_type_filter, limit |
| **mark_read** | action, agent_name, message_ids | - |
| **send_batch** | action, messages | atomic |

### `file` Tool

| Action | Required | Optional |
|--------|----------|----------|
| **record** | action, file_path, agent_name, change_type | layer, description |
| **get** | action | file_path, agent_name, layer, change_type, since, limit |
| **check_lock** | action, file_path | lock_duration |
| **record_batch** | action, file_changes | atomic |

### `constraint` Tool

| Action | Required | Optional |
|--------|----------|----------|
| **add** | action, category, constraint_text | priority, layer, tags, created_by |
| **get** | action | category, layer, priority, tags, active_only, limit |
| **deactivate** | action, constraint_id | - |

### `stats` Tool

| Action | Required | Optional |
|--------|----------|----------|
| **layer_summary** | action | - |
| **db_stats** | action | - |
| **clear** | action | messages_older_than_hours, file_changes_older_than_days |
| **activity_log** | action | since, agent_names, actions, limit |

### `config` Tool

| Action | Required | Optional |
|--------|----------|----------|
| **get** | action | - |
| **update** | action | ignoreWeekend, messageRetentionHours, fileHistoryRetentionDays |

---

## Common Errors & Solutions

### Error: "Unknown action: undefined"

**Cause**: Missing `action` parameter

**Solution**: Always include `action` as the first parameter

```javascript
// ❌ WRONG
{
  key: "some_key",
  value: "some value",
  layer: "business"
}

// ✅ CORRECT
{
  action: "set",
  key: "some_key",
  value: "some value",
  layer: "business"
}
```

### Error: "Parameter \"value\" is required"

**Cause**: Using `defaults` instead of direct parameters with templates

**Solution**: Provide parameters directly, not nested in `defaults`

```javascript
// ❌ WRONG
{
  action: "set_from_template",
  template: "deprecation",
  key: "some_key",
  defaults: {
    value: "...",
    layer: "cross-cutting"
  }
}

// ✅ CORRECT
{
  action: "set_from_template",
  template: "deprecation",
  key: "some_key",
  value: "...",
  layer: "cross-cutting"
}
```

### Error: "Invalid layer"

**Cause**: Using a layer name that doesn't exist

**Solution**: Use one of the 5 standard layers

**Valid layers**: `presentation`, `business`, `data`, `infrastructure`, `cross-cutting`

```javascript
// ❌ WRONG
{
  action: "set",
  key: "my_key",
  value: "my_value",
  layer: "backend"  // Invalid!
}

// ✅ CORRECT
{
  action: "set",
  key: "my_key",
  value: "my_value",
  layer: "business"  // Valid!
}
```

### Error: "Invalid status"

**Cause**: Using a status value that doesn't exist

**Solution**: Use one of the 3 valid statuses

**Valid statuses**: `active`, `deprecated`, `draft`

### Error: "Batch operations are limited to 50 items maximum"

**Cause**: Too many items in batch array

**Solution**: Split into multiple batches of ≤50 items each

---

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

## Batch Operations Guide

### Atomic vs Non-Atomic Mode

**Atomic Mode** (`atomic: true`, default):
- All succeed or all fail as a single transaction
- If ANY item fails, entire batch is rolled back
- Error is thrown immediately on first failure
- Use for: Critical operations requiring consistency

**Non-Atomic Mode** (`atomic: false`, **recommended for AI agents**):
- Each item processed independently
- If some fail, others still succeed
- Returns partial results with per-item success/error status
- Use for: Best-effort batch operations, when individual failures are acceptable

### Batch Operation Examples

#### Decision Batch (Recommended: atomic: false)

```javascript
{
  action: "set_batch",
  atomic: false,  // Recommended for AI agents
  decisions: [
    {
      key: "feature-1",
      value: "Implemented user authentication",
      layer: "business",
      tags: ["feature", "auth"],
      status: "active"
    },
    {
      key: "feature-2",
      value: "Added rate limiting",
      layer: "infrastructure",
      tags: ["feature", "security"],
      status: "active"
    }
  ]
}
```

**Response Format:**
```json
{
  "success": true,
  "inserted": 2,
  "failed": 0,
  "results": [
    {
      "key": "feature-1",
      "key_id": 123,
      "version": "1.0.0",
      "success": true
    },
    {
      "key": "feature-2",
      "key_id": 124,
      "version": "1.0.0",
      "success": true
    }
  ]
}
```

#### Message Batch

```javascript
{
  action: "send_batch",
  atomic: false,
  messages: [
    {
      from_agent: "bot1",
      msg_type: "info",
      message: "Task 1 completed",
      priority: "medium"
    },
    {
      from_agent: "bot1",
      msg_type: "info",
      message: "Task 2 completed",
      priority: "medium"
    }
  ]
}
```

#### File Change Batch

```javascript
{
  action: "record_batch",
  atomic: false,
  file_changes: [
    {
      file_path: "src/types.ts",
      agent_name: "refactor-bot",
      change_type: "modified",
      layer: "data"
    },
    {
      file_path: "src/index.ts",
      agent_name: "refactor-bot",
      change_type: "modified",
      layer: "infrastructure"
    }
  ]
}
```

### Batch Limits

- **Maximum items per batch**: 50
- **Recommended batch size**: 10-20 (for readability and debugging)
- **Token savings**: ~52% vs individual calls

---

## Template System

### What are Templates?

Templates provide reusable defaults for common decision patterns.

### Built-in Templates

1. **breaking_change**: Breaking API/interface changes
2. **security_vulnerability**: Security issues
3. **performance_optimization**: Performance improvements
4. **deprecation**: Deprecation notices
5. **architecture_decision**: Major architectural decisions

### Using Templates

```javascript
{
  action: "set_from_template",
  template: "breaking_change",
  key: "oscillator-type-moved",
  value: "oscillator_type moved to MonophonicSynthConfig",
  // Optional overrides:
  tags: ["migration", "v0.3.3"],
  status: "active"
}
```

### Template vs Direct Parameters

**When to use `set_from_template`**:
- You have a common decision pattern
- You want consistent metadata (tags, status, layer)
- You want to enforce required fields

**When to use `set`**:
- One-off decisions
- Unique metadata requirements
- Full control over all parameters

### Creating Custom Templates

```javascript
{
  action: "create_template",
  name: "bug_fix",
  defaults: {
    layer: "business",
    tags: ["bug", "fix"],
    status: "active"
  },
  required_fields: ["version"],
  created_by: "my-agent"
}
```

### Listing Templates

```javascript
{
  action: "list_templates"
}
```

---

## Best Practices

### 1. Always Use `action` Parameter

**Never forget to include `action`** - it's required in ALL tool calls.

### 2. Use `atomic: false` for Batch Operations

Unless you specifically need all-or-nothing guarantees, use `atomic: false` to avoid transaction failures from validation errors.

### 3. Choose the Right Search Action

- Simple queries → `list`
- Tag-focused → `search_tags`
- Complex multi-filter → `search_advanced`

### 4. Use Templates for Common Patterns

If you're repeatedly setting decisions with the same metadata, create a template.

### 5. Provide Meaningful Tags

Tags are crucial for searchability. Use descriptive, consistent tag naming:

```javascript
// ✅ GOOD
tags: ["authentication", "security", "jwt", "v1.2.0"]

// ❌ BAD
tags: ["stuff", "important", "thing"]
```

### 6. Always Specify `layer` for Decisions

Layer classification helps organize architectural concerns:

- **presentation**: UI, API endpoints, user-facing interfaces
- **business**: Service logic, workflows, business rules
- **data**: Database models, schemas, data access
- **infrastructure**: Configuration, deployment, DevOps
- **cross-cutting**: Logging, monitoring, security (affects multiple layers)

### 7. Use `has_updates` for Efficient Polling

Instead of fetching all data repeatedly, check for updates first:

```javascript
// Check if anything changed
{
  action: "has_updates",
  agent_name: "my-agent",
  since_timestamp: "2025-10-15T08:00:00Z"
}

// Response: {has_updates: true, counts: {decisions: 5, messages: 2, files: 3}}

// Only fetch if has_updates is true
```

Token cost: ~5-10 tokens per check vs full data retrieval.

### 8. Handle Errors Gracefully

All tools return JSON responses. Check for `error` field:

```javascript
// Response format
{
  "error": "Invalid layer: backend"
}

// Success format
{
  "success": true,
  "key": "my_key",
  ...
}
```

### 9. Use Constraints for Requirements

**Constraint** vs **Decision**:

- **Decision**: "We chose PostgreSQL" (a choice that was made)
- **Constraint**: "Response time must be <100ms" (a requirement to follow)

```javascript
{
  action: "add",
  category: "performance",
  constraint_text: "API response time must be under 100ms",
  priority: "critical",
  layer: "business",
  tags: ["api", "performance"]
}
```

### 10. Clean Up Old Data Regularly

Use the `clear` action to prevent database bloat:

```javascript
// Manual cleanup
{
  action: "clear",
  messages_older_than_hours: 48,
  file_changes_older_than_days: 14
}

// Or rely on auto-cleanup (configured via config tool)
{
  action: "update",
  ignoreWeekend: true,
  messageRetentionHours: 24,
  fileHistoryRetentionDays: 7
}
```

---

## Troubleshooting Checklist

Before asking for help, check:

1. ✅ Did you include the `action` parameter?
2. ✅ Are all required parameters provided?
3. ✅ Are enum values spelled correctly? (layer, status, msg_type, etc.)
4. ✅ For templates: Are you passing parameters directly (not in `defaults`)?
5. ✅ For batch operations: Is array size ≤50?
6. ✅ For timestamps: Are you using ISO 8601 format?

---

## Need More Help?

Use the built-in help action for any tool:

```javascript
// Get detailed help for decision tool
{
  action: "help"
}
```

This returns comprehensive documentation with:
- All actions and their parameters
- Examples for each action
- Valid values for enum parameters
- Behavior descriptions

---

## Summary: Most Common Mistakes

1. **Missing `action` parameter** ← #1 error!
2. Using `defaults` instead of direct parameters with templates
3. Invalid layer/status/priority values (use exact strings)
4. Forgetting to specify `layer` when setting decisions
5. Using `atomic: true` by default in batch operations (use `false`)
6. Using wrong search action (`list` vs `search_tags` vs `search_advanced`)
7. Empty arrays in batch operations
8. Typos in parameter names (e.g., `messsage` instead of `message`)

---

**Remember**: When in doubt, call `{action: "help"}` on any tool!
