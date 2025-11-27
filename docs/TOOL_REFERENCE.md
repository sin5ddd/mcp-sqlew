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

## Parameter Validation

**v4.0.0**: sqlew now provides comprehensive parameter validation with helpful error messages.

### Validation Features

1. **Required vs Optional Detection** - Clear indication of which parameters must be provided
2. **Typo Suggestions** - Levenshtein distance-based suggestions for mistyped parameter names
3. **Structured Error Messages** - JSON format with examples showing correct usage
4. **Visual Markers** - Help responses show 🔴 REQUIRED and ⚪ OPTIONAL parameter markers

### Example Error Message

```json
{
  "error": "Missing required parameter for action 'set': value",
  "action": "set",
  "missing_params": ["value"],
  "required_params": ["key", "value"],
  "optional_params": ["layer", "tags", "status", "version", "scopes"],
  "you_provided": ["key", "layer"],
  "example": {
    "action": "set",
    "key": "database/postgresql-choice",
    "value": "Selected PostgreSQL over MongoDB",
    "layer": "data",
    "tags": ["database", "architecture"]
  },
  "hint": "Use 'quick_set' for simpler usage with auto-inferred metadata"
}
```

### Typo Detection Example

```json
{
  "error": "Unknown parameter for action 'set': tgas",
  "action": "set",
  "invalid_params": ["tgas"],
  "did_you_mean": {
    "tgas": "tags"
  },
  "valid_params": ["action", "key", "value", "layer", "tags", "status", "version", "scopes"],
  "hint": "Parameter names are case-sensitive"
}
```

### Common Validation Errors

| Error Type | Cause | Solution |
|------------|-------|----------|
| Missing required parameter | Omitted required field | Check error message for required_params list |
| Unknown parameter | Typo or invalid field | Check did_you_mean suggestions |
| Wrong parameter for action | Using parameter from different action | Verify action name and consult example |

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

### Basic Suggestion Workflow (v3.9.0)

```javascript
// 1. Check for duplicates before creating
{
  action: "check_duplicate",
  key: "api-rate-limiting",
  tags: ["api", "performance"]
}

// 2. Find related decisions by tags
{
  action: "by_tags",
  tags: ["api", "security"],
  limit: 5
}

// 3. Search by key pattern
{
  action: "by_key",
  key: "api/*",
  limit: 10
}
```

---

## Parameter Validation

sqlew provides structured error messages with examples and typo suggestions to help you fix parameter errors quickly.

### Structured Error Format

When required parameters are missing or incorrect, sqlew returns a detailed JSON error response:

```json
{
  "error": "Missing required parameters for 'set': key",
  "action": "set",
  "missing_params": ["key"],
  "required_params": ["key", "value"],
  "optional_params": ["layer", "tags", "status", "version", "scopes"],
  "you_provided": ["action", "context_key", "value"],
  "did_you_mean": {
    "context_key": "key"
  },
  "example": {
    "action": "set",
    "key": "database/pre-existence-requirement",
    "value": "Database must pre-exist before connection...",
    "layer": "infrastructure",
    "tags": ["database", "security"]
  },
  "hint": "💡 TIP: Use 'quick_set' action for simpler usage with smart defaults"
}
```

### Error Response Fields

| Field | Description |
|-------|-------------|
| **error** | Human-readable error message |
| **action** | The action that was attempted |
| **missing_params** | List of missing required parameters |
| **required_params** | All required parameters for this action |
| **optional_params** | All optional parameters for this action |
| **you_provided** | Parameters you actually provided |
| **did_you_mean** | Typo suggestions (parameter name → correct name) |
| **example** | Working example showing correct usage |
| **hint** | Optional helpful tip for this action |

### Example Error Scenarios

#### Scenario 1: Wrong Parameter Name

```javascript
// ❌ Wrong
{ action: "set", context_key: "db/feature", value: "..." }

// Error Response:
{
  "error": "Missing required parameter 'key' for action 'set'",
  "did_you_mean": { "context_key": "key" },
  "example": { action: "set", key: "db/feature", value: "..." }
}
```

#### Scenario 2: Missing Required Parameter

```javascript
// ❌ Wrong
{ action: "add", category: "architecture", constraint_text: "..." }

// Error Response:
{
  "error": "Missing required parameter 'priority' for action 'add'",
  "required_params": ["category", "constraint_text", "priority"],
  "optional_params": ["layer", "tags", "created_by"],
  "example": {
    action: "add",
    category: "architecture",
    constraint_text: "...",
    priority: "critical"
  }
}
```

