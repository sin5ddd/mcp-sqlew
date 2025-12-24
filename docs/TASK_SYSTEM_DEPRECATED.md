# Task System (Deprecated)

> **Status**: Deprecated as of v4.1.0
>
> AI agents have evolved to become sophisticated enough to manage their own task orchestration through Claude Code's native TodoWrite tool and Plan Mode. The sqlew Task System has fulfilled its mission as a bridge technology and is now retired with honor.
>
> This document is preserved for historical reference and for users who wish to understand the original design.

---

## Historical Overview

The sqlew Task System (v3.0.0 - v4.0.x) provided:

- **Kanban-style task management** with status transitions (todo, in_progress, waiting_review, blocked, done, archived)
- **File tracking** linking tasks to source files with action types (create, modify, delete)
- **Dependency management** with circular dependency detection
- **Auto-stale detection** transitioning abandoned tasks automatically
- **Git-aware auto-complete** using VCS events to advance task status
- **Acceptance criteria validation** for automated task completion checks

## Why Deprecated?

### The Original Problem (2025-06)

When sqlew was designed, AI agents lacked:
- Persistent memory across sessions
- Native task tracking capabilities
- Structured planning workflows

The Task System bridged this gap by providing database-backed task persistence.

### What Changed (2025-11)

Claude Code introduced:
- **TodoWrite tool** - Native task tracking within conversations
- **Plan Mode** - Structured planning with user approval workflow
- **Claude Code Hooks** - Automatic decision capture from Plan Mode

These native capabilities now handle what the Task System was designed to do, but with:
- Zero configuration required
- Seamless integration with Claude Code
- No database overhead for task state

## Migration Path

**Before (Task System)**:
```typescript
task({ action: "create", title: "Implement auth", layer: "business" })
task({ action: "move", task_id: 1, status: "in_progress" })
task({ action: "move", task_id: 1, status: "done" })
```

**After (Native Claude Code)**:
```
// Just use Plan Mode - tasks are tracked automatically via TodoWrite
// Decisions are captured automatically via Hooks
```

## Preserved Features

The following sqlew features remain active and are enhanced in v4.1.0:

| Feature | Status | Notes |
|---------|--------|-------|
| **Decisions** | Active | Core ADR functionality |
| **Constraints** | Active | Architectural rules |
| **File Tracking** | Active | For decisions, not tasks |
| **Similarity Detection** | Active | Three-tier duplicate prevention |
| **Hooks Integration** | New | Auto-capture from Plan Mode |

## Original Documentation

The following documentation was consolidated into this file:

- TASK_OVERVIEW.md - Lifecycle and status transitions
- TASK_ACTIONS.md - All action references
- AUTO_FILE_TRACKING.md - File watching system
- GIT_AWARE_AUTO_COMPLETE.md - VCS integration
- TASK_PRUNING.md - Automatic cleanup

For historical implementation details, refer to:
- `src/tools/tasks/` - Task tool implementation
- `src/database/migrations/v4/` - Schema definitions

---

*The Task System served the AI agent community well from v3.0.0 to v4.0.x. Its design principles live on in Claude Code's native capabilities.*
