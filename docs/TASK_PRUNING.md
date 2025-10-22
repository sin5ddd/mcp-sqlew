# Task File Auto-Pruning (v3.5.0)

**Feature**: Automatic removal of non-existent watched files with audit trail preservation

**Problem Solved**: Tasks watching planned files that were never created during implementation block quality gates indefinitely. Auto-pruning maintains clean watch lists while preserving project archaeology.

---

## Table of Contents

- [Overview](#overview)
- [How It Works](#how-it-works)
- [Safety Checks](#safety-checks)
- [Audit Trail](#audit-trail)
- [MCP Actions](#mcp-actions)
- [Use Cases](#use-cases)
- [Best Practices](#best-practices)
- [Configuration](#configuration)
- [Examples](#examples)

---

## Overview

### The Problem

When implementing features, AI agents often watch files that represent planned work:
- `src/api/new-endpoint.ts` - endpoint that was never needed
- `src/utils/helper.ts` - functionality absorbed into existing code
- `tests/integration/feature-x.test.ts` - test file that wasn't created

When these files remain non-existent, tasks cannot transition to `waiting_review` because the quality gate requires ALL watched files to be modified. This blocks workflow progression.

### The Solution

**v3.5.0 Auto-Pruning** automatically removes non-existent watched files when tasks transition to `waiting_review`, while preserving a complete audit trail for project archaeology.

### Key Benefits

1. **Clean Watch Lists**: Non-existent files removed automatically
2. **Audit Trail**: Every pruned file recorded with timestamp
3. **Decision Linking**: Optional WHY reasoning for project archaeology
4. **Safety Checks**: Cannot complete tasks with zero work done
5. **Zero Configuration**: Works out of the box

---

## How It Works

### Trigger Point

Auto-pruning is triggered during the `in_progress → waiting_review` transition in the `detectAndTransitionToReview()` function. This timing ensures:
- Files are checked only when work is considered "complete"
- Pruning happens before quality gate validation
- No manual intervention required

### Execution Flow

```
1. Task idle for configured time (default: 3 minutes)
2. detectAndTransitionToReview() runs periodic check
3. FOR EACH candidate task:
   a. Get watched files
   b. Check filesystem existence
   c. Identify non-existent files
   d. **SAFETY CHECK**: If ALL files non-existent → BLOCK transition
   e. Prune non-existent files
   f. Record to t_task_pruned_files audit table
   g. Remove from t_task_file_links
   h. Continue with quality gate checks on remaining files
4. Transition to waiting_review (if quality gates pass)
```

### Database Changes

**Table Created**: `t_task_pruned_files`
```sql
CREATE TABLE t_task_pruned_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES t_tasks(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  pruned_ts INTEGER DEFAULT (unixepoch()),
  linked_decision_id INTEGER REFERENCES t_decisions(id) ON DELETE SET NULL
);
```

**Indexes**:
- `idx_pruned_task`: Fast lookup by task
- `idx_pruned_decision`: Fast lookup by linked decision

---

## Safety Checks

### Zero-Work Prevention

**Rule**: If ALL watched files are non-existent, the transition is BLOCKED.

**Rationale**: A task with no existing files indicates no actual work was performed. This prevents tasks from being marked complete when they should be closed or re-scoped.

**Behavior**:
```typescript
// Example: Task watches 3 files, all non-existent
watchedFiles = [
  "src/feature-a.ts",  // doesn't exist
  "src/feature-b.ts",  // doesn't exist
  "tests/feature.test.ts"  // doesn't exist
]

// Auto-prune attempts to run
// Safety check triggers: ALL files non-existent
// Error: "Cannot prune files for task #42: ALL 3 watched files are non-existent..."
// Task stays in 'in_progress'
```

**Resolution Options**:
1. Verify at least one watched file exists (create placeholder if needed)
2. Mark task as invalid and close manually
3. Update watch list to include files that actually exist

### Partial Pruning

**Rule**: If SOME files are non-existent, only those files are pruned.

**Behavior**:
```typescript
// Example: Task watches 3 files, 1 non-existent
watchedFiles = [
  "src/feature-a.ts",  // exists
  "src/feature-b.ts",  // doesn't exist
  "tests/feature.test.ts"  // exists
]

// Auto-prune runs
// Prunes: src/feature-b.ts
// Keeps: src/feature-a.ts, tests/feature.test.ts
// Records pruned file to audit table
// Task continues to waiting_review
```

---

## Audit Trail

### Purpose

The audit trail enables project archaeology:
- **Post-Mortem Analysis**: Understand why planned files weren't created
- **Architecture Reviews**: Track scope changes during implementation
- **Team Handoffs**: Explain decisions to future developers
- **Decision History**: Link to architectural decisions

### Data Preserved

For each pruned file:
- **file_path**: Raw path string (not normalized)
- **pruned_ts**: Unix timestamp when pruned
- **task_id**: Task that watched this file
- **linked_decision_id**: Optional link to decision explaining WHY

### Persistence

**Pruned files survive task archival** - audit records remain even after tasks are archived, enabling long-term project archaeology.

---

## MCP Actions

### get_pruned_files

Retrieve audit trail for a task.

**Action**: `get_pruned_files`

**Parameters**:
- `task_id` (required): Task ID
- `limit` (optional): Max results (default: 100)

**Example Request**:
```json
{
  "action": "get_pruned_files",
  "task_id": 42,
  "limit": 50
}
```

**Example Response**:
```json
{
  "success": true,
  "task_id": 42,
  "count": 2,
  "pruned_files": [
    {
      "id": 15,
      "file_path": "src/api/v2/endpoint.ts",
      "pruned_at": "2025-10-22 08:15:23",
      "linked_decision": "api-v1-sufficient"
    },
    {
      "id": 14,
      "file_path": "src/utils/deprecated.ts",
      "pruned_at": "2025-10-22 08:15:23",
      "linked_decision": null
    }
  ],
  "message": "Found 2 pruned file(s) for task 42"
}
```

### link_pruned_file

Attach WHY reasoning to a pruned file.

**Action**: `link_pruned_file`

**Parameters**:
- `pruned_file_id` (required): Pruned file record ID
- `decision_key` (required): Decision key to link

**Example Request**:
```json
{
  "action": "link_pruned_file",
  "pruned_file_id": 15,
  "decision_key": "api-v1-sufficient"
}
```

**Example Response**:
```json
{
  "success": true,
  "pruned_file_id": 15,
  "decision_key": "api-v1-sufficient",
  "task_id": 42,
  "file_path": "src/api/v2/endpoint.ts",
  "message": "Linked pruned file \"src/api/v2/endpoint.ts\" to decision \"api-v1-sufficient\""
}
```

---

## Use Cases

### Use Case 1: Endpoint Not Needed

**Scenario**: Task planned to create `/api/v2/users` but during implementation, realized v1 endpoint was sufficient.

**Workflow**:
1. Task created with watch files: `["src/api/v2/users.ts", "tests/api/v2/users.test.ts"]`
2. During implementation, agent updates existing v1 endpoint instead
3. Agent creates decision: `api-v1-sufficient` explaining why v2 wasn't needed
4. Task transitions to `waiting_review`
5. Auto-prune detects non-existent files, prunes them, records to audit
6. Agent links pruned files to decision via `link_pruned_file`
7. Future developers can see WHY v2 wasn't created

**Commands**:
```bash
# 1. Create decision
mcp-tool decision set \
  --key "api-v1-sufficient" \
  --value "v1 endpoint handles all current requirements" \
  --layer "presentation"

# 2. Get pruned files (after auto-prune)
mcp-tool task get_pruned_files --task_id 42

# 3. Link decision to pruned files
mcp-tool task link_pruned_file \
  --pruned_file_id 15 \
  --decision_key "api-v1-sufficient"
```

### Use Case 2: Feature Absorbed into Existing Code

**Scenario**: Planned utility module absorbed into existing helper.

**Workflow**:
1. Task watches `src/utils/new-helper.ts`
2. During implementation, functionality added to `src/utils/existing-helper.ts`
3. Auto-prune removes non-existent `new-helper.ts`
4. Audit trail shows the file was planned but not created

### Use Case 3: Test Strategy Changed

**Scenario**: Planned integration tests replaced with unit tests.

**Workflow**:
1. Task watches `tests/integration/feature-x.test.ts`
2. Team decides unit tests are sufficient
3. Auto-prune removes integration test file
4. Decision linked explaining test strategy change

---

## Best Practices

### 1. Document WHY with Decisions

**DO**: Link pruned files to decisions explaining reasoning
```bash
# Create decision first
task.decision.set({
  key: "feature-x-scope-reduced",
  value: "Feature X simplified during implementation"
})

# Link after pruning
task.link_pruned_file({
  pruned_file_id: 15,
  decision_key: "feature-x-scope-reduced"
})
```

**DON'T**: Leave pruned files undocumented
```bash
# Missing context - future developers won't understand why
# (no decision link)
```

### 2. Review Pruned Files Regularly

**DO**: Periodically review audit trail for patterns
```bash
# Check recent prunings across all tasks
task.get_pruned_files({ limit: 50 })
```

**DON'T**: Ignore pruned files - they indicate planning issues

### 3. Use Pruning as Feedback

**DO**: Treat frequent pruning as a signal to improve planning
- If many files are pruned, planning phase needs refinement
- Consider more conservative watch lists
- Focus on must-have files only

### 4. Leverage for Post-Mortems

**DO**: Use audit trail during sprint retrospectives
```sql
-- Query pruned files for sprint analysis
SELECT
  t.title,
  tpf.file_path,
  datetime(tpf.pruned_ts, 'unixepoch') as pruned_at,
  k.key as decision
FROM t_task_pruned_files tpf
JOIN t_tasks t ON tpf.task_id = t.id
LEFT JOIN t_decisions d ON tpf.linked_decision_id = d.id
LEFT JOIN m_context_keys k ON d.key_id = k.id
WHERE tpf.pruned_ts >= unixepoch('now', '-7 days')
ORDER BY tpf.pruned_ts DESC;
```

---

## Configuration

### Auto-Prune Timing

Auto-pruning runs as part of `detectAndTransitionToReview()`, triggered by:
- **Task idle time**: Default 3 minutes (configurable via `review_idle_minutes`)
- **Periodic checks**: Runs on database initialization and periodically

**Configuration Keys**:
- `review_idle_minutes`: Time before considering task for review (default: 3)
- `review_require_all_files_modified`: Quality gate setting (default: true)

**Change Configuration**:
```bash
# Via MCP tool
mcp-tool config update --key review_idle_minutes --value 5

# Via SQL
UPDATE m_config SET value = '5' WHERE key = 'review_idle_minutes';
```

### Quality Gates

Auto-pruning works in conjunction with quality gates:
1. **File Existence Check**: Prunes non-existent files
2. **File Modification Check**: Validates remaining files were modified
3. **Compilation Check**: Ensures TypeScript compiles (if applicable)
4. **Test Check**: Validates tests pass (if applicable)

---

## Examples

### Example 1: Simple Pruning

```typescript
// Task watches 2 files
watchedFiles = ["src/feature.ts", "src/helper.ts"]

// During implementation, helper absorbed into feature.ts
// helper.ts never created

// Auto-prune runs:
// ✓ Checks: feature.ts exists
// ✗ Checks: helper.ts doesn't exist
// → Prunes helper.ts
// → Records: { file_path: "src/helper.ts", pruned_ts: 1729584000 }
// → Task continues to waiting_review
```

### Example 2: Safety Check Triggered

```typescript
// Task watches 3 files, NONE exist
watchedFiles = ["a.ts", "b.ts", "c.ts"]

// Auto-prune runs:
// ✗ ALL files non-existent
// → Safety check blocks transition
// → Error: "Cannot prune files for task #X: ALL 3 watched files are non-existent"
// → Task stays in_progress
```

### Example 3: Full Workflow with Decision Linking

```typescript
// 1. Create task with watch files
const task = await task.create({
  title: "Implement feature X",
  watch_files: ["src/feature-x.ts", "src/feature-x-helper.ts"]
});

// 2. During work, agent creates only feature-x.ts
// (feature-x-helper absorbed into main file)

// 3. Agent documents decision
await decision.set({
  key: "feature-x-no-helper",
  value: "Helper functions absorbed into main module for simplicity",
  layer: "business"
});

// 4. Task becomes idle > 3 minutes
// Auto-prune runs automatically:
// - Detects feature-x-helper.ts doesn't exist
// - Prunes it
// - Records to t_task_pruned_files

// 5. Agent links decision to pruned file
const pruned = await task.get_pruned_files({ task_id: task.id });
await task.link_pruned_file({
  pruned_file_id: pruned.pruned_files[0].id,
  decision_key: "feature-x-no-helper"
});

// 6. Future developers can query:
// "Why was feature-x-helper.ts never created?"
// Answer: Linked to decision "feature-x-no-helper"
```

---

## Technical Details

### Database Schema

```sql
-- Audit table
CREATE TABLE t_task_pruned_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES t_tasks(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  pruned_ts INTEGER DEFAULT (unixepoch()),
  linked_decision_id INTEGER REFERENCES t_decisions(id) ON DELETE SET NULL
);

-- Indexes
CREATE INDEX idx_pruned_task ON t_task_pruned_files(task_id);
CREATE INDEX idx_pruned_decision ON t_task_pruned_files(linked_decision_id);
```

### Implementation Files

- **Migration**: `src/migrations/add-v3.5.0-pruned-files.ts`
- **Core Logic**: `src/utils/file-pruning.ts`
- **Integration**: `src/utils/task-stale-detection.ts`
- **MCP Actions**: `src/tools/tasks.ts` (getPrunedFiles, linkPrunedFile)

### Token Efficiency

Auto-pruning maintains token efficiency:
- File paths stored as raw strings (not normalized to m_files)
- Audit queries return only necessary fields
- Pagination supported via `limit` parameter

---

## Troubleshooting

### Issue: Task stuck in in_progress

**Symptom**: Task won't transition to waiting_review

**Diagnosis**:
```bash
# Check if ALL watched files are non-existent
task.get({ task_id: X, include_dependencies: true })
# Look at linked_files array
```

**Solution**:
1. Create at least one watched file (even if placeholder)
2. Or manually update watch list to remove non-existent files
3. Or close task as invalid

### Issue: Can't find pruned files

**Symptom**: `get_pruned_files` returns empty

**Diagnosis**:
- Auto-prune may not have run yet (task must be idle > 3 minutes)
- Task may have no non-existent files

**Solution**:
```bash
# Force check by waiting for idle timeout
# Or manually query database:
SELECT * FROM t_task_pruned_files WHERE task_id = X;
```

### Issue: Decision link not working

**Symptom**: `link_pruned_file` fails

**Diagnosis**:
```bash
# Check if decision exists
decision.get({ key: "your-decision-key" })

# Check if pruned_file_id is correct
task.get_pruned_files({ task_id: X })
```

---

## Migration Notes

### Upgrading from v3.4.x

Auto-pruning is **automatic** in v3.5.0. No configuration required.

**Database Migration**:
- Runs automatically on startup
- Creates `t_task_pruned_files` table
- Idempotent (safe to run multiple times)

**Behavioral Changes**:
- Tasks with non-existent files now auto-prune during review transition
- No impact on existing tasks (pruning only affects future transitions)

**Rollback**:
If needed, downgrade to v3.4.x:
```bash
# Audit table will remain but won't be used
# No data loss
git checkout v3.4.1
npm install
```

---

## Related Documentation

- **TASK_OVERVIEW.md**: Task lifecycle and status transitions
- **TASK_ACTIONS.md**: All task action references
- **TASK_LINKING.md**: Linking tasks to decisions/constraints/files
- **DECISION_CONTEXT.md**: Rich decision documentation
- **ARCHITECTURE.md**: Database schema details

---

## Changelog

### v3.5.0 (2025-10-22)
- Initial release of Auto-Pruning feature
- Added `t_task_pruned_files` audit table
- Implemented `pruneNonExistentFiles()` with safety checks
- Added MCP actions: `get_pruned_files`, `link_pruned_file`
- Integrated into `detectAndTransitionToReview()` workflow
