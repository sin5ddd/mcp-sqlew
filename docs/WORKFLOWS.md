# Multi-Step Workflow Examples

**Comprehensive workflows demonstrating coordinated use of multiple sqlew tools**

This document demonstrates real-world scenarios showing how different tools work together in practice. All workflows are v4.0.0 compatible and focus on decision → constraint → task workflows without the agent system.

---

## Workflow 1: Feature Implementation Planning

**Scenario**: Plan and track implementation of a new authentication feature across multiple layers (business logic, API, database).

### Phase 1: Record Architectural Decision

```javascript
// 1. Record the architecture decision
{
  action: "set",
  key: "auth_v2_implementation",
  value: "Implement OAuth2 + JWT refresh token system for v2.0.0 release",
  layer: "business",
  tags: ["auth", "feature", "v2.0.0"]
}

// 2. Add security constraints
{
  action: "add",
  category: "security",
  constraint_text: "All auth tokens must expire within 15 minutes",
  priority: "critical",
  layer: "business",
  tags: ["auth", "security"]
}

// 3. Add architectural constraint
{
  action: "add",
  category: "architecture",
  constraint_text: "OAuth2 integration must use provider-agnostic abstraction layer",
  priority: "high",
  layer: "business",
  tags: ["auth", "architecture"]
}
```

### Phase 2: Create Implementation Tasks

```javascript
// Create implementation tasks for different layers
{
  action: "create_batch",
  atomic: false,
  tasks: [
    {
      title: "Implement OAuth2 provider integration",
      description: "Create OAuth2 service with support for Google and GitHub providers",
      layer: "business",
      priority: 4,
      tags: ["auth", "oauth2"],
      status: "todo",
      watch_files: ["src/auth/oauth2.ts", "src/auth/providers/"]
    },
    {
      title: "Create JWT token refresh endpoint",
      description: "Implement /auth/refresh endpoint with token rotation",
      layer: "presentation",
      priority: 4,
      tags: ["auth", "api"],
      status: "todo",
      watch_files: ["src/routes/auth.ts"]
    },
    {
      title: "Update auth database schema",
      description: "Add oauth_tokens table and migration for token storage",
      layer: "data",
      priority: 4,
      tags: ["auth", "database"],
      status: "todo",
      watch_files: ["src/db/migrations/", "src/db/schema.ts"]
    }
  ]
}
```

### Phase 3: Track Progress

```javascript
// As implementation progresses, record file changes
{
  action: "record",
  file_path: "src/auth/oauth2.ts",
  change_type: "created",
  layer: "business",
  description: "OAuth2 provider integration with provider abstraction"
}

// Link tasks to the architectural decision
{
  action: "link",
  task_id: 1,
  link_type: "decision",
  target_id: "auth_v2_implementation",
  link_relation: "implements"
}

// Move tasks through workflow
{
  action: "move",
  task_id: 1,
  status: "in_progress"
}

// Record additional file changes
{
  action: "record",
  file_path: "src/auth/jwt.ts",
  change_type: "created",
  layer: "business",
  description: "JWT token generation and refresh logic"
}

// Update task status
{
  action: "move",
  task_id: 1,
  status: "waiting_review"
}
```

### Phase 4: Verify Constraints Compliance

```javascript
// Check that all constraints are satisfied
{
  action: "get",
  category: "security",
  layer: "business",
  tags: ["auth"]
}

// Record completion decision
{
  action: "set",
  key: "auth_v2_implementation_complete",
  value: "OAuth2 + JWT implementation complete and tested",
  layer: "business",
  tags: ["auth", "v2.0.0", "completed"],
  status: "active"
}

// Complete all related tasks
{
  action: "move",
  task_id: 1,
  status: "done"
}

{
  action: "move",
  task_id: 2,
  status: "done"
}

{
  action: "move",
  task_id: 3,
  status: "done"
}
```

---

## Workflow 2: Breaking Change Migration

**Scenario**: API endpoint is being deprecated and migrated to a new version.

### Phase 1: Document Deprecation Decision

