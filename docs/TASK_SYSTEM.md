# Task System - Kanban Task Watcher

**Version:** 3.0.0
**Last Updated:** 2025-10-17

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Quick Start](#quick-start)
4. [Task Lifecycle](#task-lifecycle)
5. [Tool Reference](#tool-reference)
6. [Auto-Stale Detection](#auto-stale-detection)
7. [Linking System](#linking-system)
8. [Token Efficiency](#token-efficiency)
9. [Best Practices](#best-practices)
10. [Migration Guide](#migration-guide)
11. [Troubleshooting](#troubleshooting)

## Overview

The Kanban Task Watcher is an AI-optimized task management system designed to solve token waste from misuse of the `decision` tool for task/todo tracking.

### Problem Statement

Real-world usage analysis revealed:
- **204 task-like decisions** in 3-day production usage
- **~825 tokens** to query 10 task-like decisions (332 bytes/decision average)
- **No lifecycle management:** Tasks stuck in "in_progress" after interrupts or usage limits
- **Inefficient queries:** Full text content loaded even for simple list operations

### Solution

Dedicated Kanban task system with:
- **70% token reduction** via metadata-only list queries
- **Auto-stale detection** to handle interrupted sessions
- **Status validation** with enforced state machine transitions
- **Linking system** to connect tasks with decisions, constraints, files
- **Flat hierarchy** for AI simplicity (no subtasks)

## Architecture

### Database Schema

#### Master Tables

**`m_task_statuses`** - Task status definitions
```sql
CREATE TABLE m_task_statuses (
  status_id INTEGER PRIMARY KEY,
  status_name TEXT NOT NULL UNIQUE
);

-- 6 Statuses:
-- 1: todo
-- 2: in_progress
-- 3: waiting_review
-- 4: blocked
-- 5: done
-- 6: archived
```

#### Transaction Tables

**`t_tasks`** - Core task data
```sql
CREATE TABLE t_tasks (
  task_id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  status_id INTEGER NOT NULL DEFAULT 1,
  priority_id INTEGER,
  assignee TEXT,
  layer_id INTEGER,
  created_ts INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_ts INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (status_id) REFERENCES m_task_statuses(status_id),
  FOREIGN KEY (priority_id) REFERENCES m_priorities(priority_id),
  FOREIGN KEY (layer_id) REFERENCES m_layers(layer_id)
);
```

**`t_task_details`** - Task descriptions (separated for token efficiency)
```sql
CREATE TABLE t_task_details (
  task_id INTEGER PRIMARY KEY,
  description TEXT,
  FOREIGN KEY (task_id) REFERENCES t_tasks(task_id) ON DELETE CASCADE
);
```

**`t_task_tags`** - Many-to-many task tags
```sql
CREATE TABLE t_task_tags (
  task_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (task_id, tag_id),
  FOREIGN KEY (task_id) REFERENCES t_tasks(task_id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES m_tags(tag_id) ON DELETE CASCADE
);
```

**`t_task_decision_links`** - Link tasks to decisions
```sql
CREATE TABLE t_task_decision_links (
  task_id INTEGER NOT NULL,
  decision_key_id INTEGER NOT NULL,
  PRIMARY KEY (task_id, decision_key_id),
  FOREIGN KEY (task_id) REFERENCES t_tasks(task_id) ON DELETE CASCADE,
  FOREIGN KEY (decision_key_id) REFERENCES m_context_keys(key_id) ON DELETE CASCADE
);
```

**`t_task_constraint_links`** - Link tasks to constraints
```sql
CREATE TABLE t_task_constraint_links (
  task_id INTEGER NOT NULL,
  constraint_id INTEGER NOT NULL,
  PRIMARY KEY (task_id, constraint_id),
  FOREIGN KEY (task_id) REFERENCES t_tasks(task_id) ON DELETE CASCADE,
  FOREIGN KEY (constraint_id) REFERENCES t_constraints(constraint_id) ON DELETE CASCADE
);
```

**`t_task_file_links`** - Link tasks to file changes
```sql
CREATE TABLE t_task_file_links (
  task_id INTEGER NOT NULL,
  file_id INTEGER NOT NULL,
  PRIMARY KEY (task_id, file_id),
  FOREIGN KEY (task_id) REFERENCES t_tasks(task_id) ON DELETE CASCADE,
  FOREIGN KEY (file_id) REFERENCES m_files(file_id) ON DELETE CASCADE
);
```

#### Views

**`v_task_board`** - Token-efficient task queries (metadata only, no descriptions)
```sql
CREATE VIEW v_task_board AS
SELECT
  t.task_id,
  t.title,
  s.status_name,
  p.priority_name,
  t.assignee,
  l.layer_name,
  GROUP_CONCAT(tag.tag_name, ',') AS tags,
  t.created_ts,
  t.updated_ts
FROM t_tasks t
LEFT JOIN m_task_statuses s ON t.status_id = s.status_id
LEFT JOIN m_priorities p ON t.priority_id = p.priority_id
LEFT JOIN m_layers l ON t.layer_id = l.layer_id
LEFT JOIN t_task_tags tt ON t.task_id = tt.task_id
LEFT JOIN m_tags tag ON tt.tag_id = tag.tag_id
GROUP BY t.task_id;
```

**Token efficiency:** ~100 bytes/task (vs ~332 bytes for full task with description)

#### Triggers

**`trg_log_task_create`** - Automatic activity logging on task creation
```sql
CREATE TRIGGER trg_log_task_create AFTER INSERT ON t_tasks
BEGIN
  INSERT INTO t_activity_log (agent_id, entity_type, entity_id, action_type, details, ts)
  VALUES (
    (SELECT agent_id FROM m_agents WHERE agent_name = NEW.assignee),
    'task',
    NEW.task_id,
    'create',
    json_object('title', NEW.title, 'status_id', NEW.status_id),
    NEW.created_ts
  );
END;
```

**`trg_log_task_status_change`** - Log status transitions
```sql
CREATE TRIGGER trg_log_task_status_change AFTER UPDATE OF status_id ON t_tasks
WHEN OLD.status_id != NEW.status_id
BEGIN
  INSERT INTO t_activity_log (agent_id, entity_type, entity_id, action_type, details, ts)
  VALUES (
    (SELECT agent_id FROM m_agents WHERE agent_name = NEW.assignee),
    'task',
    NEW.task_id,
    'status_change',
    json_object('old_status', OLD.status_id, 'new_status', NEW.status_id),
    unixepoch()
  );
END;
```

**`trg_update_task_timestamp`** - Auto-update task timestamp
```sql
CREATE TRIGGER trg_update_task_timestamp AFTER UPDATE ON t_tasks
BEGIN
  UPDATE t_tasks SET updated_ts = unixepoch() WHERE task_id = NEW.task_id;
END;
```

### Configuration

Auto-stale detection config keys in `m_config` table:
- `task_auto_stale_enabled` ('1'): Enable/disable (0=false, 1=true)
- `task_stale_hours_in_progress` ('2'): Hours before in_progress → waiting_review
- `task_stale_hours_waiting_review` ('24'): Hours before waiting_review → todo

> See [Auto-Stale Detection](#auto-stale-detection) section for configuration details.

## Quick Start

### Creating Your First Task

```javascript
// Minimal task creation
{
  action: "create",
  title: "Implement JWT authentication"
}
// Returns: { task_id: 1, status: "todo" }

// Complete task creation with metadata
{
  action: "create",
  title: "Implement JWT authentication",
  description: "Add JWT-based authentication to API endpoints with refresh token support",
  status: "todo",
  priority: "high",
  assignee: "auth-agent",
  tags: ["security", "authentication", "api"],
  layer: "business"
}
```

### Listing Tasks

```javascript
// List all tasks (metadata only - token efficient)
{
  action: "list"
}

// List filtered tasks
{
  action: "list",
  status: "in_progress",
  assignee: "auth-agent",
  tags: ["security"]
}

// Response includes stale_tasks_transitioned count
{
  tasks: [
    {
      task_id: 1,
      title: "Implement JWT authentication",
      status_name: "in_progress",
      priority_name: "high",
      assignee: "auth-agent",
      layer_name: "business",
      tags: "security,authentication,api",
      created_ts: 1697545200,
      updated_ts: 1697545800
    }
  ],
  count: 1,
  stale_tasks_transitioned: 0
}
```

### Getting Task Details

```javascript
// Get full task with description
{
  action: "get",
  task_id: 1
}

// Response includes description and links
{
  task_id: 1,
  title: "Implement JWT authentication",
  description: "Add JWT-based authentication to API endpoints with refresh token support",
  status: "in_progress",
  priority: "high",
  assignee: "auth-agent",
  layer: "business",
  tags: ["security", "authentication", "api"],
  created_ts: 1697545200,
  updated_ts: 1697545800,
  decision_links: ["auth_method", "jwt_secret"],
  constraint_links: [5],
  file_links: ["/src/auth/jwt.ts", "/src/auth/middleware.ts"]
}
```

### Moving Tasks

```javascript
// Move task to next status (validated)
{
  action: "move",
  task_id: 1,
  new_status: "waiting_review"
}

// Error if invalid transition
{
  action: "move",
  task_id: 1,
  new_status: "archived"  // Invalid: can't go from in_progress to archived
}
// Returns: Error: Invalid status transition from in_progress to archived
```

### Linking Tasks

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

## Task Lifecycle

### Status Definitions

| Status | ID | Description | Use Case |
|--------|----|-----------|----|
| `todo` | 1 | Not yet started | Backlog, planned work |
| `in_progress` | 2 | Actively being worked on | Current focus |
| `waiting_review` | 3 | Awaiting feedback or approval | Code review, design review |
| `blocked` | 4 | Cannot proceed due to blocker | Dependency, question, issue |
| `done` | 5 | Completed | Finished work |
| `archived` | 6 | Completed and archived | Historical reference |

### State Machine Transitions

```
todo → in_progress → waiting_review → done → archived
         ↓              ↓
      blocked ────────┘
```

**Valid Transitions:**

| From Status | To Status(es) |
|-------------|--------------|
| `todo` | `in_progress`, `blocked` |
| `in_progress` | `waiting_review`, `blocked`, `done` |
| `waiting_review` | `in_progress`, `todo`, `done` |
| `blocked` | `todo`, `in_progress` |
| `done` | `archived` |
| `archived` | *(terminal state)* |

**Validation:**
- Enforced by `moveTask()` function
- Invalid transitions return error
- Use `update` action to bypass validation (use with caution)

### Auto-Stale Transitions

Tasks automatically transition when idle:

1. **`in_progress` → `waiting_review`** (>2 hours idle)
   - Rationale: Likely waiting for review or hit usage limit

2. **`waiting_review` → `todo`** (>24 hours idle)
   - Rationale: Review not happening, reset to backlog

**When It Runs:** Automatically before `list` and `move` actions

> **Configuration:** See [Auto-Stale Detection](#auto-stale-detection) section for detailed configuration options.

## Tool Reference

### Action: `create`

Create a new task.

**Required Parameters:**
- `action`: "create"
- `title`: Task title (string)

**Optional Parameters:**
- `description`: Full task description (string)
- `status`: Initial status (string: "todo", "in_progress", "waiting_review", "blocked", "done", "archived") - default: "todo"
- `priority`: Priority level (string: "low", "medium", "high", "critical")
- `assignee`: Agent or user assigned (string)
- `tags`: Array of tags (string[])
- `layer`: Architecture layer (string) - See [AI Agent Guide](AI_AGENT_GUIDE.md#6-always-specify-layer-for-decisions) for layer definitions

**Example:**
```javascript
{
  action: "create",
  title: "Implement JWT authentication",
  description: "Add JWT-based authentication with refresh tokens",
  status: "todo",
  priority: "high",
  assignee: "auth-agent",
  tags: ["security", "authentication"],
  layer: "business"
}
```

**Response:**
```javascript
{
  task_id: 1,
  message: "Task created successfully"
}
```

### Action: `update`

Update existing task fields.

**Required Parameters:**
- `action`: "update"
- `task_id`: Task ID (number)

**Optional Parameters (at least one required):**
- `status`: New status (string)
- `description`: New description (string)
- `priority`: New priority (string)
- `assignee`: New assignee (string)
- `tags`: New tags array (string[]) - replaces existing tags
- `layer`: New layer (string)

**Note:** Use `move` action for status transitions with validation.

**Example:**
```javascript
{
  action: "update",
  task_id: 1,
  description: "Updated requirements: Add OAuth2 support",
  priority: "critical"
}
```

**Response:**
```javascript
{
  success: true,
  message: "Task updated successfully"
}
```

### Action: `get`

Get single task with full details.

**Required Parameters:**
- `action`: "get"
- `task_id`: Task ID (number)

**Example:**
```javascript
{
  action: "get",
  task_id: 1
}
```

**Response:**
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
  decision_links: ["auth_method"],
  constraint_links: [5],
  file_links: ["/src/auth/jwt.ts"]
}
```

### Action: `list`

List tasks with filtering (metadata only, no descriptions).

**Required Parameters:**
- `action`: "list"

**Optional Parameters:**
- `status`: Filter by status (string)
- `priority`: Filter by priority (string)
- `assignee`: Filter by assignee (string)
- `tags`: Filter by tags (string[])
- `layer`: Filter by layer (string)
- `limit`: Maximum results (number) - default: 100

**Example:**
```javascript
{
  action: "list",
  status: "in_progress",
  assignee: "auth-agent",
  tags: ["security"]
}
```

**Response:**
```javascript
{
  tasks: [
    {
      task_id: 1,
      title: "Implement JWT authentication",
      status_name: "in_progress",
      priority_name: "high",
      assignee: "auth-agent",
      layer_name: "business",
      tags: "security,authentication",
      created_ts: 1697545200,
      updated_ts: 1697545800
    }
  ],
  count: 1,
  stale_tasks_transitioned: 0
}
```

**Token Efficiency:**
- ~100 bytes/task (no descriptions)
- Use `get` for full details when needed

### Action: `move`

Move task to new status with validation.

**Required Parameters:**
- `action`: "move"
- `task_id`: Task ID (number)
- `new_status`: Target status (string)

**Example:**
```javascript
{
  action: "move",
  task_id: 1,
  new_status: "waiting_review"
}
```

**Response (success):**
```javascript
{
  success: true,
  message: "Task moved from in_progress to waiting_review"
}
```

**Response (invalid transition):**
```javascript
{
  error: "Invalid status transition from in_progress to archived. Valid transitions: waiting_review, blocked, done"
}
```

**Auto-Stale Detection:**
- Runs before move operation
- Returns `stale_tasks_transitioned` count

### Action: `link`

Link task to decision, constraint, or file.

**Required Parameters:**
- `action`: "link"
- `task_id`: Task ID (number)
- `link_type`: Link type (string: "decision", "constraint", "file")

**Type-Specific Required Parameters:**
- `link_type="decision"`: `link_key` (string) - Decision key
- `link_type="constraint"`: `link_id` (number) - Constraint ID
- `link_type="file"`: `link_path` (string) - File path

**Examples:**
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

**Response:**
```javascript
{
  success: true,
  message: "Task linked to decision 'auth_method'"
}
```

### Action: `archive`

Archive completed task (soft delete).

**Required Parameters:**
- `action`: "archive"
- `task_id`: Task ID (number)

**Example:**
```javascript
{
  action: "archive",
  task_id: 1
}
```

**Response:**
```javascript
{
  success: true,
  message: "Task archived successfully"
}
```

**Note:** Only tasks with `status="done"` can be archived.

### Action: `batch_create`

Create multiple tasks atomically or best-effort.

**Required Parameters:**
- `action`: "batch_create"
- `tasks`: Array of task objects (max 50)

**Optional Parameters:**
- `atomic`: Boolean (default: true) - All-or-nothing vs best-effort mode

**Example:**
```javascript
{
  action: "batch_create",
  tasks: [
    {
      title: "Setup database schema",
      status: "todo",
      priority: "high",
      assignee: "db-agent"
    },
    {
      title: "Implement API endpoints",
      status: "todo",
      priority: "medium",
      assignee: "api-agent"
    }
  ],
  atomic: false  // Recommended for AI agents - allows partial success
}
```

**Response (atomic=true, success):**
```javascript
{
  success: true,
  created_count: 2,
  task_ids: [1, 2]
}
```

**Response (atomic=false, partial success):**
```javascript
{
  success: true,
  created_count: 1,
  failed_count: 1,
  task_ids: [1],
  errors: ["Task 2: Invalid priority 'ultra-high'"]
}
```

> **Note on Atomic Mode:** For AI agents, `atomic: false` is recommended to avoid transaction failures. See [AI Agent Guide - Batch Operations](AI_AGENT_GUIDE.md#batch-operations-guide) for details.

### Action: `help`

Get comprehensive on-demand documentation.

**Required Parameters:**
- `action`: "help"

**Example:**
```javascript
{
  action: "help"
}
```

**Response:**
- Complete tool documentation
- Parameter matrices
- Examples
- Status transition rules
- Token efficiency tips

## Auto-Stale Detection

### Overview

Auto-stale detection automatically transitions idle tasks to prevent them from getting stuck.

**Why It's Needed:**
- AI agents hit usage limits mid-task
- Sessions get interrupted (network, timeout)
- Code generation takes longer than expected
- Reviews don't happen promptly

### Detection Logic

**Implementation:** `src/utils/task-stale-detection.ts`

The logic:
1. Check if enabled via `task_auto_stale_enabled` config
2. Get threshold hours/days from config
3. Run SQL UPDATE to transition stale tasks based on `updated_ts`
4. Return count of transitioned tasks

**Transition Rules:**
1. **`in_progress` → `waiting_review`** (>2 hours idle)
2. **`waiting_review` → `todo`** (>24 hours idle)
3. **`done` → `archived`** (>48 hours idle, weekend-aware) - **Auto-Archive**

SQL Pattern:
```sql
UPDATE t_tasks
SET status_id = ?, updated_ts = unixepoch()
WHERE status_id = ? AND updated_ts < unixepoch() - ?
```

### When It Runs

1. **Before `list` action**
   - Ensures stale tasks show correct status
   - Returns `stale_tasks_transitioned` count
   - Returns `archived_tasks` count

2. **Before `move` action**
   - Prevents moving already-stale tasks
   - Ensures status consistency

3. **On database startup**
   - Maintenance on initialization
   - Cleans up stale/old tasks

### Configuration

**Via MCP Tool (config):**
```javascript
// Update auto-archive threshold
{
  action: "update",
  auto_archive_done_days: "3"  // Archive after 3 days instead of 2
}

// Enable weekend-aware mode (affects auto-archive, messages, files)
{
  action: "update",
  autodelete_ignore_weekend: "1"
}
```

**Via .sqlew/config.toml:**
```toml
[tasks]
auto_archive_done_days = 3          # Archive after 3 days
stale_hours_in_progress = 4         # in_progress → waiting_review after 4 hours
stale_hours_waiting_review = 48     # waiting_review → todo after 48 hours
auto_stale_enabled = true

[autodelete]
ignore_weekend = true               # Weekend-aware mode (shared setting)
```

**Via SQL (Advanced):**
```sql
-- Enable/Disable
UPDATE m_config SET value = '1' WHERE key = 'task_auto_stale_enabled';  -- Enable
UPDATE m_config SET value = '0' WHERE key = 'task_auto_stale_enabled';  -- Disable

-- Adjust auto-archive threshold
UPDATE m_config SET value = '3' WHERE key = 'auto_archive_done_days';  -- 3 days

-- Adjust stale detection thresholds
UPDATE m_config SET value = '4' WHERE key = 'task_stale_hours_in_progress';
UPDATE m_config SET value = '48' WHERE key = 'task_stale_hours_waiting_review';

-- Check current config
SELECT key, value FROM m_config WHERE key LIKE 'task_%' OR key LIKE 'auto_%';
```

### Monitoring

Track transitions via `t_activity_log` table:
```sql
-- Recent transitions (including auto-archive)
SELECT * FROM t_activity_log
WHERE entity_type = 'task' AND action_type = 'status_change'
ORDER BY ts DESC LIMIT 20;

-- Frequently stale tasks (>2 auto-transitions)
SELECT task_id, COUNT(*) as stale_count FROM t_activity_log
WHERE entity_type = 'task' AND json_extract(details, '$.new_status') = 3
GROUP BY task_id HAVING stale_count > 2;

-- Recently auto-archived tasks
SELECT * FROM t_activity_log
WHERE entity_type = 'task'
  AND action_type = 'status_change'
  AND json_extract(details, '$.new_status') = 6  -- ARCHIVED status
ORDER BY ts DESC LIMIT 20;

-- Count of archived tasks per day
SELECT date(ts, 'unixepoch') as day, COUNT(*) as archived_count
FROM t_activity_log
WHERE entity_type = 'task'
  AND action_type = 'status_change'
  AND json_extract(details, '$.new_status') = 6
GROUP BY day
ORDER BY day DESC;
```

### Weekend-Aware Behavior

When `autodelete_ignore_weekend` is enabled (via config.toml or MCP tool):

**Example 1 - Task Completed on Friday:**
- Task marked `done`: Friday 5:00 PM
- Default 48 hours: Would archive Sunday 5:00 PM
- **Weekend-aware**: Archives Tuesday 5:00 PM (skips Sat/Sun)

**Example 2 - Task Completed on Wednesday:**
- Task marked `done`: Wednesday 2:00 PM
- Default 48 hours: Would archive Friday 2:00 PM
- **Weekend-aware**: Archives Friday 2:00 PM (no weekend in between)

**Why Weekend-Aware Mode?**
- Teams/AI agents may not work on weekends
- Prevents premature archiving during weekend breaks
- Consistent with message/file retention behavior
- Configurable: Disable if you work 7 days/week

## Linking System

### Overview

Tasks can be linked to:
- **Decisions:** Track which architectural decisions relate to this task
- **Constraints:** Associate performance/security/architecture constraints
- **Files:** Connect to modified files for context

### Use Cases

**Decision Links:**
```javascript
// Task: "Implement JWT authentication"
// Link to decision: "auth_method"
{
  action: "link",
  task_id: 1,
  link_type: "decision",
  link_key: "auth_method"
}

// Benefit: When viewing task, see related auth decision
```

**Constraint Links:**
```javascript
// Task: "Optimize API response time"
// Link to constraint: "API response <100ms"
{
  action: "link",
  task_id: 2,
  link_type: "constraint",
  link_id: 5
}

// Benefit: Track which constraint this task addresses
```

**File Links:**
```javascript
// Task: "Refactor auth module"
// Link to files being modified
{
  action: "link",
  task_id: 3,
  link_type: "file",
  link_path: "/src/auth/jwt.ts"
}

// Benefit: See which files are affected by this task
```

### Querying Links

**Get Task with Links:**
```javascript
{
  action: "get",
  task_id: 1
}

// Response includes all links
{
  task_id: 1,
  title: "Implement JWT authentication",
  decision_links: ["auth_method", "jwt_secret"],
  constraint_links: [5, 8],
  file_links: ["/src/auth/jwt.ts", "/src/auth/middleware.ts"]
}
```

**Find Tasks by Link:**
```sql
-- Tasks linked to specific decision
SELECT t.* FROM t_tasks t
JOIN t_task_decision_links tdl ON t.task_id = tdl.task_id
JOIN m_context_keys ck ON tdl.decision_key_id = ck.key_id
WHERE ck.key_name = 'auth_method';

-- Tasks linked to specific constraint
SELECT t.* FROM t_tasks t
JOIN t_task_constraint_links tcl ON t.task_id = tcl.task_id
WHERE tcl.constraint_id = 5;

-- Tasks linked to specific file
SELECT t.* FROM t_tasks t
JOIN t_task_file_links tfl ON t.task_id = tfl.task_id
JOIN m_files f ON tfl.file_id = f.file_id
WHERE f.file_path = '/src/auth/jwt.ts';
```

## Token Efficiency

### Metadata-Only Queries

**Problem:** Full task content loads descriptions (~232 bytes extra per task)

**Solution:** `v_task_board` view provides metadata only

**Comparison:**

| Query Type | Bytes/Task | 10 Tasks | Use Case |
|------------|-----------|----------|----------|
| `list` (metadata only) | ~100 | ~1,000 | Browse, filter, status check |
| `get` (full details) | ~332 | ~3,320 | Read description, view links |
| Old `decision` method | ~332 | ~3,320 | What AIs were doing before v3.0 |

**Token Savings:**
- `list` vs `decision`: 70% reduction
- 10 tasks: 3,320 → 1,000 bytes (2,320 bytes saved)

### Best Practices

1. **Use `list` for browsing**
   ```javascript
   // Get all in_progress tasks (metadata only)
   { action: "list", status: "in_progress" }
   ```

2. **Use `get` only when needed**
   ```javascript
   // User wants to read task description
   { action: "get", task_id: 5 }
   ```

3. **Filter aggressively**
   ```javascript
   // Narrow results with filters
   {
     action: "list",
     status: "in_progress",
     assignee: "auth-agent",
     tags: ["security"]
   }
   ```

4. **Batch create instead of sequential**
   ```javascript
   // Create 5 tasks in one call
   {
     action: "batch_create",
     tasks: [...]
   }
   ```

### Monitoring Token Usage

**Estimate bytes returned:**
```sql
-- Estimate list query size
SELECT COUNT(*) * 100 as estimated_bytes
FROM v_task_board
WHERE status_name = 'in_progress';

-- Estimate get query size
SELECT
  LENGTH(title) + LENGTH(COALESCE(description, '')) + 232 as estimated_bytes
FROM t_tasks t
LEFT JOIN t_task_details td ON t.task_id = td.task_id
WHERE t.task_id = 1;
```

## Best Practices

### For AI Agents

1. **Always use `action` parameter**
   ```javascript
   // ❌ WRONG
   { task_id: 1 }

   // ✅ CORRECT
   { action: "get", task_id: 1 }
   ```

2. **Use `move` for status changes (not `update`)**
   ```javascript
   // ❌ WRONG (bypasses validation)
   { action: "update", task_id: 1, status: "archived" }

   // ✅ CORRECT (validates transition)
   { action: "move", task_id: 1, new_status: "waiting_review" }
   ```

3. **Use `list` before `get`**
   ```javascript
   // ❌ WRONG (loads all descriptions)
   tasks.forEach(t => get({ action: "get", task_id: t.id }))

   // ✅ CORRECT (metadata first, details on demand)
   const tasks = list({ action: "list", status: "in_progress" });
   const details = get({ action: "get", task_id: tasks[0].task_id });
   ```

4. **Prefer batch operations for efficiency**
   ```javascript
   // Create multiple tasks in one call
   {
     action: "batch_create",
     tasks: [...]
   }
   ```

5. **Link tasks to relevant context**
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
   ```

### For Multi-Agent Workflows

1. **Use assignee for coordination**
   ```javascript
   // Agent A creates task for Agent B
   {
     action: "create",
     title: "Implement auth middleware",
     assignee: "auth-agent",
     tags: ["handoff"]
   }

   // Agent B lists assigned tasks
   {
     action: "list",
     assignee: "auth-agent",
     status: "todo"
   }
   ```

2. **Use priority for orchestration**
   ```javascript
   // Critical blocker
   { action: "create", title: "Fix DB connection", priority: "critical" }

   // High priority
   { action: "create", title: "Implement API", priority: "high" }

   // Background work
   { action: "create", title: "Update docs", priority: "low" }
   ```

3. **Track dependencies with links**
   ```javascript
   // Task depends on constraint being met
   {
     action: "link",
     task_id: 5,
     link_type: "constraint",
     link_id: 3  // "DB schema must be finalized"
   }
   ```

## Migration Guide

### From Decision-Based Task Tracking

**Before (v2.x):**
```javascript
// Using decision tool for tasks
{
  action: "set",
  key: "task_implement_auth",
  value: "in_progress: Implementing JWT authentication with refresh tokens",
  layer: "infrastructure",
  tags: ["task", "security", "in_progress"]
}
```

**After (v3.0):**
```javascript
// Using task tool
{
  action: "create",
  title: "Implement JWT authentication",
  description: "Implementing JWT authentication with refresh tokens",
  status: "in_progress",
  priority: "high",
  assignee: "auth-agent",
  tags: ["security", "authentication"],
  layer: "business"
}
```

### Migration Strategy

1. **Find task-like decisions:** `search_tags` with `tags: ["task"]`
2. **Parse format:** Extract status and description from decision value
3. **Create tasks:** Use `task` tool's `create` action
4. **Link context:** Use `link` action to connect task to original decision
5. **Deprecate old:** Update decision `status: "deprecated"`

> **Tip:** See docs/DECISION_TO_TASK_MIGRATION_GUIDE.md for complete migration script.

## Troubleshooting

### Common Errors

> **For general MCP tool errors** (missing action parameter, invalid layer, atomic mode), see [AI Agent Guide](AI_AGENT_GUIDE.md#common-errors--solutions)

**Error: "Invalid status transition"**
```javascript
// Problem: Trying to move from in_progress to archived
{ action: "move", task_id: 1, new_status: "archived" }

// Solution: Move to done first
{ action: "move", task_id: 1, new_status: "done" }
{ action: "archive", task_id: 1 }
```

**Error: "Task not found"**
```javascript
// Problem: Invalid task_id
{ action: "get", task_id: 9999 }

// Solution: List tasks first to get valid IDs
{ action: "list" }
```

**Error: "Invalid link type"**
```javascript
// Problem: Typo in link_type
{ action: "link", task_id: 1, link_type: "decisions" }

// Solution: Use exact link_type
{ action: "link", task_id: 1, link_type: "decision", link_key: "..." }
```

**Error: "Cannot archive task not in done status"**
```javascript
// Problem: Trying to archive incomplete task
{ action: "archive", task_id: 1 }  // Task is in_progress

// Solution: Complete task first
{ action: "move", task_id: 1, new_status: "done" }
{ action: "archive", task_id: 1 }
```

### Debugging

```sql
-- Check task exists
SELECT * FROM t_tasks WHERE task_id = 1;

-- Check status
SELECT t.task_id, s.status_name FROM t_tasks t
JOIN m_task_statuses s ON t.status_id = s.status_id WHERE t.task_id = 1;

-- Check links
SELECT * FROM t_task_decision_links WHERE task_id = 1;
SELECT * FROM t_task_constraint_links WHERE task_id = 1;
SELECT * FROM t_task_file_links WHERE task_id = 1;

-- Check config & activity
SELECT * FROM m_config WHERE key LIKE 'task_%';
SELECT * FROM t_activity_log WHERE entity_type = 'task' AND entity_id = 1 ORDER BY ts DESC;
```

### Performance Issues

- **Slow queries:** Check index usage with `EXPLAIN QUERY PLAN`
- **Large results:** Use `limit` parameter (default: 100, reduce to 20)

## Appendix

### Complete Status Reference

| Status ID | Status Name | Description |
|-----------|------------|-------------|
| 1 | todo | Not yet started |
| 2 | in_progress | Actively being worked on |
| 3 | waiting_review | Awaiting feedback/approval |
| 4 | blocked | Cannot proceed (dependency/issue) |
| 5 | done | Completed |
| 6 | archived | Completed and archived |

### Complete Transition Matrix

| From ↓ / To → | todo | in_progress | waiting_review | blocked | done | archived |
|---------------|------|-------------|----------------|---------|------|----------|
| **todo** | - | ✅ | ❌ | ✅ | ❌ | ❌ |
| **in_progress** | ❌ | - | ✅ | ✅ | ✅ | ❌ |
| **waiting_review** | ✅ | ✅ | - | ❌ | ✅ | ❌ |
| **blocked** | ✅ | ✅ | ❌ | - | ❌ | ❌ |
| **done** | ❌ | ❌ | ❌ | ❌ | - | ✅ |
| **archived** | ❌ | ❌ | ❌ | ❌ | ❌ | - |

✅ = Valid transition
❌ = Invalid transition
\- = Same status (no transition)

### Related Documentation

- **README.md:** Quick start and overview
- **CHANGELOG.md:** Version history and release notes
- **CLAUDE.md:** Developer instructions and architecture
- **ARCHITECTURE.md:** Technical architecture details
- **AI_AGENT_GUIDE.md:** Comprehensive AI agent guide

### Future Enhancements

Potential v3.1.0 features: task dependencies, subtasks, time tracking, task templates, configurable auto-stale via tool, recurring tasks, export/import

### Support

- **Issues:** [GitHub Issues](https://github.com/sin5ddd/mcp-sqlew/issues)
- **Discussions:** [GitHub Discussions](https://github.com/sin5ddd/mcp-sqlew/discussions)

---

**Version:** 3.0.0
**Last Updated:** 2025-10-17
**Author:** sin5ddd
