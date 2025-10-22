# Migration Guide: v3.2.x → v3.4.1

**Major Updates** - File Watcher Redesign + TOML Configuration Support

## Overview

Version 3.3.0 introduces two major improvements:

### 1. File Watcher Redesign
Cleaner, more intuitive API for file watching while maintaining full backward compatibility with v3.2.x code.

**What's New:**
- ✅ `watch_files` parameter in `task.create` and `task.update`
- ✅ `watch_files` action for managing file watches
- ⚠️ `task.link(link_type="file")` deprecated (still works, shows warning)

### 2. TOML Configuration Support
Optional configuration file (`.sqlew/config.toml`) for persistent settings.

**What's New:**
- ✅ TOML config file support (`.sqlew/config.toml`)
- ✅ Configure database path, retention policies, task thresholds
- ✅ Priority system: CLI args > config.toml > database defaults
- ✅ Validation with helpful error messages
- ✅ Fully backward compatible (config file is optional)

**Breaking Changes:** None! All v3.2.x code continues to work.

## Quick Migration Path

### Option 1: Gradual Migration (Recommended)

Continue using your existing code. When creating new tasks, use the new API:

```typescript
// New tasks (v3.4.1 style)
task action=create
  title: "New feature"
  watch_files: ["src/feature.ts"]

// Existing tasks (v3.2.x style still works)
task action=link
  task_id: 123
  link_type: "file"
  target_id: "src/old-feature.ts"
```

### Option 2: Full Migration

Update all file watching code to use the new API. See detailed migration steps below.

## Configuration File Setup (Optional)

### Quick Start with TOML Config

v3.4.1 adds optional configuration file support. This is **completely optional** - sqlew works without it.

**Setup:**
```bash
# Copy example config
cp .sqlew/config.toml.example .sqlew/config.toml

# Edit settings
nano .sqlew/config.toml
```

**Example config:**
```toml
[database]
path = ".sqlew/custom.db"  # Override default database path

[autodelete]
ignore_weekend = true       # Skip weekends in retention calculations
message_hours = 48          # Keep messages 48 hours (default: 24)
file_history_days = 14      # Keep file history 14 days (default: 7)

[tasks]
auto_archive_done_days = 2          # Archive done tasks after 2 days
stale_hours_in_progress = 2         # Stale threshold for in_progress
stale_hours_waiting_review = 24     # Stale threshold for waiting_review
auto_stale_enabled = true           # Enable auto-stale detection
```

**Priority:**
1. CLI arguments (highest)
2. Config file (`.sqlew/config.toml`)
3. Database (`m_config` table)
4. Code defaults (lowest)

**Complete guide:** See [CONFIGURATION.md](CONFIGURATION.md) for:
- All configuration options and validation rules
- Common configurations (dev/prod/weekend-aware)
- Runtime updates via MCP tools
- Troubleshooting

### Migration from CLI Arguments

**Before (v3.2.x with CLI args):**
```json
{
  "mcpServers": {
    "sqlew": {
      "command": "npx",
      "args": [
        "sqlew",
        "--autodelete-ignore-weekend",
        "--autodelete-message-hours=48",
        "--autodelete-file-history-days=14"
      ]
    }
  }
}
```

**After (v3.4.1 with config file):**
```json
{
  "mcpServers": {
    "sqlew": {
      "command": "npx",
      "args": ["sqlew"]
    }
  }
}
```

`.sqlew/config.toml`:
```toml
[autodelete]
ignore_weekend = true
message_hours = 48
file_history_days = 14
```

**Benefits:**
- Cleaner Claude Desktop config
- Version-controllable settings
- Self-documenting configuration
- Easier to modify without editing JSON

## Detailed Migration Steps

### Step 1: Update Task Creation

**Before (v3.2.x):**
```typescript
// Create task
task action=create
  title: "Implement authentication"
  description: "Add JWT-based auth"
  acceptance_criteria: [
    {type: "tests_pass", command: "npm test auth", expected_pattern: "passing"}
  ]
  priority: 3
  assigned_agent: "backend-dev"

// Link files separately (multiple MCP calls)
task action=link task_id=123 link_type=file target_id="src/auth.ts"
task action=link task_id=123 link_type=file target_id="src/auth.test.ts"
task action=link task_id=123 link_type=file target_id="src/middleware/jwt.ts"
```

