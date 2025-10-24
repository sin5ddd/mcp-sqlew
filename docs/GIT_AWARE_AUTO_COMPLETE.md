# Git-Aware Auto-Complete (v3.4.0 - v3.5.2)

**Feature Status**: Implemented ✅
**Current Version**: v3.5.2 (Two-Step Git-Aware Workflow)
**Previous Version**: v3.4.0 (Commit-Based Auto-Complete)
**Architecture Decision**: #001 - Replace flawed auto-revert with Git-based task completion

## Version Evolution

### v3.4.0 - Commit-Based Auto-Complete
- **Workflow**: `waiting_review` → [git commit] → `done`
- **Problem**: Tasks stay in `done` status indefinitely, board becomes cluttered

### v3.5.2 - Two-Step Git-Aware Workflow ⭐ **NEW**
- **Step 1 - Staging**: `waiting_review` → [git add] → `done` (work complete)
- **Step 2 - Archiving**: `done` → [git commit] → `archived` (work finalized, board clean)
- **Benefit**: Automatic board cleanup while preserving Git workflow semantics

## Problem Statement

### Current Flaw (v3.2.x - v3.3.x)

The current stale task detection system has a critical design flaw:

```typescript
// In src/utils/task-stale-detection.ts lines 105-116
// FLAWED LOGIC: Reverts completed work after 24h idle
const waitingReviewTransitioned = db.prepare(`
  UPDATE t_tasks
  SET status_id = ?,
      updated_ts = unixepoch()
  WHERE status_id = ?
    AND updated_ts < unixepoch() - ?
`).run(
  TASK_STATUS.TODO,           // Revert to TODO
  TASK_STATUS.WAITING_REVIEW, // From waiting_review
  waitingReviewThresholdSeconds // After 24h
);
```

**Problem**:
- Task transitions: `todo` → `in_progress` → `waiting_review` (quality gates pass)
- After 24h idle: `waiting_review` → `todo` (auto-revert)
- **Result**: Work is DONE but task status discards this fact

### Why This Happens

1. AI agent completes implementation (files modified, tests pass, TypeScript compiles)
2. Quality gates detect completion → task moves to `waiting_review`
3. Work sits idle for 24+ hours (no additional changes needed)
4. Auto-revert logic triggers → task reverts to `todo`
5. **Loss of context**: Task appears incomplete when work is already done

## Solution: Two-Step Git-Aware Workflow (v3.5.2)

### Core Concept

**Align task status with Git workflow stages.**

- **Staging (git add)** = Work complete → `waiting_review` → `done`
- **Committing (git commit)** = Work finalized → `done` → `archived`

### Rationale (v3.5.2 Enhancement)

1. **Clean Task Board**: Tasks auto-archive after commit, keeping active board focused on current work
2. **Fast Feedback**: `git add` provides immediate "work done" signal (faster than waiting for commit)
3. **Git Workflow Alignment**: Staging = ready for review, Commit = finalized and permanent
4. **Zero-token overhead**: Fully automated, no manual MCP calls needed
5. **Multi-agent compatible**: Any agent can stage/commit, all agents see the same VCS state
6. **Survives process restarts**: VCS state is persistent (Git/Mercurial/SVN)

## Architecture

### Component Design

```
┌─────────────────────────────────────────────────────────────────┐
│  Git-Aware Task Completion System                              │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  detectAndCompleteReviewedTasks(db: Database)             │ │
│  │  ───────────────────────────────────────────────────────  │ │
│  │  1. Find all tasks in waiting_review status              │ │
│  │  2. Get watched files for each task                      │ │
│  │  3. Check Git log since task creation                    │ │
│  │  4. If ALL files committed → transition to done          │ │
│  │  5. Return count of auto-completed tasks                 │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  Integration Points                                       │ │
│  │  ───────────────────────────────────────────────────────  │ │
│  │  • Periodic Checks: Before task.list() and stats.get()  │ │
│  │  • File Watcher: On .git/index change (real-time)       │ │
│  │  • Response Enhancement: Include git_auto_completed      │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  Configuration                                            │ │
│  │  ───────────────────────────────────────────────────────  │ │
│  │  • git_auto_complete_enabled (default: '1')              │ │
│  │  • require_all_files_committed (default: '1')            │ │
│  │  • stale_review_notification_hours (default: '48')       │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Git Log Query Strategy

```bash
# For a task created at timestamp 1698765432
# Check if file "src/auth.ts" was committed since task creation

