# Task Linking Guide

**Version:** 3.0.0
**Last Updated:** 2025-10-17

## Table of Contents

1. [Overview](#overview)
2. [Link Types](#link-types)
3. [Decision Links](#decision-links)
4. [Constraint Links](#constraint-links)
5. [File Links](#file-links)
6. [Querying Links](#querying-links)
7. [Linking Strategies](#linking-strategies)
8. [Best Practices](#best-practices)
9. [Related Documentation](#related-documentation)

## Overview

Tasks can be linked to three types of entities to establish context and relationships:
- **Decisions:** Track which architectural decisions relate to this task
- **Constraints:** Associate performance/security/architecture constraints
- **Files:** Connect to modified files for context

**Benefits of Linking:**
- **Context Preservation:** See related decisions/constraints/files when viewing task
- **Traceability:** Track which tasks implement which decisions
- **Impact Analysis:** Find tasks affected by constraint changes
- **Code Navigation:** Jump to files related to a task

## Link Types

### Available Link Types

| Link Type | Target Entity | Required Parameter | Example |
|-----------|--------------|-------------------|---------|
| `decision` | Context Decision | `link_key` (string) | `"auth_method"` |
| `constraint` | System Constraint | `link_id` (number) | `5` |
| `file` | File Path | `link_path` (string) | `"/src/auth/jwt.ts"` |

### Basic Syntax

```javascript
{
  action: "link",
  task_id: 1,
  link_type: "decision" | "constraint" | "file",
  // Type-specific parameter:
  link_key: "...",    // For decision
  link_id: 123,       // For constraint
  link_path: "..."    // For file
}
```

## Decision Links

### When to Use

Link tasks to decisions when:
- Task implements an architectural decision
- Task is affected by a design choice
- Task needs context from a decision document

### Examples

**Linking to Authentication Decision:**
```javascript
// Decision exists: auth_method = "JWT with refresh tokens"

// Task: Implement JWT authentication
{
  action: "create",
  title: "Implement JWT authentication",
  description: "Add JWT-based auth with refresh token support",
  priority: "high",
  tags: ["security", "authentication"],
  layer: "business"
}
// Returns: { task_id: 1 }

// Link to decision
{
  action: "link",
  task_id: 1,
  link_type: "decision",
  link_key: "auth_method"
}
```

**Multiple Decision Links:**
```javascript
// Task affects multiple decisions
{
  action: "link",
  task_id: 1,
  link_type: "decision",
  link_key: "auth_method"
}

{
  action: "link",
  task_id: 1,
  link_type: "decision",
  link_key: "jwt_secret_rotation"
}

{
  action: "link",
  task_id: 1,
  link_type: "decision",
  link_key: "token_expiry_time"
}
```

### Use Cases

**Implementation Task:**
```javascript
// Decision: Use PostgreSQL for database
// Task: Setup PostgreSQL database

{
  action: "link",
  task_id: 5,
  link_type: "decision",
  link_key: "database_choice"
}
```

**Refactoring Task:**
```javascript
// Decision: Migrate from REST to GraphQL
// Task: Refactor API endpoints to GraphQL

{
  action: "link",
  task_id: 8,
  link_type: "decision",
  link_key: "api_architecture"
}
```

**Investigation Task:**
```javascript
// Decision: Evaluate caching strategies
// Task: Research Redis vs Memcached

{
  action: "link",
  task_id: 12,
  link_type: "decision",
  link_key: "caching_strategy"
}
```

## Constraint Links

### When to Use

Link tasks to constraints when:
- Task addresses a performance/security/architecture constraint
- Task is blocked by a constraint
- Task validates constraint compliance

### Examples

**Performance Constraint:**
```javascript
// Constraint exists: "API response time <100ms" (ID: 5)

// Task: Optimize database queries
{
  action: "create",
  title: "Optimize database queries for user listing",
  description: "Reduce query time from 250ms to <100ms",
  priority: "high",
  tags: ["performance", "database"],
  layer: "data"
}
// Returns: { task_id: 2 }

// Link to constraint
{
  action: "link",
  task_id: 2,
  link_type: "constraint",
  link_id: 5
}
```

**Security Constraint:**
```javascript
// Constraint exists: "All API endpoints must use HTTPS" (ID: 8)

// Task: Enforce HTTPS on all routes
{
  action: "create",
  title: "Enforce HTTPS on all API routes",
  priority: "critical",
  tags: ["security", "api"],
  layer: "infrastructure"
}
// Returns: { task_id: 3 }

// Link to constraint
{
  action: "link",
  task_id: 3,
  link_type: "constraint",
  link_id: 8
}
```

**Architecture Constraint:**
```javascript
// Constraint exists: "Frontend must be framework-agnostic" (ID: 12)

// Task: Refactor to Web Components
{
  action: "create",
  title: "Migrate UI to Web Components",
  description: "Replace framework-specific code with Web Components",
  priority: "medium",
  tags: ["refactoring", "architecture"],
  layer: "presentation"
}
// Returns: { task_id: 7 }

// Link to constraint
{
  action: "link",
  task_id: 7,
  link_type: "constraint",
  link_id: 12
}
```

### Use Cases

**Compliance Task:**
```javascript
// Constraint: GDPR data retention policy
// Task: Implement data deletion workflow

{
  action: "link",
  task_id: 15,
  link_type: "constraint",
  link_id: 22
}
```

**Blocker Resolution:**
```javascript
// Constraint: Database schema must be finalized
// Task: Implement user service (blocked until schema ready)

{
  action: "link",
  task_id: 18,
  link_type: "constraint",
  link_id: 25
}
```

## File Links

### When to Use

Link tasks to files when:
- Task modifies specific files
- Task is scoped to certain modules
- Task affects file structure

### Examples

**Single File Link:**
```javascript
// Task: Refactor JWT authentication module
{
  action: "create",
  title: "Refactor JWT authentication module",
  description: "Extract token generation to separate utility",
  priority: "medium",
  tags: ["refactoring", "authentication"],
  layer: "business"
}
// Returns: { task_id: 4 }

// Link to file
{
  action: "link",
  task_id: 4,
  link_type: "file",
  link_path: "/src/auth/jwt.ts"
}
```

**Multiple File Links:**
```javascript
// Task: Implement user authentication flow
{
  action: "create",
  title: "Implement user authentication flow",
  description: "Complete end-to-end authentication with JWT",
  priority: "high",
  tags: ["feature", "authentication"],
  layer: "business"
}
// Returns: { task_id: 6 }

// Link to multiple files
{
  action: "link",
  task_id: 6,
  link_type: "file",
  link_path: "/src/auth/jwt.ts"
}

{
  action: "link",
  task_id: 6,
  link_type: "file",
  link_path: "/src/auth/middleware.ts"
}

{
  action: "link",
  task_id: 6,
  link_type: "file",
  link_path: "/src/routes/auth.ts"
}

{
  action: "link",
  task_id: 6,
  link_type: "file",
  link_path: "/src/models/user.ts"
}
```

### Use Cases

**Feature Implementation:**
```javascript
// Task: Add password reset functionality
// Files: password-reset controller, email service, user model

{
  action: "link",
  task_id: 10,
  link_type: "file",
  link_path: "/src/controllers/password-reset.ts"
}

{
  action: "link",
  task_id: 10,
  link_type: "file",
  link_path: "/src/services/email.ts"
}

{
  action: "link",
  task_id: 10,
  link_type: "file",
  link_path: "/src/models/user.ts"
}
```

**Bug Fix:**
```javascript
// Task: Fix memory leak in WebSocket handler
// File: WebSocket handler

{
  action: "link",
  task_id: 14,
  link_type: "file",
  link_path: "/src/websocket/handler.ts"
}
```

**Refactoring:**
```javascript
// Task: Extract shared utilities
// Files: Multiple files being refactored

{
  action: "link",
  task_id: 20,
  link_type: "file",
  link_path: "/src/utils/validation.ts"
}

{
  action: "link",
  task_id: 20,
  link_type: "file",
  link_path: "/src/utils/formatting.ts"
}
```

## Querying Links

### Get Task with Links

**Using `get` action:**
```javascript
{
  action: "get",
  task_id: 1
}

// Response includes all links
{
  task_id: 1,
  title: "Implement JWT authentication",
  description: "Add JWT-based auth with refresh token support",
  status: "in_progress",
  priority: "high",
  assignee: "auth-agent",
  layer: "business",
  tags: ["security", "authentication"],
  created_ts: 1697545200,
  updated_ts: 1697545800,
  decision_links: ["auth_method", "jwt_secret_rotation"],
  constraint_links: [5, 8],
  file_links: ["/src/auth/jwt.ts", "/src/auth/middleware.ts"]
}
```

### Find Tasks by Link (SQL)

**Tasks Linked to Specific Decision:**
```sql
SELECT t.* FROM t_tasks t
JOIN t_task_decision_links tdl ON t.task_id = tdl.task_id
JOIN m_context_keys ck ON tdl.decision_key_id = ck.key_id
WHERE ck.key_name = 'auth_method';
```

**Tasks Linked to Specific Constraint:**
```sql
SELECT t.* FROM t_tasks t
JOIN t_task_constraint_links tcl ON t.task_id = tcl.task_id
WHERE tcl.constraint_id = 5;
```

**Tasks Linked to Specific File:**
```sql
SELECT t.* FROM t_tasks t
JOIN t_task_file_links tfl ON t.task_id = tfl.task_id
JOIN m_files f ON tfl.file_id = f.file_id
WHERE f.file_path = '/src/auth/jwt.ts';
```

**All Links for a Task:**
```sql
-- Decision links
SELECT ck.key_name FROM t_task_decision_links tdl
JOIN m_context_keys ck ON tdl.decision_key_id = ck.key_id
WHERE tdl.task_id = 1;

-- Constraint links
SELECT constraint_id FROM t_task_constraint_links
WHERE task_id = 1;

-- File links
SELECT f.file_path FROM t_task_file_links tfl
JOIN m_files f ON tfl.file_id = f.file_id
WHERE tfl.task_id = 1;
```

## Linking Strategies

### 1. Link-as-You-Go

Create task and immediately link to context:

```javascript
// Step 1: Create task
const task = {
  action: "create",
  title: "Implement caching layer",
  description: "Add Redis-based caching for API responses",
  priority: "high",
  tags: ["performance", "caching"],
  layer: "infrastructure"
};
// Returns: { task_id: 25 }

// Step 2: Link to decision
{
  action: "link",
  task_id: 25,
  link_type: "decision",
  link_key: "caching_strategy"
}

// Step 3: Link to constraint
{
  action: "link",
  task_id: 25,
  link_type: "constraint",
  link_id: 5  // "API response time <100ms"
}

// Step 4: Link to files
{
  action: "link",
  task_id: 25,
  link_type: "file",
  link_path: "/src/cache/redis.ts"
}
```

### 2. Batch Linking

Link task to multiple entities at once:

```javascript
// Create task
{ action: "create", title: "...", ... }
// Returns: { task_id: 30 }

// Batch link decisions
const decisions = ["auth_method", "jwt_secret", "token_expiry"];
decisions.forEach(key => {
  {
    action: "link",
    task_id: 30,
    link_type: "decision",
    link_key: key
  }
});

// Batch link files
const files = ["/src/auth/jwt.ts", "/src/auth/middleware.ts"];
files.forEach(path => {
  {
    action: "link",
    task_id: 30,
    link_type: "file",
    link_path: path
  }
});
```

### 3. Progressive Linking

Add links as task evolves:

```javascript
// Day 1: Create task
{ action: "create", title: "Optimize API performance" }
// Returns: { task_id: 35 }

// Day 2: Link to constraint (discovered during work)
{
  action: "link",
  task_id: 35,
  link_type: "constraint",
  link_id: 5
}

// Day 3: Link to files (as they're modified)
{
  action: "link",
  task_id: 35,
  link_type: "file",
  link_path: "/src/api/routes.ts"
}

// Day 4: Link to decision (made during optimization)
{
  action: "link",
  task_id: 35,
  link_type: "decision",
  link_key: "caching_strategy"
}
```

### 4. Cross-Reference Linking

Link related tasks through shared links:

```javascript
// Task A: Implement auth
{
  action: "link",
  task_id: 40,
  link_type: "decision",
  link_key: "auth_method"
}

// Task B: Add auth middleware (related to Task A)
{
  action: "link",
  task_id: 41,
  link_type: "decision",
  link_key: "auth_method"  // Same decision
}

// Query: Find related tasks
// Both Task A and Task B linked to same decision
```

## Best Practices

### 1. Link Early and Often

```javascript
// ✅ GOOD: Link immediately after creation
const task = create({ action: "create", title: "..." });
link({ action: "link", task_id: task.task_id, link_type: "decision", link_key: "..." });

// ❌ BAD: Forget to link, lose context later
```

### 2. Use Meaningful Links

```javascript
// ✅ GOOD: Link to relevant decision
{
  action: "link",
  task_id: 1,
  link_type: "decision",
  link_key: "auth_method"  // Directly related
}

// ❌ BAD: Link to unrelated decision
{
  action: "link",
  task_id: 1,
  link_type: "decision",
  link_key: "database_choice"  // Not related to auth task
}
```

### 3. Link to Files Being Modified

```javascript
// ✅ GOOD: Link to actual files being changed
{
  action: "link",
  task_id: 5,
  link_type: "file",
  link_path: "/src/auth/jwt.ts"  // Will modify this file
}

// ❌ BAD: Link to unrelated files
{
  action: "link",
  task_id: 5,
  link_type: "file",
  link_path: "/README.md"  // Not modifying this
}
```

### 4. Use Links for Traceability

```javascript
// Implementation flow with full traceability

// 1. Decision made
{ action: "set", key: "auth_method", value: "JWT" }

// 2. Constraint added
{ action: "add", category: "security", constraint_text: "Auth tokens expire in 1h" }
// Returns: { constraint_id: 15 }

// 3. Task created with links
{ action: "create", title: "Implement JWT auth" }
// Returns: { task_id: 50 }

// 4. Link to decision
{ action: "link", task_id: 50, link_type: "decision", link_key: "auth_method" }

// 5. Link to constraint
{ action: "link", task_id: 50, link_type: "constraint", link_id: 15 }

// 6. Link to implementation files
{ action: "link", task_id: 50, link_type: "file", link_path: "/src/auth/jwt.ts" }

// Result: Full traceability from decision → constraint → task → files
```

### 5. Update Links When Scope Changes

```javascript
// Task scope expands
{ action: "update", task_id: 60, description: "Now includes OAuth2 support" }

// Add new decision link
{ action: "link", task_id: 60, link_type: "decision", link_key: "oauth2_provider" }

// Add new file links
{ action: "link", task_id: 60, link_type: "file", link_path: "/src/auth/oauth2.ts" }
```

### 6. Use Links for Impact Analysis

```javascript
// Before changing a constraint, find affected tasks

// SQL: Find tasks linked to constraint 5
SELECT t.* FROM t_tasks t
JOIN t_task_constraint_links tcl ON t.task_id = tcl.task_id
WHERE tcl.constraint_id = 5;

// Review tasks before updating constraint
// Update constraint if safe
// Notify assignees if tasks affected
```

## Related Documentation

- **[TASK_OVERVIEW.md](TASK_OVERVIEW.md)** - Task system overview and core concepts
- **[TASK_ACTIONS.md](TASK_ACTIONS.md)** - Complete action reference with examples
- **[TASK_MIGRATION.md](TASK_MIGRATION.md)** - Migrating from decision-based task tracking
- **[TASK_SYSTEM.md](TASK_SYSTEM.md)** - Complete documentation (original)
- **[AI_AGENT_GUIDE.md](AI_AGENT_GUIDE.md)** - Comprehensive AI agent guide

---

**Version:** 3.0.0
**Last Updated:** 2025-10-17
**Author:** sin5ddd
