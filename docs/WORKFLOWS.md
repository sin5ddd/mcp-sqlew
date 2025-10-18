# Multi-Step Workflow Examples

**Comprehensive multi-agent workflows demonstrating coordinated use of multiple sqlew tools**

This document demonstrates real-world scenarios showing how different tools work together in practice.

---

## Workflow 1: Multi-Agent Feature Implementation

**Scenario**: Orchestrator agent coordinates 3 sub-agents to implement a new authentication feature.

### Step 1: Orchestrator Creates Plan

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

### Step 2: Backend Agent Executes Task

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

### Step 3: Orchestrator Monitors Progress

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

## Workflow 2: Breaking Change Migration

**Scenario**: API endpoint is being deprecated and migrated to a new version.

### Phase 1: Announce Deprecation

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

### Phase 2: Track Migration Progress

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

### Phase 3: Complete Migration

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

## Workflow 3: Session Continuity (Cross-Session Context)

**Scenario**: Agent needs to resume work after restart or handoff to another agent.

### Agent A: Record Context Before Exit

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

### Agent B: Resume Work

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

## Workflow 4: Update Polling Pattern (Efficient Subscription)

**Scenario**: Monitor agent watches for specific changes and reacts accordingly.

### Monitor Agent: Efficient Polling Loop

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

### Activity Log Analysis

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

### Automatic Cleanup Trigger

```javascript
// Monitor can also manage database health
{
  action: "db_stats"
}

// Response:
// {
//   agents: 5,
//   files: 42,
//   context_keys: 156,
//   active_decisions: 312,
//   total_decisions: 342,
//   messages: 1203,
//   file_changes: 589,
//   active_constraints: 12,
//   total_constraints: 15,
//   tags: 10,
//   scopes: 8,
//   layers: 5,
//   total_tasks: 47,
//   active_tasks: 23,  // Excludes done and archived
//   tasks_by_status: {
//     todo: 15,
//     in_progress: 5,
//     waiting_review: 3,
//     blocked: 0,
//     done: 20,
//     archived: 4
//   },
//   tasks_by_priority: {
//     low: 10,
//     medium: 25,
//     high: 10,
//     critical: 2
//   }
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

## Related Documentation

- **[TOOL_SELECTION.md](TOOL_SELECTION.md)** - Choosing the right tool for your task
- **[TOOL_REFERENCE.md](TOOL_REFERENCE.md)** - Complete parameter reference
- **[BEST_PRACTICES.md](BEST_PRACTICES.md)** - Common errors and best practices
- **[AI_AGENT_GUIDE.md](AI_AGENT_GUIDE.md)** - Complete guide (original comprehensive version)