git log --since="@1698765432" --name-only -- src/auth.ts

# Output if committed:
# commit abc123def456...
# Author: AI Agent <agent@example.com>
# Date: ...
#
# src/auth.ts

# Output if NOT committed:
# (empty)
```

**Logic**:
- Query `git log --since="@<task.created_ts>" --name-only -- <file_path>`
- If output is non-empty → file was committed since task creation
- If ALL watched files have non-empty output → transition task to `done`

## Implementation Tasks

### Task 1: Remove Flawed Auto-Revert Logic
**Priority**: Critical (Blocker)
**Layer**: Business Logic
**AI Time**: 5 minutes
**Token Budget**: 2k-3k tokens

**File**: `/home/kitayama/TypeScriptProject/mcp-sqlew/src/utils/task-stale-detection.ts`
**Lines to Remove**: 105-116

```typescript
// DELETE THIS SECTION:
const waitingReviewTransitioned = db.prepare(`
  UPDATE t_tasks
  SET status_id = ?,
      updated_ts = unixepoch()
  WHERE status_id = ?
    AND updated_ts < unixepoch() - ?
`).run(
  TASK_STATUS.TODO,
  TASK_STATUS.WAITING_REVIEW,
  waitingReviewThresholdSeconds
);

totalTransitioned += waitingReviewTransitioned.changes;
```

**Acceptance Criteria**:
- [ ] Lines 105-116 removed from `task-stale-detection.ts`
- [ ] No compilation errors after removal
- [ ] Existing tests still pass (`npm test task-stale`)

---

### Task 2: Implement Git-Aware Auto-Complete
**Priority**: Critical (Blocker)
**Layer**: Business Logic
**AI Time**: 25-30 minutes
**Token Budget**: 18k-25k tokens

**New Function**: `detectAndCompleteReviewedTasks(db: Database): Promise<number>`
**Location**: `/home/kitayama/TypeScriptProject/mcp-sqlew/src/utils/task-stale-detection.ts`

**Function Signature**:
```typescript
/**
 * Detect and auto-complete tasks in waiting_review that have all files committed
 *
 * Git-aware completion logic:
 * - Find all tasks in waiting_review status
 * - Get watched files for each task
 * - Check git log since task creation for each file
 * - If ALL files committed → transition to done
 *
 * @param db - Database instance
 * @returns Count of auto-completed tasks
 */
export async function detectAndCompleteReviewedTasks(db: Database): Promise<number> {
  // Implementation here
}
```

**Algorithm**:
```
1. Check if git_auto_complete_enabled config is true
2. Get all tasks in waiting_review status
3. For each task:
   a. Get list of watched files from t_task_file_links
   b. Get task.created_ts
   c. For each watched file:
      - Run: git log --since="@<created_ts>" --name-only -- <file_path>
      - If output is empty → file NOT committed
   d. If require_all_files_committed:
      - ALL files must be committed → transition to done
   e. Else:
      - ANY file committed → transition to done
