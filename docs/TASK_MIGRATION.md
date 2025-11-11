# Task Migration Guide - From Decisions to Tasks

**Version:** 3.0.0
**Last Updated:** 2025-10-17

## Table of Contents

1. [Overview](#overview)
2. [When to Migrate](#when-to-migrate)
3. [Migration Strategy](#migration-strategy)
4. [Before and After Examples](#before-and-after-examples)
5. [Automated Migration](#automated-migration)
6. [Manual Migration](#manual-migration)
7. [Best Practices](#best-practices)
8. [Troubleshooting](#troubleshooting)
9. [Related Documentation](#related-documentation)

## Overview

Prior to v3.0, many users misused the `decision` tool for task/todo tracking, leading to:
- **Token waste:** ~332 bytes per task-like decision
- **No lifecycle management:** Tasks stuck in "in_progress" status
- **Poor queryability:** Full content loaded for simple status checks

The dedicated `task` tool (v3.0+) solves these issues with:
- **70% token reduction** via metadata-only queries
- **Auto-stale detection** for interrupted tasks
- **Status validation** with enforced state machine
- **Proper task lifecycle** management

This guide helps you migrate from decision-based task tracking to the dedicated task system.

## When to Migrate

### Decision-Based Task Indicators

Migrate if you're using decisions like this:

**Pattern 1: Status Prefix in Value**
```javascript
{
  action: "set",
  key: "task_implement_auth",
  value: "in_progress: Implementing JWT authentication",
  tags: ["task", "in_progress"]
}
```

**Pattern 2: Todo Tag Usage**
```javascript
{
  action: "set",
  key: "implement_oauth",
  value: "Add OAuth2 provider support",
  tags: ["todo", "authentication"]
}
```

**Pattern 3: Task-Like Keys**
```javascript
{
  action: "set",
  key: "todo_refactor_api",
  value: "Refactor API endpoints to GraphQL",
  tags: ["task", "refactoring"]
}
```

### Benefits of Migration

| Metric | Decision-Based | Task Tool | Improvement |
|--------|---------------|-----------|-------------|
| Token usage (10 items) | ~3,320 bytes | ~1,000 bytes | 70% reduction |
| Lifecycle management | Manual | Automatic | Auto-stale detection |
| Status validation | None | Enforced | State machine |
| Query efficiency | Full content | Metadata only | Faster queries |

## Migration Strategy

### 5-Step Migration Process

1. **Identify:** Find task-like decisions
2. **Parse:** Extract status and description
3. **Create:** Create proper tasks
4. **Link:** Connect task to original decision (for context)
5. **Deprecate:** Mark old decision as deprecated

### Step-by-Step Example

**Step 1: Identify Task-Like Decision**
```javascript
// Search for task-like decisions
{
  action: "search_tags",
  tags: ["task"],
  tag_match: "AND"
}

// Or search by key pattern
{
  action: "list",
  limit: 100
}
// Filter results for keys starting with "task_" or "todo_"
```

**Step 2: Parse Decision Content**
```javascript
// Original decision:
{
  key: "task_implement_auth",
  value: "in_progress: Implementing JWT authentication with refresh tokens",
  tags: ["task", "in_progress", "security"],
  layer: "infrastructure"
}

// Parse:
// - Status: "in_progress"
// - Description: "Implementing JWT authentication with refresh tokens"
// - Tags: ["security"] (remove "task" and status tags)
```

**Step 3: Create Task**
```javascript
{
  action: "create",
  title: "Implement JWT authentication",
  description: "Implementing JWT authentication with refresh tokens",
  status: "in_progress",
  priority: "high",
  assignee: "auth-agent",
  tags: ["security", "authentication"],
  layer: "business"  // Corrected from "infrastructure"
}
// Returns: { task_id: 1 }
```

**Step 4: Link to Original Decision (Optional)**
```javascript
// Link task to original decision for context
{
  action: "link",
  task_id: 1,
  link_type: "decision",
  link_key: "task_implement_auth"
}
```

**Step 5: Deprecate Old Decision**
```javascript
{
  action: "set",
  key: "task_implement_auth",
  value: "MIGRATED TO TASK #1: Implementing JWT authentication with refresh tokens",
  status: "deprecated",
  tags: ["migrated", "security"],
  layer: "infrastructure"
}
```

## Before and After Examples

### Example 1: Simple Task

**Before (v2.x):**
```javascript
{
  action: "set",
  key: "todo_add_logging",
  value: "Add logging to API endpoints",
  tags: ["todo", "logging"],
  layer: "infrastructure"
}
```

**After (v3.0):**
```javascript
{
  action: "create",
  title: "Add logging to API endpoints",
  status: "todo",
  priority: "medium",
  tags: ["logging", "api"],
  layer: "cross-cutting"
}
```

### Example 2: In-Progress Task

**Before (v2.x):**
```javascript
{
  action: "set",
  key: "task_refactor_db",
  value: "in_progress: Refactoring database layer for better performance",
  tags: ["task", "in_progress", "database", "performance"],
  layer: "data"
}
```

**After (v3.0):**
```javascript
{
  action: "create",
  title: "Refactor database layer",
  description: "Refactoring database layer for better performance",
  status: "in_progress",
  priority: "high",
  assignee: "db-agent",
  tags: ["database", "performance", "refactoring"],
  layer: "data"
}
```

### Example 3: Completed Task

**Before (v2.x):**
```javascript
{
  action: "set",
  key: "task_setup_ci",
  value: "done: Setup CI/CD pipeline with GitHub Actions",
  tags: ["task", "done", "devops"],
  layer: "infrastructure"
}
```

**After (v3.0):**
```javascript
{
  action: "create",
  title: "Setup CI/CD pipeline",
  description: "Setup CI/CD pipeline with GitHub Actions",
  status: "done",
  priority: "high",
  tags: ["devops", "ci-cd"],
  layer: "infrastructure"
}

// Optional: Archive immediately
{
  action: "archive",
  task_id: 3
}
```

### Example 4: Task with Links

**Before (v2.x):**
```javascript
{
  action: "set",
  key: "task_implement_cache",
  value: "in_progress: Implement Redis caching (relates to caching_strategy decision)",
  tags: ["task", "in_progress", "caching", "performance"],
  layer: "infrastructure"
}
```

**After (v3.0):**
```javascript
// Create task
{
  action: "create",
  title: "Implement Redis caching",
  description: "Implement Redis caching for API responses",
  status: "in_progress",
  priority: "high",
  assignee: "perf-agent",
  tags: ["caching", "performance"],
  layer: "infrastructure"
}
// Returns: { task_id: 4 }

// Link to decision
{
  action: "link",
  task_id: 4,
  link_type: "decision",
  link_key: "caching_strategy"
}

// Link to constraint
{
  action: "link",
  task_id: 4,
  link_type: "constraint",
  link_id: 5  // "API response time <100ms"
}

// Link to files
{
  action: "link",
  task_id: 4,
  link_type: "file",
  link_path: "/src/cache/redis.ts"
}
```

## Automated Migration

### Migration Script Template

```javascript
// Step 1: Get all task-like decisions
const taskDecisions = {
  action: "search_tags",
  tags: ["task"],
  tag_match: "AND"
};
// Returns: { decisions: [...] }

// Step 2: Parse and migrate each decision
taskDecisions.decisions.forEach(decision => {
  // Parse status from value
  const statusMatch = decision.value.match(/^(todo|in_progress|done|blocked|waiting_review):\s*(.+)$/);
  const status = statusMatch ? statusMatch[1] : "todo";
  const description = statusMatch ? statusMatch[2] : decision.value;

  // Extract title from key or description
  const title = decision.key
    .replace(/^(task_|todo_)/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());

  // Clean tags (remove status and "task" tags)
  const cleanTags = decision.tags.filter(t =>
    !['task', 'todo', 'done', 'in_progress', 'blocked', 'waiting_review'].includes(t)
  );

  // Create task
  const newTask = {
    action: "create",
    title: title,
    description: description,
    status: status,
    priority: "medium",  // Default priority
    tags: cleanTags,
    layer: decision.layer
  };
  // Returns: { task_id: X }

  // Link to original decision (optional)
  {
    action: "link",
    task_id: newTask.task_id,
    link_type: "decision",
    link_key: decision.key
  }

  // Deprecate old decision
  {
    action: "set",
    key: decision.key,
    value: `MIGRATED TO TASK #${newTask.task_id}: ${description}`,
    status: "deprecated",
    tags: ["migrated", ...cleanTags],
    layer: decision.layer
  }
});
```

### Batch Migration

```javascript
// Step 1: Collect task-like decisions
const decisions = [
  {
    key: "task_implement_auth",
    value: "in_progress: Implementing JWT authentication",
    tags: ["task", "in_progress", "security"],
    layer: "infrastructure"
  },
  {
    key: "todo_add_tests",
    value: "Add unit tests for API endpoints",
    tags: ["todo", "testing"],
    layer: "business"
  },
  // ... more decisions
];

// Step 2: Transform to task objects
const tasks = decisions.map(d => {
  const statusMatch = d.value.match(/^(todo|in_progress|done):\s*(.+)$/);
  return {
    title: d.key.replace(/^(task_|todo_)/, '').replace(/_/g, ' '),
    description: statusMatch ? statusMatch[2] : d.value,
    status: statusMatch ? statusMatch[1] : "todo",
    priority: "medium",
    tags: d.tags.filter(t => !['task', 'todo'].includes(t)),
    layer: d.layer
  };
});

// Step 3: Batch create tasks
{
  action: "create_batch",
  tasks: tasks,
  atomic: false  // Allow partial success
}
```

## Manual Migration

### For Individual Tasks

**Manual Process:**

1. **Find Task-Like Decision:**
   ```javascript
   {
     action: "get",
     key: "task_implement_auth"
   }
   ```

2. **Create Equivalent Task:**
   ```javascript
   {
     action: "create",
     title: "Implement JWT authentication",
     description: "Implementing JWT authentication with refresh tokens",
     status: "in_progress",
     priority: "high",
     tags: ["security", "authentication"],
     layer: "business"
   }
   ```

3. **Link to Original (Optional):**
   ```javascript
   {
     action: "link",
     task_id: 1,
     link_type: "decision",
     link_key: "task_implement_auth"
   }
   ```

4. **Deprecate Old Decision:**
   ```javascript
   {
     action: "set",
     key: "task_implement_auth",
     value: "MIGRATED TO TASK #1",
     status: "deprecated",
     tags: ["migrated"]
   }
   ```

### For Small Sets

**Manual Checklist:**

- [ ] Identify all task-like decisions
- [ ] For each decision:
  - [ ] Parse status and description
  - [ ] Create task with proper metadata
  - [ ] Link to original decision (if needed)
  - [ ] Link to related constraints/files
  - [ ] Deprecate old decision
- [ ] Verify all tasks created
- [ ] Verify no orphaned decisions

## Best Practices

### 1. Preserve Context with Links

```javascript
// ✅ GOOD: Link to original decision for traceability
{
  action: "link",
  task_id: 1,
  link_type: "decision",
  link_key: "task_implement_auth"
}

// ❌ BAD: Lose connection to original context
// (no link created)
```

### 2. Clean Up Tags

```javascript
// ✅ GOOD: Remove status tags, keep semantic tags
{
  action: "create",
  tags: ["security", "authentication"]  // Clean, semantic tags
}

// ❌ BAD: Keep status tags (redundant with status field)
{
  action: "create",
  tags: ["task", "in_progress", "security"]  // Redundant
}
```

### 3. Correct Layer Assignment

```javascript
// ✅ GOOD: Use correct layer based on task nature
{
  action: "create",
  title: "Implement JWT auth",
  layer: "business"  // Auth logic = business layer
}

// ❌ BAD: Wrong layer from old decision
{
  action: "create",
  title: "Implement JWT auth",
  layer: "infrastructure"  // Wrong layer
}
```

### 4. Set Appropriate Priority

```javascript
// ✅ GOOD: Assess priority during migration
{
  action: "create",
  title: "Fix security vulnerability",
  priority: "critical"  // Correctly prioritized
}

// ❌ BAD: Default priority for critical work
{
  action: "create",
  title: "Fix security vulnerability",
  priority: "medium"  // Should be critical
}
```

### 5. Migrate in Batches

```javascript
// ✅ GOOD: Migrate in manageable batches
{
  action: "create_batch",
  tasks: first20Tasks,
  atomic: false
}
// Then migrate next batch

// ❌ BAD: Try to migrate 200+ tasks at once
{
  action: "create_batch",
  tasks: all200Tasks,  // Too large, may fail
  atomic: true
}
```

### 6. Verify Migration

```javascript
// After migration, verify:

// 1. Count migrated tasks
{
  action: "list",
  tags: ["security"]
}
// Should match old decision count

// 2. Check deprecated decisions
{
  action: "list",
  status: "deprecated",
  tags: ["migrated"]
}
// Should show all old task-like decisions

// 3. Verify links
{
  action: "get",
  task_id: 1
}
// Should show decision_links to old decisions
```

## Troubleshooting

### Issue: Migration Script Fails Midway

**Problem:**
```javascript
// Batch create fails after 50 tasks
{
  action: "create_batch",
  tasks: [...100 tasks...],
  atomic: true  // All-or-nothing mode
}
// Error: Task 51 failed, entire batch rolled back
```

**Solution:**
```javascript
// Use best-effort mode
{
  action: "create_batch",
  tasks: [...100 tasks...],
  atomic: false  // Allow partial success
}
// 50 succeed, 50 fail with errors listed
// Fix failures and retry
```

### Issue: Can't Parse Status from Decision Value

**Problem:**
```javascript
// Decision value doesn't follow pattern
{
  key: "implement_auth",
  value: "Working on JWT auth implementation"
  // No "in_progress:" prefix
}
```

**Solution:**
```javascript
// Default to "todo" status, manual review later
{
  action: "create",
  title: "Implement JWT auth",
  description: "Working on JWT auth implementation",
  status: "todo",  // Default, review later
  tags: ["needs-review"]
}
```

### Issue: Lost Context After Migration

**Problem:**
```javascript
// Migrated task missing important context
{
  action: "get",
  task_id: 1
}
// No links to decisions/constraints
```

**Solution:**
```javascript
// Link to original decision
{
  action: "link",
  task_id: 1,
  link_type: "decision",
  link_key: "task_implement_auth"
}

// Link to related constraints
{
  action: "link",
  task_id: 1,
  link_type: "constraint",
  link_id: 5
}
```

### Issue: Duplicate Tasks Created

**Problem:**
```javascript
// Migration script runs twice, creates duplicates
```

**Solution:**
```javascript
// Before migration, check if already migrated
{
  action: "get",
  key: "task_implement_auth"
}
// If status="deprecated" and value contains "MIGRATED TO TASK", skip

// Or query tasks by title
{
  action: "list",
  limit: 100
}
// Filter by title to check if exists
```

## Related Documentation

- **[TASK_OVERVIEW.md](TASK_OVERVIEW.md)** - Task system overview and core concepts
- **[TASK_ACTIONS.md](TASK_ACTIONS.md)** - Complete action reference with examples
- **[TASK_LINKING.md](TASK_LINKING.md)** - Linking tasks to decisions/constraints/files
- **[TASK_SYSTEM.md](TASK_SYSTEM.md)** - Complete documentation (original)
- **[DECISION_TO_TASK_MIGRATION_GUIDE.md](DECISION_TO_TASK_MIGRATION_GUIDE.md)** - Original migration guide (if exists)
- **[AI_AGENT_GUIDE.md](AI_AGENT_GUIDE.md)** - Comprehensive AI agent guide

---

**Version:** 3.0.0
**Last Updated:** 2025-10-17
**Author:** sin5ddd
