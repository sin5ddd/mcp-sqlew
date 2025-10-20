# Tool Reference

**Complete technical reference for all sqlew MCP tools**

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
| **get** | action, key | version, include_context |
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
| **add_decision_context** | action, key, rationale | alternatives_considered, tradeoffs, decided_by, related_task_id, related_constraint_id |
| **list_decision_contexts** | action | decision_key, related_task_id, related_constraint_id, decided_by, limit, offset |

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
| **flush** | action | - |

### `config` Tool

| Action | Required | Optional |
|--------|----------|----------|
| **get** | action | - |
| **update** | action | ignoreWeekend, messageRetentionHours, fileHistoryRetentionDays |

### `task` Tool

| Action | Required | Optional |
|--------|----------|----------|
| **create** | action, title | description, acceptance_criteria, notes, priority, assigned_agent, created_by_agent, layer, tags, status |
| **update** | action, task_id | title, priority, assigned_agent, layer, description, acceptance_criteria, notes |
| **get** | action, task_id | - |
| **list** | action | status, assigned_agent, layer, tags, limit, offset |
| **move** | action, task_id, new_status | - |
| **link** | action, task_id, link_type, target_id | link_relation |
| **archive** | action, task_id | - |
| **batch_create** | action, tasks | atomic |

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

## Decision Context System (v3.2.2)

### What is Decision Context?

Decision Context allows you to attach rich documentation to decisions, including:
- **Rationale**: WHY the decision was made
- **Alternatives Considered**: What options were evaluated and rejected
- **Tradeoffs**: Pros and cons analysis

### Key Features

- **Multi-Session Development**: Preserve decision reasoning across days/weeks
- **Architecture Reviews**: Document non-standard choices for future developers
- **Team Handoffs**: Transfer knowledge with full context
- **Linked Relationships**: Connect contexts to tasks and constraints

### Adding Decision Context

```javascript
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
  },
  decided_by: "backend-team",
  related_task_id: 42
}
```

**Response:**
```json
{
  "success": true,
  "context_id": 1,
  "decision_key": "database_choice",
  "message": "Decision context added successfully"
}
```

### Retrieving Decision with Context

```javascript
// Standard get (backward compatible)
{
  action: "get",
  key: "database_choice"
}
// → Returns: { key, value, layer, status, version, tags, ... }

// Get with context
{
  action: "get",
  key: "database_choice",
  include_context: true
}
// → Returns: { key, value, ..., contexts: [{rationale, alternatives_considered, tradeoffs, ...}] }
```

### Listing Decision Contexts

```javascript
// List all contexts
{
  action: "list_decision_contexts",
  limit: 50
}

// Filter by decision key
{
  action: "list_decision_contexts",
  decision_key: "database_choice"
}

// Filter by related task
{
  action: "list_decision_contexts",
  related_task_id: 42
}
```

**Response:**
```json
{
  "success": true,
  "contexts": [
    {
      "id": 1,
      "decision_key": "database_choice",
      "rationale": "Selected PostgreSQL because...",
      "alternatives_considered": [...],
      "tradeoffs": {...},
      "decided_by": "backend-team",
      "decision_date": "2025-10-18T06:48:00Z",
      "related_task_id": 42,
      "related_constraint_id": null
    }
  ],
  "count": 1
}
```

### Parameter Details

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| **key** | string | ✅ | Decision key to attach context to |
| **rationale** | string | ✅ | WHY the decision was made |
| **alternatives_considered** | JSON array | ❌ | List of {option, reason} objects |
| **tradeoffs** | JSON object | ❌ | {pros: [...], cons: [...]} analysis |
| **decided_by** | string | ❌ | Agent/team who made the decision |
| **related_task_id** | number | ❌ | Link to implementation task |
| **related_constraint_id** | number | ❌ | Link to system constraint |

### When to Use Decision Context

✅ **Use for:**
- Architectural decisions with multiple viable options
- Non-obvious implementation choices
- Breaking changes that need justification
- Security/performance trade-off analysis
- Cross-team collaboration documentation

❌ **Don't use for:**
- Routine implementation details
- Temporary decisions
- Obvious or standard choices

### Best Practices

1. **Be Specific**: "Chose X because Y" not "Chose X"
2. **Document Alternatives**: Show what was considered and rejected
3. **Quantify Tradeoffs**: "5ms overhead acceptable for security" not "minor overhead"
4. **Link to Tasks**: Connect decision context to implementation tasks
5. **Update Over Time**: Add new contexts as decisions evolve

### See Also

- **[Decision Context Guide](DECISION_CONTEXT.md)** - Comprehensive examples and workflows (500+ lines)
- **[Workflows](WORKFLOWS.md)** - Multi-step decision context workflows

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

## Valid Values Reference

### Layers

💡 **See [ARCHITECTURE.md](ARCHITECTURE.md#layers) for detailed layer definitions.**

Quick reference:
- **presentation**: UI, API endpoints, user-facing interfaces
- **business**: Service logic, workflows, business rules
- **data**: Database models, schemas, data access
- **infrastructure**: Configuration, deployment, DevOps
- **cross-cutting**: Logging, monitoring, security (affects multiple layers)

### Statuses

- **active**: Currently active decision/constraint
- **deprecated**: No longer recommended but still valid
- **draft**: Work in progress, not finalized

### Message Types

- **decision**: Notification about a decision made
- **warning**: Alert about issues or concerns
- **request**: Request for action or input
- **info**: General informational message

### Priorities

- **low** (1): Non-urgent, can wait
- **medium** (2): Normal priority (default)
- **high** (3): Important, address soon
- **critical** (4): Urgent, immediate attention required

### Change Types (File)

- **created**: New file created
- **modified**: Existing file changed
- **deleted**: File removed

### Task Statuses

- **todo**: Not started
- **in_progress**: Currently being worked on
- **waiting_review**: Completed, awaiting review
- **blocked**: Cannot proceed due to blocker
- **done**: Completed successfully
- **archived**: No longer relevant

### Constraint Categories

- **performance**: Performance requirements
- **architecture**: Architectural rules
- **security**: Security requirements

---

## Help Actions

All tools support `action: "help"` for comprehensive on-demand documentation:

```javascript
// Get detailed help for decision tool
{
  action: "help"
}
```

This returns:
- All actions and their parameters
- Examples for each action
- Valid values for enum parameters
- Behavior descriptions

---

## Related Documentation

- **[TOOL_SELECTION.md](TOOL_SELECTION.md)** - Choosing the right tool for your task
- **[WORKFLOWS.md](WORKFLOWS.md)** - Multi-step workflow examples
- **[BEST_PRACTICES.md](BEST_PRACTICES.md)** - Common errors and best practices
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Layer definitions and system architecture
- **[AI_AGENT_GUIDE.md](AI_AGENT_GUIDE.md)** - Complete guide (original comprehensive version)