**After (v3.4.1):**
```typescript
// Create task with files in one call
task action=create
  title: "Implement authentication"
  description: "Add JWT-based auth"
  acceptance_criteria: [
    {type: "tests_pass", command: "npm test auth", expected_pattern: "passing"}
  ]
  watch_files: ["src/auth.ts", "src/auth.test.ts", "src/middleware/jwt.ts"]
  priority: 3
  assigned_agent: "backend-dev"
```

**Benefits:**
- 1 MCP call instead of 4 (75% reduction)
- Clearer intent (files are part of task definition)
- Atomic operation (all files registered together)
- Better error handling

### Step 2: Update Task Updates

**Before (v3.2.x):**
```typescript
// Update task metadata
task action=update
  task_id: 123
  priority: 4

// Add more files to watch (separate calls)
task action=link task_id=123 link_type=file target_id="src/utils/crypto.ts"
```

**After (v3.4.1):**
```typescript
// Update task with files in one call
task action=update
  task_id: 123
  priority: 4
  watch_files: ["src/utils/crypto.ts"]  // Adds to existing watch list
```

### Step 3: Managing File Watches

**Before (v3.2.x):**
```typescript
// No dedicated way to list or remove file links
// Had to query task details and manually parse links
task action=get task_id=123
// Response includes linked_files array

// No way to unwatch files without unlinking
```

**After (v3.4.1):**
```typescript
// List files being watched
task action=watch_files
  task_id: 123
  action: list
// Returns: { files: ["src/auth.ts", "src/auth.test.ts"], files_count: 2 }

// Add files to watch list
task action=watch_files
  task_id: 123
  action: watch
  file_paths: ["src/utils/crypto.ts", "src/config/auth.ts"]

// Remove files from watch list
task action=watch_files
  task_id: 123
  action: unwatch
  file_paths: ["src/config/auth.ts"]
```

### Step 4: Batch Task Creation

**Before (v3.2.x):**
```typescript
// Create tasks in batch
task action=batch_create
  tasks: [
    {title: "Task 1", ...},
    {title: "Task 2", ...},
    {title: "Task 3", ...}
  ]

// Then link files to each task (3 additional calls per task)
task action=link task_id=101 link_type=file target_id="src/task1.ts"
task action=link task_id=102 link_type=file target_id="src/task2.ts"
task action=link task_id=103 link_type=file target_id="src/task3.ts"
```

**After (v3.4.1):**
```typescript
// Create tasks with files in batch
task action=batch_create
  tasks: [
    {title: "Task 1", watch_files: ["src/task1.ts"], ...},
    {title: "Task 2", watch_files: ["src/task2.ts"], ...},
    {title: "Task 3", watch_files: ["src/task3.ts"], ...}
  ]
// Done! Files automatically registered with watcher
```

## API Comparison

### Creating Tasks with Files

| v3.2.x | v3.4.1 | Improvement |
|--------|--------|-------------|
| 4 MCP calls | 1 MCP call | 75% reduction |
| ~1,400 tokens | ~900 tokens | 35% reduction |
| Error-prone (manual linking) | Atomic operation | Better reliability |
| No batch file linking | Batch support | Better scalability |

### Managing File Watches

| Operation | v3.2.x | v3.4.1 |
|-----------|--------|--------|
| List watched files | `task.get` (parse response) | `watch_files action=list` |
| Add files | `task.link(file)` × N | `watch_files action=watch` (batch) |
| Remove files | Not possible | `watch_files action=unwatch` |
| Check if watching | Parse `task.get` response | `watch_files action=list` |

## Migration Checklist

### For Existing Codebases

- [ ] Review all `task.link(link_type="file")` calls
- [ ] Identify opportunities to consolidate with `task.create`
- [ ] Update task creation to use `watch_files` parameter
- [ ] Replace file linking loops with batch operations
- [ ] Update documentation/examples to use v3.4.1 API
- [ ] Test file watcher still works after migration
- [ ] (Optional) Replace deprecated calls with new API