#### Scenario 3: Typo Detection

```javascript
// ❌ Wrong
{ action: "add", cat: "architecture", constraint_text: "...", priority: "high" }

// Error Response:
{
  "error": "Missing required parameter 'category' for action 'add'",
  "did_you_mean": { "cat": "category" },
  "example": { ... }
}
```

### Typo Detection

sqlew uses Levenshtein distance (≤2 edits) to detect common typos:

| Common Typo | Suggestion |
|-------------|------------|
| context_key | key |
| constraint | constraint_text |
| cat | category |
| prio | priority |
| msg | message |
| desc | description |

### Best Practices

1. **Read the error response** - It includes everything you need to fix the issue
2. **Check `did_you_mean`** - Often catches simple typos
3. **Copy the example** - Use it as a template for your call
4. **Verify required params** - Make sure you provide all items in `required_params`
5. **Use hints** - Look for simpler alternatives (e.g., `quick_set` vs `set`)

---

## Parameter Requirements by Tool

### `decision` Tool

| Action | Required | Optional |
|--------|----------|----------|
| **set** | action, key, value, layer | version, status, tags, scopes |
| **get** | action, key | version, include_context |
| **list** | action | status, layer, tags, scope, tag_match, limit, offset |
| **search_tags** | action, tags | match_mode, status, layer |
| **search_layer** | action, layer | status, include_tags |
| **versions** | action, key | - |
| **quick_set** | action, key, value | layer, version, status, tags, scopes |
| **search_advanced** | action | layers, tags_all, tags_any, exclude_tags, scopes, updated_after, updated_before, decided_by, statuses, search_text, sort_by, sort_order, limit, offset |
| **set_batch** | action, decisions | atomic |
| **set_from_template** | action, template, key, value, layer | version, status, tags, scopes |
| **create_template** | action, name, defaults | required_fields, created_by |
| **list_templates** | action | - |
| **add_decision_context** | action, key, rationale | alternatives_considered, tradeoffs, decided_by, related_task_id, related_constraint_id |
| **list_decision_contexts** | action | decision_key, related_task_id, related_constraint_id, decided_by, limit, offset |

### `file` Tool

| Action | Required | Optional |
|--------|----------|----------|
| **record** | action, file_path, change_type | layer, description |
| **get** | action | file_path, layer, change_type, since, limit |
| **check_lock** | action, file_path | lock_duration |
| **record_batch** | action, file_changes | atomic |
| **sqlite_flush** | action | - |

### `constraint` Tool

| Action | Required | Optional |
|--------|----------|----------|
| **add** | action, category, constraint_text | priority, layer, tags, created_by |
| **get** | action | category, layer, priority, tags, active_only, limit |
| **deactivate** | action, constraint_id | - |

### `task` Tool

| Action | Required | Optional |
|--------|----------|----------|
| **create** | action, title | description, acceptance_criteria, notes, priority, layer, tags, status, **watch_files** (v3.4.1) |
| **update** | action, task_id | title, priority, layer, description, acceptance_criteria, notes, **watch_files** (v3.4.1) |
| **get** | action, task_id | include_dependencies |
| **list** | action | status, layer, tags, limit, offset, include_dependency_counts |
| **move** | action, task_id, status | rejection_reason (when status="rejected") |
| **link** | action, task_id, link_type, target_id | link_relation (⚠️ link_type="file" deprecated in v3.4.1) |
| **archive** | action, task_id | - |
| **create_batch** | action, tasks | atomic |
| **add_dependency** | action, blocker_task_id, blocked_task_id | - |
| **remove_dependency** | action, blocker_task_id, blocked_task_id | - |
| **get_dependencies** | action, task_id | include_details |
| **watch_files** (v3.4.1) | action, task_id, action (watch/unwatch/list) | file_paths |
| **watcher** | action | subaction (status/list_files/list_tasks/help) |

### `suggest` Tool (v3.9.0)

| Action | Required | Optional |
|--------|----------|----------|
| **by_key** | action, key | limit, min_score, layer |
| **by_tags** | action, tags | limit, min_score, layer |
| **by_context** | action | key, tags, layer, limit, min_score, priority |
| **check_duplicate** | action, key | tags, layer, min_score |
| **help** | action | - |

### `help` Tool (v3.6.0)

