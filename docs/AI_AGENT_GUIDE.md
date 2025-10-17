# AI Agent Guide for MCP sqlew

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
2. [When to Use Each Tool: Decision Tree](#when-to-use-each-tool-decision-tree)
3. [Parameter Requirements by Tool](#parameter-requirements-by-tool)
4. [Common Errors & Solutions](#common-errors--solutions)
5. [Search Actions Decision Tree](#search-actions-decision-tree)
6. [Batch Operations Guide](#batch-operations-guide)
7. [Template System](#template-system)
8. [Multi-Step Workflow Examples](#multi-step-workflow-examples)
9. [Best Practices](#best-practices)

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

## When to Use Each Tool: Decision Tree

### Understanding Tool Purposes

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

### Tool Comparison Table

| Tool | Use For | Don't Use For | Key Feature |
|------|---------|---------------|-------------|
| **decision** | Recording choices made | Future work, requirements | Version history tracking |
| **message** | Agent communication | Permanent records, decisions | Priority-based delivery |
| **constraint** | Requirements & rules | Decisions, tasks | Category-based organization |
| **task** | Work tracking (TODO) | Decisions, history | Auto-stale detection |
| **file** | File change tracking | Code search, content | Layer-based organization |
| **stats** | Metrics & cleanup | Data storage | Aggregated views |
| **config** | Retention settings | Business logic | Auto-deletion control |

### Decision vs Constraint vs Task

This is the most common confusion. Here's the distinction:

| Concept | Definition | Example | Tool |
|---------|------------|---------|------|
| **Decision** | A choice that WAS made | "We chose JWT authentication" | `decision` |
| **Constraint** | A requirement that MUST be followed | "Response time must be <100ms" | `constraint` |
| **Task** | Work that NEEDS to be done | "Implement JWT authentication" | `task` |

### Scenario-Based Tool Selection

#### Scenario 1: Breaking API Change
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

#### Scenario 2: Performance Issue
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

#### Scenario 3: Security Vulnerability
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

## Common Errors & Solutions

💡 **See also**: [ARCHITECTURE.md](ARCHITECTURE.md) for detailed layer, enum, and status definitions.

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

## Multi-Step Workflow Examples

This section demonstrates comprehensive multi-agent workflows using multiple tools in coordination.

### Workflow 1: Multi-Agent Feature Implementation

**Scenario**: Orchestrator agent coordinates 3 sub-agents to implement a new authentication feature.

#### Step 1: Orchestrator Creates Plan

```javascript
// 1. Record the architecture decision
{
  action: "set",
  key: "auth_v2_implementation",
  value: "Implement OAuth2 + JWT refresh token system",
  layer: "business",
  tags: ["auth", "feature", "v2.0.0"],
  agent: "orchestrator-agent"
}

// 2. Add architectural constraints
{
  action: "add",
  category: "architecture",
  constraint_text: "All auth tokens must expire within 15 minutes",
  priority: "critical",
  layer: "business",
  tags: ["auth", "security"]
}

// 3. Create tasks for each sub-agent
{
  action: "batch_create",
  atomic: false,
  tasks: [
    {
      title: "Implement OAuth2 provider integration",
      assigned_agent: "backend-agent",
      layer: "business",
      priority: 4,
      tags: ["auth", "oauth2"],
      status: "todo"
    },
    {
      title: "Create JWT token refresh endpoint",
      assigned_agent: "api-agent",
      layer: "presentation",
      priority: 4,
      tags: ["auth", "api"],
      status: "todo"
    },
    {
      title: "Update auth database schema",
      assigned_agent: "db-agent",
      layer: "data",
      priority: 4,
      tags: ["auth", "database"],
      status: "todo"
    }
  ]
}

// 4. Broadcast start message
{
  action: "send",
  from_agent: "orchestrator-agent",
  to_agent: null,  // Broadcast
  msg_type: "info",
  message: "Starting OAuth2 + JWT implementation - check your assigned tasks",
  priority: "high"
}
```

#### Step 2: Backend Agent Executes Task

```javascript
// 1. Mark task as in progress
{
  action: "move",
  task_id: 1,
  new_status: "in_progress"
}

// 2. Record file changes
{
  action: "record_batch",
  atomic: false,
  file_changes: [
    {
      file_path: "src/auth/oauth2.ts",
      agent_name: "backend-agent",
      change_type: "created",
      layer: "business",
      description: "OAuth2 provider integration"
    },
    {
      file_path: "src/auth/jwt.ts",
      agent_name: "backend-agent",
      change_type: "modified",
      layer: "business",
      description: "Added refresh token logic"
    }
  ]
}

// 3. Report completion
{
  action: "send",
  from_agent: "backend-agent",
  to_agent: "orchestrator-agent",
  msg_type: "info",
  message: "OAuth2 provider integration complete",
  priority: "medium",
  payload: {
    files_changed: 2,
    tests_passing: true
  }
}

// 4. Complete task
{
  action: "move",
  task_id: 1,
  new_status: "done"
}
```

#### Step 3: Orchestrator Monitors Progress

```javascript
// 1. Check for updates (efficient polling)
{
  action: "has_updates",
  agent_name: "orchestrator-agent",
  since_timestamp: "2025-10-17T10:00:00Z"
}

// 2. Get task status
{
  action: "list",
  tags: ["auth"],
  assigned_agent: null  // All agents
}

// 3. Get unread messages
{
  action: "get",
  agent_name: "orchestrator-agent",
  unread_only: true,
  priority_filter: "high"
}

// 4. Check constraints compliance
{
  action: "get",
  category: "architecture",
  layer: "business",
  tags: ["auth"]
}
```

---

### Workflow 2: Breaking Change Migration

**Scenario**: API endpoint is being deprecated and migrated to a new version.

#### Phase 1: Announce Deprecation

```javascript
// 1. Record deprecation decision
{
  action: "set_from_template",
  template: "deprecation",
  key: "api_v1_users_endpoint_deprecated",
  value: "/v1/users endpoint deprecated, use /v2/users instead",
  layer: "presentation",
  tags: ["api", "deprecation", "v2.0.0"]
}

// 2. Add migration constraint
{
  action: "add",
  category: "architecture",
  constraint_text: "All new API endpoints must use /v2 prefix",
  priority: "high",
  layer: "presentation",
  tags: ["api", "migration"]
}

// 3. Create migration task
{
  action: "create",
  title: "Update all client integrations to use /v2/users",
  description: "Migrate existing integrations before v1 sunset on 2025-12-01",
  acceptance_criteria: "All clients successfully calling /v2/users with no errors",
  layer: "presentation",
  priority: 3,
  tags: ["migration", "client"],
  status: "todo"
}

// 4. Broadcast warning to all agents
{
  action: "send",
  from_agent: "api-agent",
  to_agent: null,  // Broadcast
  msg_type: "warning",
  message: "/v1/users DEPRECATED - Migrate to /v2/users by Dec 1",
  priority: "critical",
  payload: {
    old_endpoint: "/v1/users",
    new_endpoint: "/v2/users",
    sunset_date: "2025-12-01"
  }
}
```

#### Phase 2: Track Migration Progress

```javascript
// 1. Check file lock before editing
{
  action: "check_lock",
  file_path: "src/api/routes.ts",
  lock_duration: 300  // 5 minutes
}

// 2. Record migration changes
{
  action: "record",
  file_path: "src/api/routes.ts",
  agent_name: "migration-agent",
  change_type: "modified",
  layer: "presentation",
  description: "Added /v2/users endpoint with backwards compatibility"
}

// 3. Link task to decision and constraint
{
  action: "link",
  task_id: 1,
  link_type: "decision",
  target_id: "api_v1_users_endpoint_deprecated",
  link_relation: "implements"
}

{
  action: "link",
  task_id: 1,
  link_type: "constraint",
  target_id: 1,  // The migration constraint ID
  link_relation: "satisfies"
}

// 4. Update task status
{
  action: "move",
  task_id: 1,
  new_status: "waiting_review"
}
```

#### Phase 3: Complete Migration

```javascript
// 1. Record completion decision
{
  action: "set",
  key: "api_v2_migration_complete",
  value: "All clients successfully migrated to /v2/users endpoint",
  layer: "presentation",
  tags: ["api", "migration", "complete"],
  status: "active"
}

// 2. Deactivate old constraint
{
  action: "deactivate",
  constraint_id: 1
}

// 3. Archive completed task
{
  action: "archive",
  task_id: 1
}

// 4. Notify stakeholders
{
  action: "send",
  from_agent: "migration-agent",
  to_agent: null,  // Broadcast
  msg_type: "info",
  message: "Migration to /v2/users complete - /v1 endpoint can be removed",
  priority: "high"
}
```

---

### Workflow 3: Session Continuity (Cross-Session Context)

**Scenario**: Agent needs to resume work after restart or handoff to another agent.

#### Agent A: Record Context Before Exit

```javascript
// 1. Save current work state
{
  action: "set",
  key: "refactor_session_state",
  value: "Completed 3/5 modules - currently working on auth module",
  layer: "business",
  tags: ["refactor", "session-state"],
  scopes: ["auth-module"],
  agent: "refactor-agent-a"
}

// 2. Update task with notes
{
  action: "update",
  task_id: 42,
  notes: "Paused at auth/oauth2.ts line 145 - need to review token refresh logic before proceeding"
}

// 3. Record last file changes
{
  action: "record_batch",
  atomic: false,
  file_changes: [
    {
      file_path: "src/auth/oauth2.ts",
      agent_name: "refactor-agent-a",
      change_type: "modified",
      layer: "business",
      description: "WIP: Token refresh refactoring (incomplete)"
    }
  ]
}

// 4. Send handoff message
{
  action: "send",
  from_agent: "refactor-agent-a",
  to_agent: "refactor-agent-b",
  msg_type: "request",
  message: "Handing off refactor task - see task #42 for context",
  priority: "high",
  payload: {
    task_id: 42,
    last_file: "src/auth/oauth2.ts",
    completion: "60%"
  }
}
```

#### Agent B: Resume Work

```javascript
// 1. Retrieve session state
{
  action: "get",
  key: "refactor_session_state"
}

// 2. Get task details and history
{
  action: "get",
  task_id: 42
}

// 3. Check recent file changes
{
  action: "get",
  file_path: "src/auth/oauth2.ts",
  since: "2025-10-17T00:00:00Z"
}

// 4. Check for any related constraints
{
  action: "get",
  layer: "business",
  tags: ["auth"],
  active_only: true
}

// 5. Check messages
{
  action: "get",
  agent_name: "refactor-agent-b",
  unread_only: true
}

// 6. Acknowledge handoff
{
  action: "send",
  from_agent: "refactor-agent-b",
  to_agent: "refactor-agent-a",
  msg_type: "info",
  message: "Handoff received - resuming work on task #42",
  priority: "medium"
}

// 7. Move task to in_progress
{
  action: "move",
  task_id: 42,
  new_status: "in_progress"
}
```

---

### Workflow 4: Update Polling Pattern (Efficient Subscription)

**Scenario**: Monitor agent watches for specific changes and reacts accordingly.

#### Monitor Agent: Efficient Polling Loop

```javascript
// Initial timestamp
let lastCheck = "2025-10-17T10:00:00Z";

// Polling function (call every 30 seconds)
async function pollForUpdates() {
  // 1. Lightweight check for ANY updates (5-10 tokens)
  const updates = await {
    action: "has_updates",
    agent_name: "monitor-agent",
    since_timestamp: lastCheck
  };

  // Response: {
  //   has_updates: true,
  //   counts: {decisions: 2, messages: 3, files: 1, tasks: 1}
  // }

  if (!updates.has_updates) {
    // Nothing changed - skip heavy queries
    return;
  }

  // 2. Only fetch if updates detected
  if (updates.counts.messages > 0) {
    const messages = await {
      action: "get",
      agent_name: "monitor-agent",
      unread_only: true,
      priority_filter: "critical"
    };

    // Process critical messages
    for (const msg of messages.messages) {
      if (msg.msg_type === "warning") {
        // Handle warning
        await handleWarning(msg);
      }
    }
  }

  // 3. Check for task updates
  if (updates.counts.tasks > 0) {
    const tasks = await {
      action: "list",
      status: "blocked",
      limit: 10
    };

    // Alert on blocked tasks
    if (tasks.length > 0) {
      await {
        action: "send",
        from_agent: "monitor-agent",
        to_agent: "orchestrator-agent",
        msg_type: "warning",
        message: `${tasks.length} tasks are blocked - requires attention`,
        priority: "high"
      };
    }
  }

  // 4. Check for breaking changes
  if (updates.counts.decisions > 0) {
    const breaking = await {
      action: "search_tags",
      tags: ["breaking-change"],
      match_mode: "AND",
      status: "active"
    };

    if (breaking.length > 0) {
      // Alert on breaking changes
      await {
        action: "send",
        from_agent: "monitor-agent",
        to_agent: null,  // Broadcast
        msg_type: "warning",
        message: "New breaking changes detected - review required",
        priority: "critical"
      };
    }
  }

  // 5. Update last check timestamp
  lastCheck = new Date().toISOString();
}

// Token efficiency:
// - No updates: ~10 tokens (has_updates only)
// - With updates: ~50-200 tokens (selective fetching)
// - vs polling all data: ~500-1000 tokens every time
```

#### Activity Log Analysis

```javascript
// Monitor can also analyze activity patterns
{
  action: "activity_log",
  since: "1h",  // Last hour
  agent_names: ["*"],  // All agents
  actions: ["set", "send", "create"],  // Specific actions
  limit: 100
}

// Response shows all activity:
// [
//   {
//     timestamp: "2025-10-17T11:45:23Z",
//     agent_name: "backend-agent",
//     action: "set",
//     table: "decisions",
//     key_or_details: "auth_implementation_complete"
//   },
//   {
//     timestamp: "2025-10-17T11:44:15Z",
//     agent_name: "api-agent",
//     action: "send",
//     table: "messages",
//     key_or_details: "message_id:145"
//   }
// ]

// Use this for:
// - Debugging agent behavior
// - Audit trails
// - Performance monitoring
// - Detecting stuck agents (no activity)
```

#### Automatic Cleanup Trigger

```javascript
// Monitor can also manage database health
{
  action: "db_stats"
}

// Response:
// {
//   total_decisions: 342,
//   total_messages: 1203,
//   total_file_changes: 589,
//   total_constraints: 15,
//   total_tasks: 47,
//   db_size_kb: 1024
// }

// If database too large, trigger cleanup
if (stats.total_messages > 1000) {
  await {
    action: "clear",
    messages_older_than_hours: 24,
    file_changes_older_than_days: 7
  };

  // Notify about cleanup
  await {
    action: "send",
    from_agent: "monitor-agent",
    to_agent: null,
    msg_type: "info",
    message: "Database cleanup completed - removed old messages and file history",
    priority: "low"
  };
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

Layer classification helps organize architectural concerns.

💡 **See [ARCHITECTURE.md](ARCHITECTURE.md#layers) for detailed layer definitions and usage examples.**

Quick reference:
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

### Built-In Documentation (Zero Token Cost)

All tools provide comprehensive built-in documentation with zero upfront token cost:

**Help Action** - Detailed reference documentation:
```javascript
// Get detailed help for any tool
{
  action: "help"
}
```

Returns:
- All actions and their parameters
- Quick examples for each action
- Valid values for enum parameters
- Behavior descriptions
- Links to external documentation

**Example Action** - Comprehensive usage scenarios (v3.0.1):
```javascript
// Get comprehensive examples for any tool
{
  action: "example"
}
```

Returns:
- Real-world usage scenarios by category
- Multi-step workflows
- Best practices specific to the tool
- Common patterns and anti-patterns
- Works offline without WebFetch

### When to Use Each

| Use | Action | What You Get |
|-----|--------|--------------|
| Quick parameter reference | `help` | Action list, parameters, quick examples |
| Comprehensive examples | `example` | Detailed scenarios, workflows, best practices |
| Specific implementation patterns | `example` | Category-based examples (e.g., performance constraints, batch operations) |

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

**Remember**: When in doubt, call `{action: "help"}` for parameters or `{action: "example"}` for comprehensive usage scenarios!
