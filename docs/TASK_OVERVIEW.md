# Task System Overview - Kanban Task Watcher

**Version:** 3.0.0
**Last Updated:** 2025-10-17

## Table of Contents

1. [Overview](#overview)
2. [Core Concepts](#core-concepts)
3. [Status Definitions](#status-definitions)
4. [State Machine Transitions](#state-machine-transitions)
5. [Auto-Stale Detection](#auto-stale-detection)
6. [Priority System](#priority-system)
7. [Quick Start](#quick-start)
8. [Related Documentation](#related-documentation)

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

## Core Concepts

### Task Structure

Every task has:
- **Identity:** `task_id`, `title`
- **Status:** Lifecycle stage (todo → in_progress → done → archived)
- **Metadata:** `priority`, `assignee`, `tags`, `layer`
- **Content:** Optional `description` (stored separately for token efficiency)
- **Links:** Connections to decisions, constraints, files
- **Timestamps:** `created_ts`, `updated_ts`

### Token Efficiency Strategy

**Metadata-Only Queries:**
- **`list` action:** Returns metadata only (~100 bytes/task)
- **`get` action:** Returns full details with description (~332 bytes/task)
- **70% reduction** compared to decision-based task tracking

**Comparison Table:**

| Query Type | Bytes/Task | 10 Tasks | Use Case |
|------------|-----------|----------|----------|
| `list` (metadata only) | ~100 | ~1,000 | Browse, filter, status check |
| `get` (full details) | ~332 | ~3,320 | Read description, view links |
| Old `decision` method | ~332 | ~3,320 | What AIs were doing before v3.0 |

### Flat Hierarchy

**Design Decision:** No subtasks
- Simpler for AI agents to manage
- Clearer status tracking
- Easier to query and filter
- Use tags/links for relationships instead

## Status Definitions

| Status | ID | Description | Use Case |
|--------|----|-----------|----|
| `todo` | 1 | Not yet started | Backlog, planned work |
| `in_progress` | 2 | Actively being worked on | Current focus |
| `waiting_review` | 3 | Awaiting feedback or approval | Code review, design review |
| `blocked` | 4 | Cannot proceed due to blocker | Dependency, question, issue |
| `done` | 5 | Completed | Finished work |
| `archived` | 6 | Completed and archived | Historical reference |

### Status Best Practices

**`todo`:**
- Use for backlog items
- No one actively working
- Ready to be picked up

**`in_progress`:**
- Active work happening
- Should have assignee
- Auto-transitions to `waiting_review` via:
  - Smart quality gates (v3.4.1): All files modified, tests pass, TypeScript compiles, 3min idle (default)
  - Time-based stale detection: 2 hours idle (fallback)

**`waiting_review`:**
- Awaiting human/AI feedback or git commit
- Code review needed
- **Auto-transitions to `done` (v3.4.0 Git-aware):** When ALL watched files are committed to Git
- Git commits = implicit review approval
- Real-time: Detects commits via `.git/index` file watcher
- Periodic: Checks on `task.list()` calls

**`blocked`:**
- Cannot proceed
- Has explicit blocker (dependency, question, issue)
- Should have comment explaining blocker

**`done`:**
- Work completed
- Verified/tested
- Can be archived

**`archived`:**
- Historical reference only
- Completed tasks no longer active
- Terminal state (no transitions out)

## State Machine Transitions

### Visual Diagram

```
v3.4.0 Git-Aware Workflow:
todo → in_progress → waiting_review → done → archived
  ↓         ↓              ↓
  |     (Quality gates   (Git commits)
  |      or 2h idle)         ↓
  |         ↓          (All watched files
  └──── blocked        committed to Git)

Real-time: .git/index file watcher detects commits
Periodic: task.list() checks git log

Alternative (with acceptance_criteria):
todo → in_progress → done → archived
  ↓         ↓
  |    (Criteria met,
  |     skip review)
  |         ↓
  └──── blocked
```

### Valid Transitions

| From Status | To Status(es) | Rationale |
|-------------|--------------|-----------|
| `todo` | `in_progress`, `blocked` | Start work or discover blocker |
| `in_progress` | `waiting_review`, `blocked`, `done` | Quality gates met (v3.4.1), need review, hit blocker, or complete |
| `waiting_review` | `in_progress`, `todo`, `done` | Resume work, reset to backlog, or approve |
| `blocked` | `todo`, `in_progress` | Blocker resolved, resume or reset |
| `done` | `archived` | Archive completed work (auto after 48h in v3.4.1) |
| `archived` | *(terminal state)* | No transitions allowed |

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

### Validation

- Enforced by `move` action
- Invalid transitions return error with valid options
- Use `update` action to bypass validation (use with caution)

**Example Error:**
```javascript
{
  action: "move",
  task_id: 1,
  new_status: "archived"  // Task is in_progress
}
// Error: Invalid status transition from in_progress to archived.
// Valid transitions: waiting_review, blocked, done
```

## Auto-Stale Detection

### Overview

Auto-stale detection automatically transitions idle tasks to prevent them from getting stuck.

**Why It's Needed:**
- AI agents hit usage limits mid-task
- Sessions get interrupted (network, timeout)
- Code generation takes longer than expected
- Reviews don't happen promptly

### Detection Rules

**v3.4.1+: Smart Quality-Based Detection (Primary)**

1. **`in_progress` → `waiting_review`** (quality gates met)
   - All watched files modified at least once
   - TypeScript compiles without errors (if .ts files)
   - Tests pass (if test files exist)
   - 15 minutes idle (no file modifications)
   - Rationale: Work is complete and ready for review
   - Configuration: See `.sqlew/config.toml` review_* settings

**Time-Based Stale Detection (Fallback)**

2. **`in_progress` → `waiting_review`** (>2 hours idle)
   - Rationale: Likely waiting for review or hit usage limit
   - Check: `updated_ts` older than 2 hours

3. **`waiting_review` → `todo`** (>24 hours idle)
   - Rationale: Review not happening, reset to backlog
   - Check: `updated_ts` older than 24 hours

4. **`done` → `archived`** (>48 hours idle) - **Auto-Archive (v3.4.1)**
   - Rationale: Completed tasks should be archived automatically
   - Check: `updated_ts` older than 48 hours (2 days)
   - Weekend-aware: Task done Friday → archives Tuesday (skips Sat/Sun)

### When It Runs

Automatically runs before:
1. **`list` action** - Ensures stale tasks show correct status
2. **`move` action** - Prevents moving already-stale tasks
3. **Database startup** - Maintenance on initialization

**Response includes:**
- `stale_tasks_transitioned`: Count of auto-transitioned tasks
- `archived_tasks`: Count of auto-archived done tasks (in list action)

**Example Response:**
```javascript
{
  tasks: [...],
  count: 5,
  stale_tasks_transitioned: 2,  // 2 tasks auto-transitioned
  archived_tasks: 1              // 1 done task auto-archived
}
```

### Configuration

**Default Settings:**
- `task_auto_stale_enabled`: '1' (enabled)
- `task_stale_hours_in_progress`: '2' (2 hours)
- `task_stale_hours_waiting_review`: '24' (24 hours)
- `auto_archive_done_days`: '2' (2 days / 48 hours)
- `autodelete_ignore_weekend`: '0' (false) - Shared with messages/files cleanup

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
-- Enable/Disable auto-stale
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
-- Recent auto-transitions (including auto-archive)
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

## Priority System

### Priority Levels

| Priority | ID | Description | Use Case |
|----------|----|-----------|----|
| `low` | 1 | Nice to have | Documentation, cleanup |
| `medium` | 2 | Normal priority | Standard features |
| `high` | 3 | Important work | Critical features |
| `critical` | 4 | Urgent blocker | Production issues, blockers |

### Priority Usage

**For AI Agents:**
```javascript
// Critical blocker
{ action: "create", title: "Fix DB connection", priority: "critical" }

// High priority feature
{ action: "create", title: "Implement API", priority: "high" }

// Background work
{ action: "create", title: "Update docs", priority: "low" }
```

**Filtering by Priority:**
```javascript
// Get all critical tasks
{
  action: "list",
  priority: "critical"
}
```

## Quick Start

### Creating Your First Task

```javascript
// Minimal task creation
{
  action: "create",
  title: "Implement JWT authentication"
}
// Returns: { task_id: 1, message: "Task created successfully" }

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
```

### Getting Task Details

```javascript
// Get full task with description
{
  action: "get",
  task_id: 1
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
```

## Related Documentation

- **[TASK_ACTIONS.md](TASK_ACTIONS.md)** - Complete action reference with examples
- **[TASK_LINKING.md](TASK_LINKING.md)** - Linking tasks to decisions/constraints/files
- **[TASK_MIGRATION.md](TASK_MIGRATION.md)** - Migrating from decision-based task tracking
- **[TASK_SYSTEM.md](TASK_SYSTEM.md)** - Complete documentation (original)
- **[AI_AGENT_GUIDE.md](AI_AGENT_GUIDE.md)** - Comprehensive AI agent guide
- **[README.md](../README.md)** - Project overview

---

**Version:** 3.0.0
**Last Updated:** 2025-10-17
**Author:** sin5ddd