| Action | Required | Optional |
|--------|----------|----------|
| **query_action** | action, tool, target_action | - |
| **query_params** | action, tool, target_action | - |
| **query_tool** | action, tool | - |
| **workflow_hints** | action, tool, current_action | - |
| **batch_guide** | action, operation | - |
| **error_recovery** | action, error_message | - |

### `example` Tool (v3.6.0)

| Action | Required | Optional |
|--------|----------|----------|
| **get** | action | tool, action_name, topic |
| **search** | action, keyword | tool, action_name, complexity |
| **list_all** | action | tool, complexity, limit, offset |

### `use_case` Tool (v3.6.0)

| Action | Required | Optional |
|--------|----------|----------|
| **get** | action, use_case_id | - |
| **search** | action, keyword | category, complexity |
| **list_all** | action | category, complexity, limit, offset |

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

#### File Change Batch

```javascript
{
  action: "record_batch",
  atomic: false,
  file_changes: [
    {
      file_path: "src/types.ts",
      change_type: "modified",
      layer: "data"
    },
    {
      file_path: "src/index.ts",
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

## File Watching with Tasks (v3.4.1)

### New: watch_files Parameter

**Replaces:** `task.link(link_type="file")` (deprecated in v3.4.1)

Create tasks with automatic file monitoring in one step:

```javascript
{
  action: "create",
  title: "Implement user authentication",
  watch_files: ["src/auth.ts", "src/auth.test.ts"],
  acceptance_criteria: [
    {type: "tests_pass", command: "npm test auth", expected_pattern: "passing"},
    {type: "code_contains", file: "src/auth.ts", pattern: "export class AuthService"}
  ],
  priority: 3
}
```

**Benefits:**
- 75% fewer MCP calls (1 call vs 4 calls in v3.2.x)
- 35% token reduction
- Clearer intent
- Atomic file registration

### New: watch_files Action

Manage file watches dynamically:

```javascript
// Watch files
{
  action: "watch_files",
  task_id: 123,
  action: "watch",
  file_paths: ["src/auth.ts", "src/middleware/jwt.ts"]
}

// Unwatch files
{
  action: "watch_files",
  task_id: 123,
  action: "unwatch",
  file_paths: ["src/middleware/jwt.ts"]
}

// List watched files
{
  action: "watch_files",
  task_id: 123,
  action: "list"
}
// Response: { files: ["src/auth.ts"], files_count: 1 }
```

### Migration from v3.2.x

**Before (deprecated):**
```javascript
// Create task
{action: "create", title: "Feature"}
// Link files (separate calls)
{action: "link", task_id: 123, link_type: "file", target_id: "src/file1.ts"}
{action: "link", task_id: 123, link_type: "file", target_id: "src/file2.ts"}
```

**After (v3.4.1):**
```javascript
// Create task with files in one call
{
  action: "create",
  title: "Feature",
  watch_files: ["src/file1.ts", "src/file2.ts"]
}
```

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

**FILE_REQUIRED layers** (require file_actions for file tool):
- **presentation**: UI, API endpoints, user-facing interfaces
- **business**: Service logic, workflows, business rules
- **data**: Database models, schemas, data access
- **infrastructure**: Configuration, deployment, DevOps
- **cross-cutting**: Logging, monitoring, security (affects multiple layers)
- **documentation**: README, API docs, technical documentation

**FILE_OPTIONAL layers** (file_actions optional):
- **planning**: Task planning, sprint organization
- **coordination**: Multi-agent coordination, workflow management
- **review**: Code review, architectural review decisions

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
- **archived**: Completed and archived (auto-archived after 48 hours)
- **rejected**: Cancelled or rejected task (terminal state)

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

## Decision Intelligence System (v3.9.0)

### Overview

The Decision Intelligence System provides automatic duplicate detection and smart suggestions when creating decisions. It uses a three-tier approach to handle different similarity levels.

### Three-Tier Detection

| Tier | Score Range | Behavior | Use Case |
|------|-------------|----------|----------|
| **Gentle Nudge** | 35-44 | Non-blocking warning in `duplicate_risk` | May be related, user decides |
| **Hard Block** | 45-59 | Blocking error, requires resolution | Likely duplicate, needs review |
| **Auto-Update** | 60+ | Transparent update of existing decision | Clearly same decision |

### Similarity Scoring

**Total Score: 0-100 points**

| Factor | Max Points | Calculation |
|--------|------------|-------------|
| Tag overlap | 40 | 10 per matching tag (max 4) |
| Layer match | 25 | Same layer = 25, different = 0 |
| Key similarity | 20 | Pattern + Levenshtein distance |
| Recency | 10 | <30 days = 10, decay over time |
| Priority | 5 | Critical = 5, High = 4, etc. |

### Using the suggest Tool

```javascript
// Find by key pattern
{
  action: "by_key",
  key: "api/*/latency",
  limit: 5,
  min_score: 30
}