```javascript
// 1. Record deprecation decision
{
  action: "set",
  key: "api_v1_users_endpoint_deprecated",
  value: "/v1/users endpoint deprecated, use /v2/users instead. Sunset date: 2025-12-01",
  layer: "presentation",
  tags: ["api", "deprecation", "v2.0.0"]
}

// 2. Add migration constraint
{
  action: "add",
  category: "architecture",
  constraint_text: "All new API endpoints must use /v2 prefix and maintain backwards compatibility for 30 days",
  priority: "high",
  layer: "presentation",
  tags: ["api", "migration"]
}

// 3. Add timeline constraint
{
  action: "add",
  category: "timeline",
  constraint_text: "/v1/users endpoint sunset on 2025-12-01",
  priority: "high",
  layer: "presentation",
  tags: ["api", "deprecation", "deadline"]
}

// 4. Create migration task
{
  action: "create",
  title: "Migrate API clients to /v2/users endpoint",
  description: "Update all client integrations to use new /v2/users endpoint before sunset",
  acceptance_criteria: "All documented clients successfully calling /v2/users with no errors; /v1 endpoint deprecated in docs",
  layer: "presentation",
  priority: 3,
  tags: ["migration", "client", "api"],
  status: "todo",
  watch_files: ["src/routes/api/", "docs/api/"]
}
```

### Phase 2: Implement Migration

```javascript
// 1. Create the new v2 endpoint implementation task
{
  action: "create",
  title: "Implement /v2/users endpoint",
  description: "Create new v2 endpoint with enhanced response format",
  layer: "presentation",
  priority: 4,
  tags: ["api", "v2", "implementation"],
  status: "todo",
  watch_files: ["src/routes/users.ts"]
}

// 2. Record implementation changes
{
  action: "record",
  file_path: "src/routes/users.ts",
  change_type: "modified",
  layer: "presentation",
  description: "Added /v2/users endpoint with enhanced response schema"
}

// 3. Record backwards compatibility changes
{
  action: "record",
  file_path: "src/routes/api.ts",
  change_type: "modified",
  layer: "presentation",
  description: "Updated /v1/users to redirect to /v2/users with deprecation warning header"
}

// 4. Link tasks to the deprecation decision
{
  action: "link",
  task_id: 1,
  link_type: "decision",
  target_id: "api_v1_users_endpoint_deprecated",
  link_relation: "implements"
}

// 5. Move endpoint implementation to in progress
{
  action: "move",
  task_id: 2,
  status: "in_progress"
}
```

### Phase 3: Client Migration

```javascript
// 1. Record documentation updates
{
  action: "record",
  file_path: "docs/api/endpoints.md",
  change_type: "modified",
  layer: "documentation",
  description: "Updated API docs - marked /v1/users as deprecated, added /v2/users examples"
}

// 2. Update migration task status
{
  action: "move",
  task_id: 1,
  status: "in_progress"
}

// 3. Record client update changes (example for one client)
{
  action: "record_batch",
  atomic: false,
  file_changes: [
    {
      file_path: "integrations/client-sdk/src/api.ts",
      change_type: "modified",
      layer: "presentation",
      description: "Updated to use /v2/users endpoint"
    },
    {
      file_path: "integrations/client-sdk/CHANGELOG.md",
      change_type: "modified",
      layer: "documentation",
      description: "Documented migration from /v1/users to /v2/users"
    }
  ]
}
```

### Phase 4: Complete and Deactivate

```javascript
// 1. Create decision confirming migration completion
{
  action: "set",
  key: "api_v2_migration_complete",
  value: "All documented clients have been migrated to /v2/users endpoint",
  layer: "presentation",
  tags: ["api", "migration", "complete"],
  status: "active"
}

// 2. Deactivate migration constraints (v1 now removed)
{
  action: "deactivate",
  constraint_id: 1
}

// 3. Complete implementation task
{
  action: "move",
  task_id: 2,
  status: "done"
}

// 4. Complete migration task
{
  action: "move",
  task_id: 1,
  status: "done"
}

// 5. Create decision to schedule v1 removal
{
  action: "set",
  key: "api_v1_users_removal_scheduled",
  value: "Schedule removal of /v1/users endpoint after 2025-12-01 sunset",
  layer: "presentation",
  tags: ["api", "cleanup"],
  status: "active"
}
```

---

## Workflow 3: Context Recovery and Task Continuation

**Scenario**: Resume complex refactoring work across multiple files, tracking progress and constraints.

### Phase 1: Record Work-In-Progress State