4. Return count of transitioned tasks
```

**Error Handling**:
- Skip tasks if `git log` fails (not in a Git repo)
- Skip tasks with no watched files
- Log detailed diagnostics to stderr for debugging

**Acceptance Criteria**:
- [ ] Function implemented in `task-stale-detection.ts`
- [ ] Handles all edge cases (no Git repo, no watched files, partial commits)
- [ ] Respects `git_auto_complete_enabled` and `require_all_files_committed` config
- [ ] Returns accurate count of transitioned tasks
- [ ] Comprehensive error logging to stderr

---

### Task 3: Integration - Periodic Checks
**Priority**: High
**Layer**: Business Logic
**Dependencies**: Task 2
**AI Time**: 10-15 minutes
**Token Budget**: 8k-12k tokens

**Files**: `/home/kitayama/TypeScriptProject/mcp-sqlew/src/tools/tasks.ts`
**Actions to Modify**: `list` (line ~750), `stats` in utils.ts

**Changes**:
1. Call `detectAndCompleteReviewedTasks(db)` before returning results
2. Include `git_auto_completed` count in response

**Example Integration**:
```typescript
// In listTasks() function
async function listTasks(db: Database, params: ListTasksParams): Promise<object> {
  // Run stale detection (existing)
  const staleTransitioned = detectAndTransitionStaleTasks(db);

  // NEW: Run Git-aware auto-complete
  const gitAutoCompleted = await detectAndCompleteReviewedTasks(db);

  // Get task list
  const tasks = db.prepare('SELECT ...).all();

  return {
    tasks,
    stale_tasks_transitioned: staleTransitioned,
    git_auto_completed: gitAutoCompleted, // NEW
  };
}
```

**Acceptance Criteria**:
- [ ] `task.list` calls `detectAndCompleteReviewedTasks()` before listing
- [ ] `stats` tool calls `detectAndCompleteReviewedTasks()` before stats
- [ ] Response includes `git_auto_completed` count
- [ ] Async handling properly implemented (await)
- [ ] No performance degradation for large task lists

---

### Task 4: Integration - File Watcher
**Priority**: High
**Layer**: Infrastructure
**Dependencies**: Task 2
**AI Time**: 15-20 minutes
**Token Budget**: 10k-15k tokens

**Files**:
- `/home/kitayama/TypeScriptProject/mcp-sqlew/src/watcher/file-watcher.ts`
- `/home/kitayama/TypeScriptProject/mcp-sqlew/src/watcher/index.ts`

**Changes**:
1. Watch `.git/index` file for changes (indicates git commit)
2. On `.git/index` change → call `detectAndCompleteReviewedTasks(db)`
3. Log real-time auto-completions

**Implementation**:
```typescript
// In FileWatcher constructor
this.watcher = chokidar.watch([...filePaths, '.git/index'], {
  ignored: gitignoreParser.shouldIgnore,
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 2000,
    pollInterval: 100,
  },
});

// In change handler
this.watcher.on('change', async (path) => {
  if (path === '.git/index') {
    // Git commit detected
    const completed = await detectAndCompleteReviewedTasks(this.db);
    if (completed > 0) {
      console.error(`  ✓ Git-aware auto-complete: ${completed} tasks completed`);
    }
  } else {
    // Existing file change logic
    ...
  }
});
```

**Acceptance Criteria**:
- [ ] `.git/index` added to watch list
- [ ] Git commits trigger `detectAndCompleteReviewedTasks()`
- [ ] Real-time console output for auto-completions
- [ ] No performance impact from watching `.git/index`
- [ ] Graceful handling if `.git/index` doesn't exist (not a Git repo)

---

### Task 5: Enhanced Inline Status
**Priority**: Medium
**Layer**: Presentation
**Dependencies**: Task 3
**AI Time**: 10 minutes
**Token Budget**: 5k-8k tokens

**File**: `/home/kitayama/TypeScriptProject/mcp-sqlew/src/tools/utils.ts` (stats action)

**Changes**:
Add `review_status` section to stats output showing tasks awaiting Git commits:

```typescript
// In getStats() function
const reviewStatus = db.prepare(`
  SELECT
    COUNT(DISTINCT t.id) as awaiting_commit,
    COUNT(DISTINCT tfl.file_id) as total_files,
    COUNT(DISTINCT CASE WHEN <committed_check> THEN tfl.file_id END) as committed_files
  FROM t_tasks t
  JOIN t_task_file_links tfl ON t.id = tfl.task_id
  WHERE t.status_id = ?
`).get(TASK_STATUS.WAITING_REVIEW);

return {
  ...existing_stats,
  review_status: {
    tasks_awaiting_commit: reviewStatus.awaiting_commit,
    files_to_commit: reviewStatus.total_files - reviewStatus.committed_files,
    commit_progress: `${reviewStatus.committed_files}/${reviewStatus.total_files}`,
  }
};
```

**Acceptance Criteria**:
- [ ] Stats output includes `review_status` section
- [ ] Shows count of tasks awaiting commits
- [ ] Shows commit progress (files committed / total files)
- [ ] Query is performant (<100ms for 1000 tasks)

---

### Task 6: Configuration
**Priority**: Medium
**Layer**: Infrastructure
**AI Time**: 5 minutes
**Token Budget**: 3k-5k tokens

**Files**:
- `/home/kitayama/TypeScriptProject/mcp-sqlew/src/database.ts` (config defaults)
- `/home/kitayama/TypeScriptProject/mcp-sqlew/docs/CONFIGURATION.md`

**New Config Keys**:
```typescript
// In initializeDatabase() function
const configDefaults = [
  // Existing configs...

  // NEW: Git-aware auto-complete
  { key: 'git_auto_complete_enabled', value: '1' },
  { key: 'require_all_files_committed', value: '1' },
  { key: 'stale_review_notification_hours', value: '48' },
];
```

**Documentation** (CONFIGURATION.md):
```markdown
### Git-Aware Auto-Complete (v3.4.0)

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `git_auto_complete_enabled` | boolean | `1` (true) | Enable automatic completion based on Git commits |
| `require_all_files_committed` | boolean | `1` (true) | Require ALL watched files to be committed (vs ANY) |
| `stale_review_notification_hours` | number | `48` | Hours before notifying about stale review tasks |