// Find by tag similarity
{
  action: "by_tags",
  tags: ["performance", "api"],
  limit: 5
}

// Combined search
{
  action: "by_context",
  key: "api/*",
  tags: ["performance"],
  layer: "infrastructure",
  limit: 5
}

// Pre-creation duplicate check
{
  action: "check_duplicate",
  key: "new-decision",
  tags: ["tag1", "tag2"]
}
```

### Auto-Trigger with Policies

Enable automatic duplicate detection in policies:

```javascript
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
```

When a decision matches this policy, suggestions are automatically triggered.

### Bypass Mechanism

Override duplicate detection when needed:

```javascript
{
  action: "set",
  key: "intentionally-similar",
  value: "Different use case",
  tags: ["same", "tags"],
  ignore_suggest: true,  // Skip duplicate detection
  ignore_reason: "Different use case - async tasks vs event bus"
}
```

### Enhanced Response Fields (v3.9.0)

**Tier 1 (Gentle Nudge):**
```json
{
  "success": true,
  "key": "new-decision",
  "duplicate_risk": {
    "severity": "MODERATE",
    "max_score": 42,
    "suggestions": [...]
  }
}
```

**Tier 3 (Auto-Update):**
```json
{
  "success": true,
  "auto_updated": true,
  "requested_key": "similar-key",
  "actual_key": "existing-key",
  "similarity_score": 85,
  "version": "1.0.1"
}
```

### See Also

- **[DECISION_INTELLIGENCE.md](DECISION_INTELLIGENCE.md)** - Comprehensive three-tier system guide

---

## Constraint Intelligence System (v4.0.0)

### Overview

The Constraint Intelligence System provides duplicate detection and similarity-based suggestions for architectural constraints. Use `target: "constraint"` with the suggest tool.

### Scoring

**Total Score: 0-100 points**

| Factor | Max Points | Calculation |
|--------|------------|-------------|
| Tag overlap | 40 | 10 per matching tag (max 4) |
| Layer match | 25 | Same layer = 25, different = 0 |
| Text similarity | 20 | Levenshtein distance |
| Recency | 10 | <30 days = 10, decay over time |
| Priority | 5 | Critical = 5, High = 4, etc. |

### Thresholds

| Threshold | Value | Description |
|-----------|-------|-------------|
| Default min_score | 30 | Minimum score for suggestions |
| Duplicate threshold | 70 | Score triggering duplicate warning |

### Using the suggest Tool for Constraints

```javascript
// Find by text pattern
{
  action: "by_key",
  target: "constraint",  // Required for constraints
  text: "API response time",
  limit: 5
}

// Find by tags
{
  action: "by_tags",
  target: "constraint",
  tags: ["api", "performance"],
  layer: "business"
}

// Combined search
{
  action: "by_context",
  target: "constraint",
  text: "database query",
  tags: ["sql"],
  layer: "data"
}

// Pre-creation duplicate check
{
  action: "check_duplicate",
  target: "constraint",
  text: "API response time must be under 100ms"
}
```

### See Also

- **[CONSTRAINT_INTELLIGENCE.md](CONSTRAINT_INTELLIGENCE.md)** - Comprehensive constraint intelligence guide

---

## Related Documentation

- **[TOOL_SELECTION.md](TOOL_SELECTION.md)** - Choosing the right tool for your task
- **[WORKFLOWS.md](WORKFLOWS.md)** - Multi-step workflow examples
- **[BEST_PRACTICES.md](BEST_PRACTICES.md)** - Common errors and best practices
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Layer definitions and system architecture
- **[AI_AGENT_GUIDE.md](AI_AGENT_GUIDE.md)** - Complete guide (original comprehensive version)
- **[DECISION_INTELLIGENCE.md](DECISION_INTELLIGENCE.md)** - Decision Intelligence System (v3.9.0)
- **[CONSTRAINT_INTELLIGENCE.md](CONSTRAINT_INTELLIGENCE.md)** - Constraint Intelligence System (v4.0.0)
