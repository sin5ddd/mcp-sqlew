# Task Dependencies - Managing Blocking Relationships

**Version:** 3.2.0
**Feature:** Task Dependency Management (GitHub Issue #16)
**Last Updated:** 2025-10-18

## Table of Contents

1. [Overview](#overview)
2. [Core Concepts](#core-concepts)
3. [Dependency Actions](#dependency-actions)
4. [Validation Rules](#validation-rules)
5. [Circular Dependency Detection](#circular-dependency-detection)
6. [Enhanced Query Actions](#enhanced-query-actions)
7. [Usage Examples](#usage-examples)
8. [Best Practices](#best-practices)
9. [Token Efficiency](#token-efficiency)
10. [Related Documentation](#related-documentation)

## Overview

Task Dependencies introduce **blocking relationships** between tasks, enabling workflow coordination and task ordering in AI-driven development. Unlike simple task links (decision/constraint/file), dependencies enforce directional relationships where one task must be completed before another can proceed.

**Key Features:**
- **Blocking Relationships**: Task A blocks Task B (B cannot proceed until A is done)
- **Bidirectional Queries**: Find both blockers and blocking tasks
- **Circular Detection**: Prevents deadlocks with recursive CTE algorithm
- **Cascade Deletion**: Dependencies auto-delete when tasks are deleted
- **Token Efficient**: Metadata-only queries by default, detailed info optional

**Use Cases:**
- Sequential feature development (auth before dashboard)
- Infrastructure before application code
- Database migrations before schema-dependent features
- API contracts before client implementations

## Core Concepts

### Blocker vs Blocked Tasks

```
Task A (blocker) → blocks → Task B (blocked)
```

**Terminology:**
- **Blocker Task**: The task that must be completed first
- **Blocked Task**: The task that is waiting/dependent
- **Blockers**: Tasks that block this task (what I'm waiting for)
- **Blocking**: Tasks that this task blocks (what's waiting for me)

**Example:**
```javascript
// Task #1: Implement JWT authentication (blocker)
// Task #2: Add user profile page (blocked - needs auth)

{
  action: "add_dependency",
  blocker_task_id: 1,  // JWT auth must complete first
  blocked_task_id: 2   // Profile page waits for auth
}
```

### Bidirectional Queries

Dependencies can be queried from either direction:

**From Blocked Task's Perspective:**
```javascript
// "What's blocking me from starting?"
{
  action: "get_dependencies",
  task_id: 2  // Profile page
}
// Returns:
// - blockers: [Task #1] (auth implementation)
// - blocking: [] (nothing waits for me)
```

**From Blocker Task's Perspective:**
```javascript
// "What's waiting for me to finish?"
{
  action: "get_dependencies",
  task_id: 1  // Auth implementation
}
// Returns:
// - blockers: [] (nothing blocks me)
// - blocking: [Task #2] (profile page waits)
```

### Cascade Deletion

When a task is deleted, all its dependencies are automatically removed:

```javascript
// Before deletion:
// Task #1 blocks Task #2
// Task #1 blocks Task #3

// After deleting Task #1:
// Dependencies automatically removed
// Task #2 and #3 are now unblocked
```

## Dependency Actions

### add_dependency

Add a blocking relationship between two tasks.

**Parameters:**
- `action`: "add_dependency" (required)
- `blocker_task_id` (required, number): Task ID that blocks
- `blocked_task_id` (required, number): Task ID that is blocked

**Validations:**
- No self-dependencies (task cannot block itself)
- No circular dependencies (direct or transitive)
- Both tasks must exist
- Neither task can be archived

**Example:**
```javascript
{
  action: "add_dependency",
  blocker_task_id: 1,
  blocked_task_id: 2
}
```

**Response:**
```javascript
{
  success: true,
  message: "Dependency added: Task #1 blocks Task #2"
}
```

**Error Examples:**
```javascript
// Self-dependency
{
  action: "add_dependency",
  blocker_task_id: 1,
  blocked_task_id: 1
}
// Error: "Self-dependency not allowed"

// Circular dependency (direct)
// Task #1 blocks Task #2
{
  action: "add_dependency",
  blocker_task_id: 2,
  blocked_task_id: 1
}
// Error: "Circular dependency detected: Task #2 already blocks Task #1"

// Archived task
{
  action: "add_dependency",
  blocker_task_id: 10,  // archived
  blocked_task_id: 2
}
// Error: "Cannot add dependency: Task #10 is archived"
```

### remove_dependency

Remove a blocking relationship between two tasks.

**Parameters:**
- `action`: "remove_dependency" (required)
- `blocker_task_id` (required, number): Task ID that blocks
- `blocked_task_id` (required, number): Task ID that is blocked

**Idempotent:** Succeeds silently if dependency doesn't exist.

**Example:**
```javascript
{
  action: "remove_dependency",
  blocker_task_id: 1,
  blocked_task_id: 2
}
```

**Response:**
```javascript
{
  success: true,
  message: "Dependency removed: Task #1 no longer blocks Task #2"
}
```

**Use Cases:**
- Task completed early (unblock dependent tasks)
- Requirements changed (dependency no longer needed)
- Refactoring workflow (restructure task order)

### get_dependencies

Query dependencies for a task bidirectionally.

**Parameters:**
- `action`: "get_dependencies" (required)
- `task_id` (required, number): Task to query dependencies for
- `include_details` (optional, boolean): Include full task metadata (default: false)

**Example (Metadata-Only):**
```javascript
{
  action: "get_dependencies",
  task_id: 2
}
```

**Response (Metadata-Only):**
```javascript
{
  task_id: 2,
  blockers: [1, 3],    // Task IDs only
  blocking: [5, 7]     // Task IDs only
}
```

**Example (With Details):**
```javascript
{
  action: "get_dependencies",
  task_id: 2,
  include_details: true
}
```

**Response (With Details):**
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
    }
  ]
}
```

## Validation Rules

### 1. No Self-Dependencies

Tasks cannot block themselves.

```javascript
// ❌ Invalid
{
  action: "add_dependency",
  blocker_task_id: 1,
  blocked_task_id: 1
}
// Error: "Self-dependency not allowed"
```

### 2. No Direct Circular Dependencies

If Task A blocks Task B, then Task B cannot block Task A.

```javascript
// Existing: Task #1 blocks Task #2

// ❌ Invalid
{
  action: "add_dependency",
  blocker_task_id: 2,
  blocked_task_id: 1
}
// Error: "Circular dependency detected: Task #2 already blocks Task #1"
```

### 3. No Transitive Circular Dependencies

Prevents cycles in dependency chains.

```javascript
// Existing dependencies:
// Task #1 blocks Task #2
// Task #2 blocks Task #3

// ❌ Invalid (would create cycle)
{
  action: "add_dependency",
  blocker_task_id: 3,
  blocked_task_id: 1
}
// Error: "Circular dependency detected: Task #3 → 1 → 2 → 3"
```

**Cycle Detection Algorithm:**
- Uses recursive CTE (Common Table Expression)
- Traverses dependency chain from blocked task
- Detects if blocker appears in chain
- Depth limit: 100 levels (prevents infinite loops)

### 4. Both Tasks Must Exist

Both blocker and blocked tasks must exist in the database.

```javascript
// ❌ Invalid
{
  action: "add_dependency",
  blocker_task_id: 999,  // doesn't exist
  blocked_task_id: 2
}
// Error: "Blocker task #999 not found"
```

### 5. Neither Task Can Be Archived

Archived tasks cannot participate in dependencies.

```javascript
// ❌ Invalid
{
  action: "add_dependency",
  blocker_task_id: 1,
  blocked_task_id: 10  // archived
}
// Error: "Cannot add dependency: Task #10 is archived"
```

**Rationale:** Archived tasks are completed/inactive. Dependencies only apply to active workflow.

## Circular Dependency Detection

### Algorithm Overview

sqlew uses a **recursive CTE (Common Table Expression)** to detect circular dependencies efficiently.

**Steps:**
1. Start from the task that would be blocked
2. Follow the chain of dependencies recursively
3. Check if the blocker appears anywhere in the chain
4. If yes, reject with detailed cycle path

### SQL Implementation

```sql
WITH RECURSIVE dependency_chain AS (
  -- Base case: Start from blocked task
  SELECT blocked_task_id as task_id, 1 as depth
  FROM t_task_dependencies
  WHERE blocker_task_id = ?

  UNION ALL

  -- Recursive case: Follow dependency chain
  SELECT d.blocked_task_id, dc.depth + 1
  FROM t_task_dependencies d
  JOIN dependency_chain dc ON d.blocker_task_id = dc.task_id
  WHERE dc.depth < 100  -- Prevent infinite loops
)
SELECT task_id FROM dependency_chain WHERE task_id = ?
```

### Example: Transitive Cycle

```javascript
// Existing dependencies:
// Task #1 blocks Task #2
// Task #2 blocks Task #3
// Task #3 blocks Task #4

// Attempt to create cycle:
{
  action: "add_dependency",
  blocker_task_id: 4,
  blocked_task_id: 1
}

// Detection process:
// 1. Start from Task #1 (would be blocked)
// 2. Follow chain: 1 → 2 → 3 → 4
// 3. Found Task #4 in chain (the blocker)
// 4. Reject with path

// Error message:
"Circular dependency detected: Task #4 → 1 → 2 → 3 → 4"
```

### Performance Characteristics

- **Time Complexity:** O(D) where D is dependency depth
- **Depth Limit:** 100 levels (prevents runaway recursion)
- **Index Support:** `idx_task_deps_blocked` on `blocked_task_id`
- **Typical Depth:** 2-5 levels in real workflows

## Enhanced Query Actions

### list (Enhanced)

**New Parameter:**
- `include_dependency_counts` (optional, boolean): Add dependency counts to metadata

**Example:**
```javascript
{
  action: "list",
  status: "in_progress",
  include_dependency_counts: true
}
```

**Response:**
```javascript
{
  tasks: [
    {
      task_id: 2,
      title: "Add user profile page",
      status: "in_progress",
      priority: "medium",
      blocked_by_count: 2,    // 2 tasks block this
      blocking_count: 1       // This blocks 1 task
    },
    // ... more tasks
  ],
  count: 1
}
```

**Use Cases:**
- Identify bottleneck tasks (high `blocking_count`)
- Find blocked tasks (high `blocked_by_count`)
- Prioritize unblocking tasks

### get (Enhanced)

**New Parameter:**
- `include_dependencies` (optional, boolean): Include full dependency arrays

**Example:**
```javascript
{
  action: "get",
  task_id: 2,
  include_dependencies: true
}
```

**Response:**
```javascript
{
  task: {
    task_id: 2,
    title: "Add user profile page",
    // ... other task fields
    dependencies: {
      blockers: [1, 3],    // Task IDs blocking this
      blocking: [5, 7]     // Task IDs this blocks
    },
    linked_decisions: [...],
    linked_constraints: [...],
    linked_files: [...]
  }
}
```

**Token Efficiency:**
- Metadata-only by default (just IDs)
- Use `get_dependencies` with `include_details` for full info

## Usage Examples

### Sequential Feature Development

```javascript
// Create tasks
{action: "create", title: "Implement JWT auth"}
// Returns: {task_id: 1}

{action: "create", title: "Add user profile page"}
// Returns: {task_id: 2}

{action: "create", title: "Implement settings page"}
// Returns: {task_id: 3}

// Add dependencies (auth must complete first)
{action: "add_dependency", blocker_task_id: 1, blocked_task_id: 2}
{action: "add_dependency", blocker_task_id: 1, blocked_task_id: 3}

// Query what's blocked by auth
{action: "get_dependencies", task_id: 1}
// Returns:
// blockers: []
// blocking: [2, 3]  // Profile and settings wait
```

### Multi-Layer Infrastructure

```javascript
// Create infrastructure tasks
{action: "create", title: "Setup PostgreSQL", layer: "data"}
// Returns: {task_id: 10}

{action: "create", title: "Create user schema", layer: "data"}
// Returns: {task_id: 11}

{action: "create", title: "Implement auth service", layer: "business"}
// Returns: {task_id: 12}

{action: "create", title: "Add login UI", layer: "presentation"}
// Returns: {task_id: 13}

// Add layer dependencies (bottom-up)
{action: "add_dependency", blocker_task_id: 10, blocked_task_id: 11}
{action: "add_dependency", blocker_task_id: 11, blocked_task_id: 12}
{action: "add_dependency", blocker_task_id: 12, blocked_task_id: 13}

// Result: data → business → presentation
```

### API Contract Dependencies

```javascript
// Create API contract task
{action: "create", title: "Define REST API contract"}
// Returns: {task_id: 20}

// Create implementation tasks
{action: "create", title: "Implement server endpoints"}
// Returns: {task_id: 21}

{action: "create", title: "Implement client SDK"}
// Returns: {task_id: 22}

// Both implementations depend on contract
{action: "add_dependency", blocker_task_id: 20, blocked_task_id: 21}
{action: "add_dependency", blocker_task_id: 20, blocked_task_id: 22}

// Query contract's impact
{action: "get_dependencies", task_id: 20, include_details: true}
// blocking: [
//   {task_id: 21, title: "Implement server endpoints", ...},
//   {task_id: 22, title: "Implement client SDK", ...}
// ]
```

### Finding Bottlenecks

```javascript
// List all in-progress tasks with dependency counts
{
  action: "list",
  status: "in_progress",
  include_dependency_counts: true
}

// Response shows blocking_count
// High blocking_count = bottleneck (many tasks waiting)
// Prioritize completing these first
```

### Unblocking Workflow

```javascript
// Task #1 completed - remove dependencies to unblock
{action: "update", task_id: 1, new_status: "done"}

// Option 1: Let CASCADE delete handle it (tasks auto-unblock)
{action: "archive", task_id: 1}
// Dependencies automatically removed

// Option 2: Manually remove specific dependencies
{action: "remove_dependency", blocker_task_id: 1, blocked_task_id: 2}
{action: "remove_dependency", blocker_task_id: 1, blocked_task_id: 3}
```

## Best Practices

### When to Use Dependencies

**✅ Use Dependencies For:**
- Sequential technical requirements (DB before ORM)
- Ordered feature rollout (API before UI)
- Cross-layer dependencies (data → business → presentation)
- Shared infrastructure (auth before protected routes)

**❌ Don't Use Dependencies For:**
- Parallel/independent features
- Organizational preferences (not technical blockers)
- Overly granular tasks (creates complex graphs)
- Long-term strategic planning (use decisions instead)

### Dependency Graph Structure

**Good: Linear/Tree Structures**
```
Task #1 (root)
├── Task #2
└── Task #3
    ├── Task #4
    └── Task #5
```

**Bad: Dense Mesh**
```
Task #1 ←→ Task #2 ←→ Task #3
    ↓         ↓         ↓
Task #4 ←→ Task #5 ←→ Task #6
```

**Guidelines:**
- Keep dependency chains short (2-5 levels)
- Avoid creating many-to-many relationships
- Use tags for loose grouping, dependencies for hard blocking

### Handling Completed Dependencies

**Option 1: Archive Completed Tasks**
```javascript
// CASCADE deletion automatically removes dependencies
{action: "archive", task_id: 1}
// Task #2 and #3 automatically unblocked
```

**Option 2: Keep Task, Remove Dependencies**
```javascript
// Keep task history but unblock dependents
{action: "update", task_id: 1, new_status: "done"}
{action: "remove_dependency", blocker_task_id: 1, blocked_task_id: 2}
```

**Recommendation:** Archive completed tasks to keep task board clean and auto-unblock dependents.

### Avoiding Deadlocks

**Problem: Circular Dependencies**
```javascript
// ❌ Creates deadlock
Task #1 blocks Task #2
Task #2 blocks Task #1
```

**Solution: Validation Prevents This**
- sqlew automatically rejects circular dependencies
- No manual deadlock resolution needed

**Best Practice:**
- Plan dependency graph before creating dependencies
- Use `get_dependencies` to visualize chains
- Keep chains unidirectional (no cycles)

### Token-Efficient Queries

**Metadata-Only (Recommended):**
```javascript
// Just IDs - minimal tokens
{action: "get_dependencies", task_id: 2}
// ~100 bytes total
```

**With Details (When Needed):**
```javascript
// Full task metadata
{action: "get_dependencies", task_id: 2, include_details: true}
// ~500-1000 bytes total
```

**Use Counts for Overview:**
```javascript
// List with counts - cheapest overview
{action: "list", include_dependency_counts: true}
// +16 bytes per task (2 integers)
```

## Token Efficiency

### Metadata-Only Queries

**Default Behavior:**
- `get_dependencies`: Returns task IDs only (4-8 bytes per ID)
- `list` with `include_dependency_counts`: Adds 2 integers (8 bytes)
- Minimal token consumption for workflow queries

**Example Comparison:**
```javascript
// Metadata-only
{task_id: 2, blockers: [1, 3], blocking: [5]}
// ~30 bytes

// With details
{
  task_id: 2,
  blockers: [
    {task_id: 1, title: "Implement JWT auth", status: "in_progress", priority: "high"},
    {task_id: 3, title: "Design schema", status: "done", priority: "medium"}
  ],
  blocking: [
    {task_id: 5, title: "Add profile page", status: "todo", priority: "medium"}
  ]
}
// ~250 bytes
```

**Savings:** ~88% token reduction with metadata-only approach.

### Database Efficiency

**Schema Optimizations:**
- Composite primary key (`blocker_task_id`, `blocked_task_id`)
- Index on `blocked_task_id` for reverse queries
- CASCADE deletion (no orphaned dependencies)
- Minimal storage (3 integers per dependency)

**Query Performance:**
- O(1) lookup for direct dependencies
- O(D) for circular detection (D = depth)
- Index-backed bidirectional queries

## Related Documentation

- [TASK_ACTIONS.md](TASK_ACTIONS.md) - Complete action reference
- [TASK_LINKING.md](TASK_LINKING.md) - Decision/constraint/file linking
- [TASK_OVERVIEW.md](TASK_OVERVIEW.md) - Task system overview
- [WORKFLOWS.md](WORKFLOWS.md) - Multi-agent coordination patterns
- [ARCHITECTURE.md](ARCHITECTURE.md) - Database schema details

---

**Version History:**
- 3.2.0 (2025-10-18): Initial release of task dependency feature