```javascript
// 1. Save refactoring scope and current state
{
  action: "set",
  key: "refactor_auth_module_state",
  value: "Refactoring auth module: Completed 3/5 files. Current: src/auth/oauth2.ts line 145 - token refresh logic needs review",
  layer: "business",
  tags: ["refactor", "auth", "wip"],
  scopes: ["auth-module"]
}

// 2. Create or update refactoring task with detailed notes
{
  action: "create",
  title: "Refactor authentication module (5 files)",
  description: "Modernize auth module with improved separation of concerns. Files: oauth2, jwt, session, mfa, providers",
  acceptance_criteria: "All 5 files refactored; tests passing; no breaking API changes",
  layer: "business",
  priority: 3,
  tags: ["refactor", "auth"],
  status: "in_progress"
}

// 3. Create sub-tasks for each file
{
  action: "create_batch",
  atomic: false,
  tasks: [
    {
      title: "Refactor oauth2.ts - provider abstraction",
      layer: "business",
      priority: 3,
      tags: ["refactor", "auth", "oauth2"],
      status: "in_progress",
      watch_files: ["src/auth/oauth2.ts"]
    },
    {
      title: "Refactor jwt.ts - token generation",
      layer: "business",
      priority: 3,
      tags: ["refactor", "auth", "jwt"],
      status: "todo",
      watch_files: ["src/auth/jwt.ts"]
    },
    {
      title: "Refactor session.ts - session management",
      layer: "business",
      priority: 3,
      tags: ["refactor", "auth", "session"],
      status: "todo",
      watch_files: ["src/auth/session.ts"]
    }
  ]
}
```

### Phase 2: Record Current Progress

```javascript
// Record WIP changes to oauth2.ts (incomplete work)
{
  action: "record",
  file_path: "src/auth/oauth2.ts",
  change_type: "modified",
  layer: "business",
  description: "WIP: Refactoring provider abstraction - token refresh logic needs review before proceeding"
}

// Retrieve context for resuming work
{
  action: "get",
  key: "refactor_auth_module_state"
}

// Check recent file changes to understand what's been modified
{
  action: "get",
  file_path: "src/auth/oauth2.ts",
  since: "2025-10-17T00:00:00Z"
}

// Check related constraints
{
  action: "get",
  layer: "business",
  tags: ["auth"],
  active_only: true
}
```

### Phase 3: Resume Work and Track Progress

```javascript
// After review, move oauth2 task forward
{
  action: "move",
  task_id: 1,  // oauth2 refactor task
  status: "waiting_review"
}

// Record additional changes to oauth2.ts
{
  action: "record",
  file_path: "src/auth/oauth2.ts",
  change_type: "modified",
  layer: "business",
  description: "Provider abstraction refactoring complete - added factory pattern for provider creation"
}

// Move to next file in refactoring sequence
{
  action: "move",
  task_id: 1,
  status: "done"
}

{
  action: "move",
  task_id: 2,  // jwt.ts refactor task
  status: "in_progress"
}

// Record JWT refactoring changes
{
  action: "record",
  file_path: "src/auth/jwt.ts",
  change_type: "modified",
  layer: "business",
  description: "JWT token generation refactored - separated signing and verification concerns"
}
```

### Phase 4: Complete Refactoring and Track Completion

```javascript
// Mark JWT refactoring complete
{
  action: "move",
  task_id: 2,
  status: "done"
}

// Move to session refactoring
{
  action: "move",
  task_id: 3,
  status: "in_progress"
}

// Record session refactoring
{
  action: "record_batch",
  atomic: false,
  file_changes: [
    {
      file_path: "src/auth/session.ts",
      change_type: "modified",
      layer: "business",
      description: "Session management refactored - improved cookie handling and timeout logic"
    },
    {
      file_path: "src/auth/index.ts",
      change_type: "modified",
      layer: "business",
      description: "Updated module exports - all submodules now expose clean APIs"
    }
  ]
}

// Record completion of refactoring work
{
  action: "set",
  key: "refactor_auth_module_complete",
  value: "Auth module refactoring complete - all 5 files modernized with improved separation of concerns",
  layer: "business",
  tags: ["refactor", "auth", "completed"],
  status: "active"
}

// Mark main task and subtasks as complete
{
  action: "move",
  task_id: 3,
  status: "done"
}

{
  action: "move",
  task_id: 1,  // Main refactoring task
  status: "done"
}
```

---

## Workflow 4: Status Monitoring and Health Checks

**Scenario**: Monitor project health by tracking task statuses, constraints compliance, and identifying blocked work.

### Phase 1: Check Task Status and Blocked Items