**Examples**:
```typescript
// Disable Git auto-complete
config action=update key="git_auto_complete_enabled" value="0"

// Complete task when ANY file is committed (not just all)
config action=update key="require_all_files_committed" value="0"

// Notify about stale reviews after 72 hours
config action=update key="stale_review_notification_hours" value="72"
```
```

**Acceptance Criteria**:
- [ ] Config defaults added to `database.ts`
- [ ] Documentation added to `CONFIGURATION.md`
- [ ] Config values respected by `detectAndCompleteReviewedTasks()`

---

### Task 7: Documentation & Testing
**Priority**: High
**Layer**: Cross-Cutting
**Dependencies**: All previous tasks
**AI Time**: 35-40 minutes
**Token Budget**: 23k-32k tokens

**Documentation Files**:
1. `/home/kitayama/TypeScriptProject/mcp-sqlew/docs/TASK_OVERVIEW.md` - Update lifecycle diagram
2. `/home/kitayama/TypeScriptProject/mcp-sqlew/docs/AUTO_FILE_TRACKING.md` - Add Git-aware section
3. `/home/kitayama/TypeScriptProject/mcp-sqlew/docs/TASK_ACTIONS.md` - Update status transitions
4. `/home/kitayama/TypeScriptProject/mcp-sqlew/CHANGELOG.md` - Add v3.4.0 entry

**Test Files** (all in `/home/kitayama/TypeScriptProject/mcp-sqlew/src/tests/`):
1. `tasks.git-auto-complete.test.ts` - Comprehensive test suite
2. `tasks.git-integration.test.ts` - Git log integration tests

**Test Cases**:
```typescript
describe('Git-Aware Auto-Complete', () => {
  describe('detectAndCompleteReviewedTasks', () => {
    it('should complete task when all files committed', async () => {
      // Test: Create task, commit all watched files, verify status=done
    });

    it('should NOT complete task when some files uncommitted', async () => {
      // Test: Create task, commit only some files, verify status=waiting_review
    });

    it('should handle tasks with no watched files', async () => {
      // Test: Create task with no files, verify no crash
    });

    it('should skip if not in Git repo', async () => {
      // Test: Mock git log failure, verify graceful skip
    });

    it('should respect git_auto_complete_enabled config', async () => {
      // Test: Disable config, verify no auto-completion
    });

    it('should respect require_all_files_committed config', async () => {
      // Test: Set to false, verify completion with ANY file committed
    });

    it('should handle multiple tasks simultaneously', async () => {
      // Test: 10 tasks, some committed, some not, verify correct counts
    });
  });

  describe('File Watcher Integration', () => {
    it('should trigger on .git/index change', async () => {
      // Test: Simulate git commit, verify auto-completion
    });

    it('should not trigger on regular file changes', async () => {
      // Test: Modify watched file, verify no premature completion
    });
  });

  describe('Periodic Checks Integration', () => {
    it('should auto-complete before task.list', async () => {
      // Test: Call task.list, verify auto-completion runs first
    });

    it('should include git_auto_completed in response', async () => {
      // Test: Verify response structure includes count
    });
  });
});
```

**Acceptance Criteria**:
- [ ] All documentation updated with Git-aware feature
- [ ] CHANGELOG.md includes comprehensive v3.4.0 entry
- [ ] Test suite covers all scenarios (>90% code coverage)
- [ ] All tests pass (`npm test`)
- [ ] TypeScript compiles without errors

---

## Migration Guide (v3.3.x → v3.4.0)

### Breaking Changes

**None** - v3.4.0 is fully backward-compatible.

### New Behavior

**Before (v3.3.x)**:
```
waiting_review (24h idle) → todo (auto-revert, work discarded)
```

**After (v3.4.0)**:
```
waiting_review (all files committed) → done (auto-complete, work preserved)
```

### Configuration

If you want to preserve the old behavior (not recommended):
```typescript
config action=update key="git_auto_complete_enabled" value="0"
```

### Recommended Workflow

1. Create task with watched files:
   ```typescript
   task action=create
     title: "Implement feature"
     watch_files: ["src/feature.ts", "src/feature.test.ts"]
   ```

2. Implement feature (files auto-tracked)
   - Task moves: `todo` → `in_progress`

3. Quality gates pass (if configured)
   - Task moves: `in_progress` → `waiting_review`

4. Commit changes to Git:
   ```bash
   git add src/feature.ts src/feature.test.ts
   git commit -m "Implement feature"
   ```

5. **NEW**: Task auto-completes
   - Task moves: `waiting_review` → `done`
   - Console output: `✓ Git-aware auto-complete: 1 task completed`

## Benefits

### 1. Preserves Completed Work
- No more auto-revert to `todo` after 24h
- Git commits represent finalized work → task correctly marked `done`

### 2. Zero-Token Overhead
- No manual MCP calls needed to mark tasks complete
- Git integration happens automatically in background

### 3. Multi-Agent Compatible
- Any agent can commit changes
- All agents see the same Git state (persistent)

### 4. Survives Restarts
- Git history persists across process restarts
- Task completion state always accurate based on Git

### 5. Natural Workflow Alignment
- Developers already commit when work is done
- System aligns with existing Git-based practices

## Risks & Mitigations

### Risk 1: False Positives (Premature Completion)
**Scenario**: Files committed but work not actually complete

**Mitigation**:
- Quality gates must pass BEFORE entering `waiting_review`
- Git auto-complete only applies to tasks already in `waiting_review`
- If work incomplete, task would still be in `in_progress`

### Risk 2: Not in Git Repo
**Scenario**: Project not using Git

**Mitigation**:
- `git log` failures are caught and logged
- Tasks gracefully skip auto-completion if Git unavailable
- Config option to disable: `git_auto_complete_enabled=0`

### Risk 3: Partial Commits
**Scenario**: Only some watched files committed

**Mitigation**:
- Default: `require_all_files_committed=1` (strict mode)
- Alternative: Set to `0` to complete on ANY file committed
- Console diagnostics show which files committed vs not

### Risk 4: Performance Impact
**Scenario**: Running `git log` for many tasks is slow

**Mitigation**:
- Periodic checks only run before `list` and `stats` (not continuous)
- File watcher triggers only on `.git/index` change (infrequent)
- Git log queries use `--name-only` (minimal output)
- Benchmark target: <500ms for 100 tasks

## Success Metrics

### Functional Metrics
- [ ] Zero auto-reverts of completed work (0 `waiting_review` → `todo` transitions)
- [ ] >95% accuracy: Tasks marked `done` when all files committed
- [ ] <5% false negatives: Tasks stuck in `waiting_review` when files committed

### Performance Metrics
- [ ] Periodic checks: <500ms for 100 tasks
- [ ] File watcher: <100ms response time on `.git/index` change
- [ ] No performance degradation vs v3.3.x baseline

### Token Efficiency Metrics
- [ ] Zero MCP calls needed for task completion (100% automated)
- [ ] Maintain existing 70% token reduction vs decision-based tracking

## Timeline

### Phase 1: Core Implementation (Tasks 1-2)
**Duration**: 30-35 minutes AI time
**Deliverable**: `detectAndCompleteReviewedTasks()` function working

### Phase 2: Integration (Tasks 3-4)
**Duration**: 25-35 minutes AI time
**Deliverable**: Periodic checks + file watcher integration

### Phase 3: Polish & Documentation (Tasks 5-7)
**Duration**: 50-55 minutes AI time
**Deliverable**: Full documentation, tests, and enhanced UI

### Total Timeline
**AI Time**: 105-140 minutes (~1.75-2.5 hours)
**Token Budget**: 69k-100k tokens

## Related Documents

- [AUTO_FILE_TRACKING.md](./AUTO_FILE_TRACKING.md) - File watcher system overview
- [TASK_OVERVIEW.md](./TASK_OVERVIEW.md) - Task lifecycle and status transitions
- [CONFIGURATION.md](./CONFIGURATION.md) - Configuration options
- [WORKFLOWS.md](./WORKFLOWS.md) - Multi-agent coordination patterns
