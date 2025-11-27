# Task Actions Reference

**Version:** 4.0.0
**Last Updated:** 2025-11-27

## Table of Contents

1. [Overview](#overview)
2. [Action: create](#action-create)
3. [Action: update](#action-update)
4. [Action: get](#action-get)
5. [Action: list](#action-list)
6. [Action: move](#action-move)
7. [Action: link](#action-link)
8. [Action: archive](#action-archive)
9. [Action: create_batch](#action-create_batch)
10. [Action: add_dependency](#action-add_dependency) (NEW in 3.2.0)
11. [Action: remove_dependency](#action-remove_dependency) (NEW in 3.2.0)
12. [Action: get_dependencies](#action-get_dependencies) (NEW in 3.2.0)
13. [Action: help](#action-help)
14. [Best Practices](#best-practices)
15. [Common Errors](#common-errors)
16. [Related Documentation](#related-documentation)

## Overview

The `task` MCP tool provides 12 actions for managing tasks in the Kanban Task Watcher system. All actions require the `action` parameter.

**NEW in v3.2.0:** Task Dependencies - Manage blocking relationships between tasks with circular dependency detection.

**Action-Based API Pattern:**
```javascript
{
  action: "create",  // Required: specifies which action to execute
  // ... action-specific parameters
}
```

## Action: create

Create a new task.

### Parameters

**Required:**
- `action`: "create"
- `title`: Task title (string)

**Optional:**
- `description`: Full task description (string)
- `status`: Initial status (string: "todo", "in_progress", "waiting_review", "blocked", "done", "archived", "rejected") - default: "todo"
- `priority`: Priority level (string: "low", "medium", "high", "critical")
- `assignee`: User or agent assigned (string)
- `tags`: Array of tags (string[])
- `layer`: Architecture layer (string: "presentation", "business", "data", "infrastructure", "cross-cutting", "documentation", "planning", "coordination", "review")

### Examples

**Minimal Task:**
```javascript
{
  action: "create",
  title: "Implement JWT authentication"
}
```

**Complete Task:**
```javascript
{
  action: "create",
  title: "Implement JWT authentication",
  description: "Add JWT-based authentication with refresh tokens",
  status: "todo",
  priority: "high",
  assignee: "dev-team-1",
  tags: ["security", "authentication"],
  layer: "business"
}
```

**Task with Multiple Tags:**
```javascript
{
  action: "create",
  title: "Optimize database queries",
  description: "Improve query performance for user listings",
  priority: "medium",
  tags: ["performance", "database", "optimization"],
  layer: "data"
}
```

### Response

```javascript
{
  task_id: 1,
  message: "Task created successfully"
}
```

## Action: update

Update existing task fields.

### Parameters

**Required:**
- `action`: "update"
- `task_id`: Task ID (number)

**Optional (at least one required):**
- `title`: New title (string)
- `status`: New status (string) - bypasses validation, use `move` instead
- `description`: New description (string)
- `priority`: New priority (string)
- `assignee`: New assignee (string)
- `tags`: New tags array (string[]) - replaces existing tags
- `layer`: New layer (string)

### Examples

**Update Description:**
```javascript
{
  action: "update",
  task_id: 1,
  description: "Updated requirements: Add OAuth2 support"
}
```

**Update Priority:**
```javascript
{
  action: "update",
  task_id: 1,
  priority: "critical"
}
```

**Update Multiple Fields:**
```javascript
{
  action: "update",
  task_id: 1,
  description: "Add OAuth2 and SAML support",
  priority: "critical",
  tags: ["security", "authentication", "oauth2", "saml"]
}
```

**Reassign Task:**
```javascript
{
  action: "update",
  task_id: 1,
  assignee: "lead-dev",
  priority: "high"
}
```

### Response

```javascript
{
  success: true,
  message: "Task updated successfully"
}
```

### Important Notes

- Use `move` action for status changes (validates transitions)
- `update` bypasses state machine validation
- Updating `tags` replaces all existing tags (not append)

## Action: get

Get single task with full details.

### Parameters

**Required:**
- `action`: "get"
- `task_id`: Task ID (number)

**Optional (NEW in 3.2.0):**
- `include_dependencies`: Include dependency arrays (boolean) - default: false

### Examples

**Basic Get:**
```javascript
{
  action: "get",
  task_id: 1
}
```

**Get with Dependencies:**
```javascript
{
  action: "get",
  task_id: 1,
  include_dependencies: true
}
```

### Response

**Without Dependencies:**
```javascript
{
  task_id: 1,
  title: "Implement JWT authentication",
  description: "Add JWT-based authentication with refresh tokens",
  status: "in_progress",
  priority: "high",
  assignee: "auth-agent",
  layer: "business",
  tags: ["security", "authentication"],
  created_ts: 1697545200,
  updated_ts: 1697545800,
  decision_links: ["auth_method", "jwt_secret"],
  constraint_links: [5],
  file_links: ["/src/auth/jwt.ts", "/src/auth/middleware.ts"]
}
```

**With Dependencies (NEW in 3.2.0):**
```javascript
{
  task_id: 1,
  title: "Implement JWT authentication",
  description: "Add JWT-based authentication with refresh tokens",
  // ... other fields ...
  dependencies: {
    blockers: [3, 5],    // Tasks blocking this task
    blocking: [2, 7]     // Tasks this task blocks
  },
  decision_links: ["auth_method", "jwt_secret"],
  constraint_links: [5],
  file_links: ["/src/auth/jwt.ts", "/src/auth/middleware.ts"]
}
```

### Token Efficiency

- **~332 bytes/task** (includes description and links)
- Use `list` for browsing, `get` only when details needed

## Action: list

List tasks with filtering (metadata only, no descriptions).

### Parameters

**Required:**
- `action`: "list"

**Optional:**
- `status`: Filter by status (string)
- `priority`: Filter by priority (string)
- `assignee`: Filter by assignee (string)
- `tags`: Filter by tags (string[])
- `layer`: Filter by layer (string)
- `limit`: Maximum results (number) - default: 100
- `include_dependency_counts`: Include dependency counts (boolean) - default: false (NEW in 3.2.0)

### Examples

**List All Tasks:**
```javascript
{
  action: "list"
}
```

**Filter by Status:**
```javascript
{
  action: "list",
  status: "in_progress"
}
```

**Filter by Assignee:**
```javascript
{
  action: "list",
  assignee: "dev-team-1"
}
```

**Multiple Filters:**
```javascript
{
  action: "list",
  status: "in_progress",
  assignee: "auth-agent",
  tags: ["security"],
  priority: "high"
}
```

**Limit Results:**
```javascript
{
  action: "list",
  status: "todo",
  limit: 20
}
```

**With Dependency Counts (NEW in 3.2.0):**
```javascript
{
  action: "list",
  status: "in_progress",
  include_dependency_counts: true
}
```

### Response

**Without Dependency Counts:**
```javascript
{
  tasks: [
    {
      task_id: 1,
      title: "Implement JWT authentication",
      status_name: "in_progress",
      priority_name: "high",
      assignee: "dev-team-1",
      layer_name: "business",
      tags: "security,authentication",
      created_ts: 1697545200,
      updated_ts: 1697545800
    },
    {
      task_id: 2,
      title: "Setup OAuth2 provider",
      status_name: "in_progress",
      priority_name: "high",
      assignee: "dev-team-1",
      layer_name: "business",
      tags: "security,oauth2",
      created_ts: 1697545300,
      updated_ts: 1697545900
    }
  ],
  count: 2,
  stale_tasks_transitioned: 0
}
```

**With Dependency Counts (NEW in 3.2.0):**
```javascript
{
  tasks: [
    {
      task_id: 1,
      title: "Implement JWT authentication",
      status_name: "in_progress",
      priority_name: "high",
      assignee: "dev-team-1",
      layer_name: "business",
      tags: "security,authentication",
      created_ts: 1697545200,
      updated_ts: 1697545800,
      blocked_by_count: 0,    // Nothing blocks this task
      blocking_count: 2       // This blocks 2 tasks
    },
    {
      task_id: 2,
      title: "Setup OAuth2 provider",
      status_name: "in_progress",
      priority_name: "high",
      assignee: "dev-team-1",
      layer_name: "business",
      tags: "security,oauth2",
      created_ts: 1697545300,
      updated_ts: 1697545900,
      blocked_by_count: 1,    // 1 task blocks this
      blocking_count: 0       // This doesn't block anything
    }
  ],
  count: 2,
  stale_tasks_transitioned: 0
}
```

### Token Efficiency

- **~100 bytes/task** (metadata only)
- **70% reduction** vs full task with description
- Auto-stale detection runs before list
- Returns `stale_tasks_transitioned` count

## Action: move

Move task to new status with validation.

### Parameters

**Required:**
- `action`: "move"
- `task_id`: Task ID (number)
- `status`: Target status (string: "todo", "in_progress", "waiting_review", "blocked", "done", "archived", "rejected")

**Optional:**
- `rejection_reason`: Reason for rejection (string, only when status="rejected")

### Examples

**Move to Waiting Review:**
```javascript
{
  action: "move",
  task_id: 1,
  status: "waiting_review"
}
```

**Move to Blocked:**
```javascript
{
  action: "move",
  task_id: 1,
  status: "blocked"
}
```

**Move to Done:**
```javascript
{
  action: "move",
  task_id: 1,
  status: "done"
}
```

**Move to Rejected (v4.1.0):**
```javascript
{
  action: "move",
  task_id: 1,
  status: "rejected",
  rejection_reason: "Requirements changed"
}
```

### Response (Success)

```javascript
{
  success: true,
  message: "Task moved from in_progress to waiting_review"
}
```

### Response (Invalid Transition)

```javascript
{
  error: "Invalid status transition from archived to todo. Terminal statuses cannot transition."
}
```

### State Machine Validation (v4.1.0 - Relaxed Rules)

**Valid Transitions:**

| Status Type | Statuses | Can Transition To |
|-------------|----------|-------------------|
| **Non-terminal** | todo, in_progress, waiting_review, blocked, done | Any status |
| **Terminal** | archived, rejected | None |

- Non-terminal statuses can freely transition to any other status
- Terminal statuses (`archived`, `rejected`) cannot transition
- `rejected` accepts optional `rejection_reason` parameter

**Auto-Stale Detection:**
- Runs before move operation
- Returns `stale_tasks_transitioned` count

## Action: link

Link task to decision, constraint, or file.

### Parameters

**Required:**
- `action`: "link"
- `task_id`: Task ID (number)
- `link_type`: Link type (string: "decision", "constraint", "file")

**Type-Specific Required Parameters:**
- `link_type="decision"`: `link_key` (string) - Decision key
- `link_type="constraint"`: `link_id` (number) - Constraint ID
- `link_type="file"`: `link_path` (string) - File path

### Examples

**Link to Decision:**
```javascript
{
  action: "link",
  task_id: 1,
  link_type: "decision",
  link_key: "auth_method"
}
```

**Link to Constraint:**
```javascript
{
  action: "link",
  task_id: 1,
  link_type: "constraint",
  link_id: 5
}
```

**Link to File:**
```javascript
{
  action: "link",
  task_id: 1,
  link_type: "file",
  link_path: "/src/auth/jwt.ts"
}
```

**Multiple Links:**
```javascript
// Link to decision
{
  action: "link",
  task_id: 1,
  link_type: "decision",
  link_key: "auth_method"
}

// Link to constraint
{
  action: "link",
  task_id: 1,
  link_type: "constraint",
  link_id: 5
}

// Link to file
{
  action: "link",
  task_id: 1,
  link_type: "file",
  link_path: "/src/auth/jwt.ts"
}
```

### Response

```javascript
{
  success: true,
  message: "Task linked to decision 'auth_method'"
}
```

**Linking Strategies:** Use decision links for architectural context, constraint links for requirements tracking, and file links for code traceability.

## Action: archive

Archive completed task (soft delete).

**Note:** Tasks in `done` status are automatically archived after 48 hours (configurable via `auto_archive_done_days`). Manual archiving is useful for immediate archival needs.

### Parameters

**Required:**
- `action`: "archive"
- `task_id`: Task ID (number)

### Example

**Manual Archive:**
```javascript
{
  action: "archive",
  task_id: 1
}
```

**Auto-Archive Configuration:**
```javascript
// Change auto-archive threshold (via config tool)
{
  action: "update",
  auto_archive_done_days: "3"  // Archive after 3 days instead of default 2 days
}
```

### Response (Success)

```javascript
{
  success: true,
  message: "Task archived successfully"
}
```

### Response (Error)

```javascript
{
  error: "Cannot archive task not in done status"
}
```

### Important Notes

- Only tasks with `status="done"` can be archived
- Archived tasks have `status="archived"` (terminal state)
- Use `move` to transition to `done` first if needed

**Workflow:**
```javascript
// 1. Complete task
{ action: "move", task_id: 1, status: "done" }

// 2. Archive task
{ action: "archive", task_id: 1 }
```

## Action: create_batch

Create multiple tasks atomically or best-effort.

### Parameters

**Required:**
- `action`: "create_batch"
- `tasks`: Array of task objects (max 50)

**Optional:**
- `atomic`: Boolean (default: true) - All-or-nothing vs best-effort mode

### Examples

**Atomic Batch (All-or-Nothing):**
```javascript
{
  action: "create_batch",
  tasks: [
    {
      title: "Setup database schema",
      status: "todo",
      priority: "high",
      assignee: "dev-team-1"
    },
    {
      title: "Implement API endpoints",
      status: "todo",
      priority: "medium",
      assignee: "dev-team-2"
    }
  ],
  atomic: true  // All succeed or all fail
}
```

**Best-Effort Batch (Recommended for AI):**
```javascript
{
  action: "create_batch",
  tasks: [
    {
      title: "Setup database schema",
      status: "todo",
      priority: "high",
      assignee: "dev-team-1",
      tags: ["database", "setup"]
    },
    {
      title: "Implement API endpoints",
      status: "todo",
      priority: "medium",
      assignee: "dev-team-2",
      tags: ["api", "development"]
    },
    {
      title: "Write integration tests",
      status: "todo",
      priority: "low",
      assignee: "dev-team-3",
      tags: ["testing", "qa"]
    }
  ],
  atomic: false  // Allows partial success
}
```

### Response (Atomic=true, Success)

```javascript
{
  success: true,
  created_count: 2,
  task_ids: [1, 2]
}
```

### Response (Atomic=false, Partial Success)

```javascript
{
  success: true,
  created_count: 2,
  failed_count: 1,
  task_ids: [1, 2],
  errors: ["Task 3: Invalid priority 'ultra-high'"]
}
```

### Important Notes

- **Max 50 tasks** per batch
- **Atomic mode (true):** Transaction fails if any task fails
- **Best-effort mode (false):** Partial success allowed (recommended for AI)
- Each task follows same schema as `create` action

## Action: add_dependency

Add a blocking relationship between two tasks (NEW in 3.2.0).

### Parameters

**Required:**
- `action`: "add_dependency"
- `blocker_task_id`: Task ID that blocks (number)
- `blocked_task_id`: Task ID that is blocked (number)

### Validations

- No self-dependencies (task cannot block itself)
- No circular dependencies (direct or transitive)
- Both tasks must exist
- Neither task can be archived

### Examples

**Basic Dependency:**
```javascript
{
  action: "add_dependency",
  blocker_task_id: 1,
  blocked_task_id: 2
}
```

**Sequential Workflow:**
```javascript
// Task #1: Implement auth (must complete first)
// Task #2: Add profile page (depends on auth)

{
  action: "add_dependency",
  blocker_task_id: 1,
  blocked_task_id: 2
}
```

### Response

```javascript
{
  success: true,
  message: "Dependency added: Task #1 blocks Task #2"
}
```

### Error Examples

**Self-Dependency:**
```javascript
{
  action: "add_dependency",
  blocker_task_id: 1,
  blocked_task_id: 1
}
// Error: "Self-dependency not allowed"
```

**Circular Dependency:**
```javascript
// Existing: Task #1 blocks Task #2

{
  action: "add_dependency",
  blocker_task_id: 2,
  blocked_task_id: 1
}
// Error: "Circular dependency detected: Task #2 already blocks Task #1"
```

**Archived Task:**
```javascript
{
  action: "add_dependency",
  blocker_task_id: 10,  // archived
  blocked_task_id: 2
}
// Error: "Cannot add dependency: Task #10 is archived"
```

### Notes

- Uses recursive CTE for transitive cycle detection
- Depth limit: 100 levels
- CASCADE deletion: Dependencies auto-delete when tasks are deleted

## Action: remove_dependency

Remove a blocking relationship between two tasks (NEW in 3.2.0).

### Parameters

**Required:**
- `action`: "remove_dependency"
- `blocker_task_id`: Task ID that blocks (number)
- `blocked_task_id`: Task ID that is blocked (number)

### Example

```javascript
{
  action: "remove_dependency",
  blocker_task_id: 1,
  blocked_task_id: 2
}
```

### Response

```javascript
{
  success: true,
  message: "Dependency removed: Task #1 no longer blocks Task #2"
}
```

### Notes

- Idempotent: Succeeds silently if dependency doesn't exist
- Use when task completed early or requirements changed
- Unblocks dependent tasks

## Action: get_dependencies

Query dependencies for a task bidirectionally (NEW in 3.2.0).

### Parameters

**Required:**
- `action`: "get_dependencies"
- `task_id`: Task to query dependencies for (number)

**Optional:**
- `include_details`: Include full task metadata (boolean) - default: false

### Examples

**Metadata-Only (Recommended):**
```javascript
{
  action: "get_dependencies",
  task_id: 2
}
```

**With Full Details:**
```javascript
{
  action: "get_dependencies",
  task_id: 2,
  include_details: true
}
```

### Response

**Metadata-Only:**
```javascript
{
  task_id: 2,
  blockers: [1, 3],    // Task IDs only (~30 bytes)
  blocking: [5, 7]
}
```

**With Details:**
```javascript
{
  task_id: 2,
  blockers: [
    {
      task_id: 1,
      title: "Implement JWT authentication",
      status: "in_progress",
      priority: "high"
    },
    {
      task_id: 3,
      title: "Design user schema",
      status: "done",
      priority: "medium"
    }
  ],
  blocking: [
    {
      task_id: 5,
      title: "Add profile page",
      status: "todo",
      priority: "medium"
    },
    {
      task_id: 7,
      title: "Add settings page",
      status: "todo",
      priority: "low"
    }
  ]
}
```

### Token Efficiency

- **Metadata-only:** ~30 bytes (IDs only)
- **With details:** ~250 bytes per task
- **Savings:** ~88% token reduction with metadata approach

### Use Cases

- Find what's blocking a task (`blockers`)
- Find what's waiting for a task (`blocking`)
- Identify bottlenecks (high `blocking` count)
- Plan work order

## Action: help

Get comprehensive on-demand documentation.

### Parameters

**Required:**
- `action`: "help"

### Example

```javascript
{
  action: "help"
}
```

### Response

Returns complete tool documentation including:
- Parameter matrices for all actions
- Examples for each action
- Status transition rules
- Token efficiency tips
- Common errors and solutions

## Best Practices

### For AI Agents

**1. Always Use `action` Parameter**
```javascript
// ❌ WRONG
{ task_id: 1 }

// ✅ CORRECT
{ action: "get", task_id: 1 }
```

**2. Use `move` for Status Changes (Not `update`)**
```javascript
// ❌ WRONG (bypasses validation)
{ action: "update", task_id: 1, status: "archived" }

// ✅ CORRECT (validates transition)
{ action: "move", task_id: 1, status: "waiting_review" }
```

**3. Use `list` Before `get`**
```javascript
// ❌ WRONG (loads all descriptions)
tasks.forEach(t => get({ action: "get", task_id: t.id }))

// ✅ CORRECT (metadata first, details on demand)
const tasks = list({ action: "list", status: "in_progress" });
const details = get({ action: "get", task_id: tasks.tasks[0].task_id });
```

**4. Prefer Batch Operations**
```javascript
// ❌ INEFFICIENT (multiple calls)
create({ action: "create", title: "Task 1" });
create({ action: "create", title: "Task 2" });
create({ action: "create", title: "Task 3" });

// ✅ EFFICIENT (one call)
create_batch({
  action: "create_batch",
  tasks: [
    { title: "Task 1" },
    { title: "Task 2" },
    { title: "Task 3" }
  ],
  atomic: false
});
```

**5. Link Tasks to Context**
```javascript
// Create task
const task = create({ action: "create", title: "Implement auth" });

// Link to decision
link({
  action: "link",
  task_id: task.task_id,
  link_type: "decision",
  link_key: "auth_method"
});

// Link to file
link({
  action: "link",
  task_id: task.task_id,
  link_type: "file",
  link_path: "/src/auth/jwt.ts"
});
```

### For Workflow Coordination

**1. Use Assignee for Coordination**
```javascript
// Create task for specific team/person
{
  action: "create",
  title: "Implement auth middleware",
  assignee: "dev-team-1",
  tags: ["handoff"]
}

// List tasks for specific assignee
{
  action: "list",
  assignee: "dev-team-1",
  status: "todo"
}
```

**2. Use Priority for Orchestration**
```javascript
// Critical blocker
{ action: "create", title: "Fix DB connection", priority: "critical" }

// High priority
{ action: "create", title: "Implement API", priority: "high" }

// Background work
{ action: "create", title: "Update docs", priority: "low" }
```

**3. Track Dependencies with Links**
```javascript
// Task depends on constraint
{
  action: "link",
  task_id: 5,
  link_type: "constraint",
  link_id: 3  // "DB schema must be finalized"
}
```

## Common Errors

### Error: "Invalid status transition" (Terminal Status)

**Problem:**
```javascript
// Trying to move FROM a terminal status (archived/rejected)
{ action: "move", task_id: 1, status: "todo" }  // Task is already archived
```

**Error:**
```javascript
{ error: "Invalid status transition from archived to todo. Terminal statuses cannot transition." }
```

**Note:** In v4.1.0+, non-terminal statuses (todo, in_progress, waiting_review, blocked, done) can freely transition to any status including terminal ones.

### Error: "Task not found"

**Problem:**
```javascript
// Invalid task_id
{ action: "get", task_id: 9999 }
```

**Solution:**
```javascript
// List tasks first to get valid IDs
{ action: "list" }
```

### Error: "Invalid link type"

**Problem:**
```javascript
// Typo in link_type
{ action: "link", task_id: 1, link_type: "decisions" }
```

**Solution:**
```javascript
// Use exact link_type
{ action: "link", task_id: 1, link_type: "decision", link_key: "..." }
```

### Error: "Cannot archive task not in done status"

**Problem:**
```javascript
// Trying to archive incomplete task
{ action: "archive", task_id: 1 }  // Task is in_progress
```

**Solution:**
```javascript
// Complete task first
{ action: "move", task_id: 1, status: "done" }
{ action: "archive", task_id: 1 }
```

### Error: "Unknown action"

**Problem:**
```javascript
// Missing action parameter
{ task_id: 1 }
```

**Solution:**
```javascript
// Always include action
{ action: "get", task_id: 1 }
```

## Related Documentation

- **[TASK_OVERVIEW.md](TASK_OVERVIEW.md)** - Task system overview and core concepts
- **[TASK_PRUNING.md](TASK_PRUNING.md)** - Auto-pruning feature for watched files
- **[AI_AGENT_GUIDE.md](AI_AGENT_GUIDE.md)** - Comprehensive AI agent guide

---

**Version:** 4.0.0
**Last Updated:** 2025-11-27
**Author:** sin5ddd