```javascript
// 1. Get all active tasks
{
  action: "list",
  status: "in_progress,waiting_review",
  limit: 20
}

// 2. Identify blocked tasks requiring attention
{
  action: "list",
  status: "blocked",
  priority: "high,critical"
}

// 3. Check for tasks with dependencies that might cause delays
{
  action: "list",
  tags: ["critical"],
  status: "todo,waiting_review"
}

// 4. Create decision tracking monitoring scope
{
  action: "set",
  key: "project_health_check_2025_11_27",
  value: "Health check timestamp and baseline metrics",
  layer: "planning",
  tags: ["monitoring", "health-check"],
  status: "active"
}
```

### Phase 2: Constraint Compliance Review

```javascript
// 1. Get all active constraints
{
  action: "get",
  active_only: true
}

// 2. Check constraints by priority
{
  action: "get",
  priority: "critical,high",
  active_only: true
}

// 3. Check constraints by specific layers
{
  action: "get",
  layer: "business,cross-cutting",
  active_only: true
}

// 4. Check constraints that might conflict
{
  action: "get",
  category: "architecture",
  active_only: true
}
```

### Phase 3: Decision Review and Consistency

```javascript
// 1. Search for recent decisions
{
  action: "search",
  layer: "business",
  limit: 20
}

// 2. Check for potentially conflicting decisions
{
  action: "search",
  tags: ["breaking-change"],
  layer: "presentation"
}

// 3. Look for stale or inactive decisions
{
  action: "search",
  status: "inactive",
  limit: 10
}

// 4. Verify decision implementation with tasks
{
  action: "list",
  tags: ["implementation"],
  status: "todo"
}
```

### Phase 4: Database Health and Cleanup

```javascript
// 1. Check overall statistics
{
  action: "stats"
}

// Response includes:
// {
//   files: 42,
//   context_keys: 156,
//   active_decisions: 312,
//   total_decisions: 342,
//   file_changes: 589,
//   active_constraints: 12,
//   total_constraints: 15,
//   tags: 10,
//   scopes: 8,
//   layers: 9,
//   total_tasks: 47,
//   active_tasks: 23,
//   tasks_by_status: {
//     todo: 15,
//     in_progress: 5,
//     waiting_review: 3,
//     blocked: 2,
//     done: 20,
//     archived: 4
//   }
// }

// 2. Identify old file changes for cleanup
{
  action: "get",
  file_path: "src/",
  since: "2025-10-17T00:00:00Z"  // Last 40 days
}

// 3. Check for excessive file history
// If file_changes are too numerous, create cleanup decision
{
  action: "set",
  key: "database_cleanup_scheduled",
  value: "Archive old file history and inactive decisions older than 30 days",
  layer: "infrastructure",
  tags: ["maintenance", "cleanup"],
  status: "active"
}

// 4. Document cleanup action
{
  action: "create",
  title: "Clean up old file changes and inactive decisions",
  description: "Archive file_changes older than 30 days to reduce database size",
  layer: "infrastructure",
  priority: 1,
  tags: ["maintenance"],
  status: "todo"
}
```

### Phase 5: Report and Document Findings

```javascript
// 1. Create monitoring decision with findings
{
  action: "set",
  key: "health_check_findings_2025_11_27",
  value: "Health check complete: 2 blocked tasks, 1 critical constraint violation, database size nominal",
  layer: "review",
  tags: ["monitoring", "health-check"],
  status: "active"
}

// 2. If issues found, create tasks to address them
{
  action: "create_batch",
  atomic: false,
  tasks: [
    {
      title: "Unblock database migration task",
      description: "Database schema task blocked by dependency - review and unblock",
      layer: "data",
      priority: 4,
      tags: ["blocker", "critical"],
      status: "todo"
    },
    {
      title: "Review constraint violation in API layer",
      description: "Check why new API endpoint violates backwards compatibility constraint",
      layer: "presentation",
      priority: 4,
      tags: ["constraint", "violation"],
      status: "todo"
    }
  ]
}

// 3. Document health check completion
{
  action: "record",
  file_path: "docs/monitoring/health-checks.md",
  change_type: "modified",
  layer: "documentation",
  description: "Added health check report for 2025-11-27"
}
```

---

## Workflow 5: Decision Intelligence & Duplicate Prevention (v3.9.0)

**Scenario**: Agent maintains decision consistency using the three-tier duplicate detection system.

### Step 1: Check for Existing Decisions Before Creating