### For New Development

- [ ] Use `watch_files` parameter in `task.create`
- [ ] Use `watch_files` action for dynamic file management
- [ ] Avoid `task.link(link_type="file")` (deprecated)
- [ ] Use batch operations for multiple files
- [ ] Document file watching behavior in task descriptions

## Common Migration Patterns

### Pattern 1: Single File Task

**Before:**
```typescript
task action=create title="Fix bug"
task action=link task_id=X link_type=file target_id="src/fix.ts"
```

**After:**
```typescript
task action=create title="Fix bug" watch_files=["src/fix.ts"]
```

### Pattern 2: Multi-File Task

**Before:**
```typescript
task action=create title="Feature"
task action=link task_id=X link_type=file target_id="src/feature.ts"
task action=link task_id=X link_type=file target_id="src/feature.test.ts"
task action=link task_id=X link_type=file target_id="docs/feature.md"
```

**After:**
```typescript
task action=create
  title: "Feature"
  watch_files: ["src/feature.ts", "src/feature.test.ts", "docs/feature.md"]
```

### Pattern 3: Dynamic File Addition

**Before:**
```typescript
// Get task
task action=get task_id=123

// Add file based on some condition
if (condition) {
  task action=link task_id=123 link_type=file target_id="src/extra.ts"
}
```

**After:**
```typescript
// Add file based on condition
if (condition) {
  task action=watch_files
    task_id: 123
    action: watch
    file_paths: ["src/extra.ts"]
}
```

### Pattern 4: File Watching Cleanup

**Before:**
```typescript
// No way to remove file watches
// Had to archive task or manually edit database
```

**After:**
```typescript
// Remove files from watch list
task action=watch_files
  task_id: 123
  action: unwatch
  file_paths: ["src/temporary.ts"]
```

## Backward Compatibility

### Deprecated API Still Works

All v3.2.x code continues to work without changes:

```typescript
// This still works (shows deprecation warning in console)
task action=link
  task_id: 123
  link_type: "file"
  target_id: "src/auth.ts"

// Console output:
// ⚠️  DEPRECATION WARNING: task.link(link_type="file") is deprecated as of v3.4.1.
//    Use task.create(watch_files=[...]) or task.update(watch_files=[...]) instead.
```

### Mixed API Usage

You can mix old and new APIs:

```typescript
// Old style (deprecated but works)
task action=link task_id=123 link_type=file target_id="src/old.ts"

// New style (recommended)
task action=watch_files task_id=123 action=watch file_paths=["src/new.ts"]

// Both files are watched!
```

### Response Format Changes

The `task.link(link_type="file")` response now includes a deprecation warning:

**Before (v3.2.x):**
```json
{
  "success": true,
  "task_id": 123,
  "linked_to": "file",
  "target": "src/auth.ts",
  "message": "Task 123 linked to file \"src/auth.ts\""
}
```

**After (v3.4.1):**
```json
{
  "success": true,
  "task_id": 123,
  "linked_to": "file",
  "target": "src/auth.ts",
  "deprecation_warning": "task.link(link_type=\"file\") is deprecated. Use task.create/update(watch_files) or watch_files action instead.",
  "message": "Task 123 linked to file \"src/auth.ts\" (DEPRECATED API - use watch_files instead)"
}
```

## Troubleshooting Migration Issues

### Issue: Deprecation Warnings

**Symptoms**: Console shows deprecation warnings but code works

**Solution**: This is expected. Update code when convenient:

```typescript
// Replace this (deprecated)
task action=link task_id=123 link_type=file target_id="src/file.ts"

// With this (recommended)
task action=watch_files task_id=123 action=watch file_paths=["src/file.ts"]
```

### Issue: Files Not Being Watched

**Symptoms**: Used `watch_files` but watcher not monitoring

**Solution**: Check file paths are correct and watcher is running:

```typescript
// Verify files registered
task action=watch_files task_id=123 action=list

// Check watcher status
task action=watcher subaction=status
```