```javascript
// 1. Search for related decisions by key pattern
{
  action: "by_key",
  key: "api/*/authentication",
  limit: 5,
  min_score: 30
}

// 2. Check for duplicates by tags
{
  action: "by_tags",
  tags: ["api", "security", "authentication"],
  limit: 5
}

// 3. Pre-creation duplicate check
{
  action: "check_duplicate",
  key: "api-authentication-jwt",
  tags: ["api", "security", "jwt"]
}
```

### Step 2: Handle Three-Tier Responses

```javascript
// Tier 1: Gentle Nudge (35-44 score)
// Decision is created but with warnings
{
  action: "set",
  key: "api-rate-limiting-v2",
  value: "100 requests/minute for free tier",
  layer: "infrastructure",
  tags: ["api", "rate-limiting", "performance"]
}

// Response includes duplicate_risk:
// {
//   "success": true,
//   "key": "api-rate-limiting-v2",
//   "duplicate_risk": {
//     "severity": "MODERATE",
//     "max_score": 42,
//     "suggestions": [{
//       "key": "api-rate-limiting",
//       "score": 42,
//       "reasoning": "2 matching tags, same layer"
//     }]
//   }
// }

// Tier 2: Hard Block (45-59 score)
// Must update existing or bypass
{
  action: "set",
  key: "api-throttling",
  value: "100 requests/minute for free tier",  // Nearly identical
  layer: "infrastructure",
  tags: ["api", "rate-limiting", "performance"],
  // Option A: Update existing decision
  // Option B: Bypass with reason
  ignore_suggest: true,
  ignore_reason: "Different use case - async queue vs real-time API"
}

// Tier 3: Auto-Update (60+ score)
// Transparently updates existing decision
{
  action: "set",
  key: "api-rate-limit-config",
  value: "Updated: 150 requests/minute for free tier",
  layer: "infrastructure",
  tags: ["api", "rate-limiting", "performance"]
}

// Response shows auto-update:
// {
//   "success": true,
//   "auto_updated": true,
//   "requested_key": "api-rate-limit-config",
//   "actual_key": "api-rate-limiting",
//   "similarity_score": 85,
//   "version": "1.0.1"
// }
```

### Step 3: Policy-Based Auto-Triggering

```javascript
// 1. Create policy with suggestion enabled
{
  action: "create_policy",
  name: "security-decisions",
  defaults: {
    layer: "cross-cutting",
    tags: ["security"]
  },
  suggest_similar: 1,  // Enable auto-trigger
  validation_rules: {
    patterns: { key: "^security/" }
  }
}

// 2. All security/* decisions now auto-check for duplicates
{
  action: "set",
  key: "security/jwt-expiration",
  value: "15 minute token expiration",
  tags: ["security", "jwt", "authentication"]
  // Auto-triggers duplicate detection!
}

// Response includes suggestions:
// {
//   "success": true,
//   "key": "security/jwt-expiration",
//   "suggestions": {
//     "triggered_by": "security-decisions",
//     "reason": "Policy has suggest_similar enabled",
//     "suggestions": [...]
//   }
// }
```

### Step 4: Context-Aware Search

```javascript
// Hybrid search combining multiple factors
{
  action: "by_context",
  key: "api/*",
  tags: ["security", "performance"],
  layer: "infrastructure",
  priority: 3,
  limit: 5
}

// Returns decisions matching:
// - Key pattern: api/*
// - Tags: security, performance
// - Layer: infrastructure
// - Priority: high (3)
```

### Token Efficiency

**Suggest Tool Savings:**
- Pattern search: ~50-100 tokens vs manual scanning
- Duplicate detection: ~100 tokens vs creating duplicates
- Auto-update: Eliminates error handling overhead

**Best Practice**: Always use `check_duplicate` before `set` for high-value decisions.

---

## Related Documentation

- **[TOOL_SELECTION.md](TOOL_SELECTION.md)** - Choosing the right tool for your task
- **[TOOL_REFERENCE.md](TOOL_REFERENCE.md)** - Complete parameter reference for all 6 MCP tools
- **[BEST_PRACTICES.md](BEST_PRACTICES.md)** - Common errors and best practices
- **[DECISION_CONTEXT.md](DECISION_CONTEXT.md)** - Managing decision rationale and alternatives
- **[TASK_OVERVIEW.md](TASK_OVERVIEW.md)** - Task system architecture and workflows