### Issue: Batch File Registration Failed

**Symptoms**: Some files not watched after batch operation

**Solution**: Check for typos in file paths and verify files exist:

```typescript
// List what's actually being watched
task action=watch_files task_id=123 action=list

// Add missing files
task action=watch_files
  task_id: 123
  action: watch
  file_paths: ["src/missing.ts"]
```

## Testing Migration

### Verification Steps

1. **Create test task with files:**
   ```typescript
   task action=create
     title: "Migration test"
     watch_files: ["src/test.ts"]
     acceptance_criteria: [{type: "code_contains", file: "src/test.ts", pattern: "test"}]
   ```

2. **Verify files are watched:**
   ```typescript
   task action=watch_files task_id=X action=list
   // Should return: { files: ["src/test.ts"], files_count: 1 }
   ```

3. **Verify watcher is running:**
   ```typescript
   task action=watcher subaction=status
   // Should return: { running: true, files_watched: 1, tasks_monitored: 1 }
   ```

4. **Test auto-transition:**
   - Edit `src/test.ts`
   - Wait 2 seconds (debounce)
   - Check task status: should move from `todo` → `in_progress`

5. **Test file removal:**
   ```typescript
   task action=watch_files task_id=X action=unwatch file_paths=["src/test.ts"]
   task action=watch_files task_id=X action=list
   // Should return: { files: [], files_count: 0 }
   ```

### Regression Testing

Ensure v3.2.x code still works:

```typescript
// Old API should still work (with deprecation warning)
task action=create title="Regression test"
task action=link task_id=Y link_type=file target_id="src/regression.ts"

// Verify file is watched
task action=get task_id=Y
// Should include: linked_files: ["src/regression.ts"]
```

## Performance Impact

### Token Savings

**Creating 10 tasks with 3 files each:**

- **v3.2.x**: 10 creates + 30 links = 40 MCP calls (~14,000 tokens)
- **v3.4.1**: 10 creates with `watch_files` = 10 MCP calls (~9,000 tokens)
- **Savings**: 75% fewer calls, 35% fewer tokens

### Memory Impact

No change. Both APIs use the same underlying database schema and file watcher.

### Watcher Performance

No change. File watching behavior is identical between v3.2.x and v3.4.1.

## Rollback Plan

If you need to rollback to v3.2.x behavior:

1. **Database is compatible** - No schema changes in v3.4.1
2. **Simply avoid new API** - Don't use `watch_files` parameter/action
3. **Use task.link** - Continue using `task.link(link_type="file")`

All data created with v3.4.1 API is accessible from v3.2.x.

## Timeline for Deprecation

| Version | Status | Notes |
|---------|--------|-------|
| v3.4.1 | Deprecation warning | `task.link(file)` shows console warning |
| v3.4.x | Deprecation warning | No changes, backward compatibility maintained |
| v3.5.x | Deprecation warning | No changes, backward compatibility maintained |
| v4.0.0 | Removal (planned) | `task.link(file)` may be removed in v4.0.0 |

**Recommendation**: Migrate to v3.4.1 API before v4.0.0 release.

## Summary

✅ **Benefits of v3.4.1:**
- Cleaner, more intuitive API
- Fewer MCP calls (75% reduction)
- Token savings (35% reduction)
- Batch file operations
- Better error handling
- Full backward compatibility

✅ **Migration is optional:**
- All v3.2.x code works in v3.4.1
- Deprecation warnings guide you
- Migrate at your own pace

✅ **No breaking changes:**
- Database schema unchanged
- File watcher behavior unchanged
- Response formats compatible

## See Also

- [CONFIGURATION.md](./CONFIGURATION.md) - Complete configuration guide (TOML config, CLI args, MCP tools)
- [AUTO_FILE_TRACKING.md](./AUTO_FILE_TRACKING.md) - Complete file watching guide
- [TOOL_REFERENCE.md](./TOOL_REFERENCE.md) - API reference
- [TASK_ACTIONS.md](./TASK_ACTIONS.md) - All task actions
- [CHANGELOG.md](../CHANGELOG.md) - Full v3.4.1 changelog
