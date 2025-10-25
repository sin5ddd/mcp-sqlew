# Shared Concepts Reference

> **Single Source of Truth** - Common concepts used across all MCP-SQLEW documentation.

## Table of Contents
- [Architecture Layers](#architecture-layers)
- [Enum Values Reference](#enum-values-reference)
- [Atomic Mode](#atomic-mode)
- [Action Parameter](#action-parameter)

---

## Architecture Layers

5-layer architecture for organizing decisions, constraints, file changes, and tasks:

### 1. **presentation** - User Interface
UI components, API endpoints, CLI handlers, forms, response formatting

**Examples**: React components, REST controllers, web forms

### 2. **business** - Business Logic
Core application logic, business rules, domain operations

**Examples**: Service classes, domain models, workflows, validation rules

### 3. **data** - Data Access
Data persistence and retrieval

**Examples**: Database schemas, repositories, ORMs, queries

### 4. **infrastructure** - Infrastructure
Technical capabilities and external services

**Examples**: Auth, logging, message queues, caching, email/SMS services

### 5. **cross-cutting** - Cross-Cutting Concerns
Aspects spanning multiple layers

**Examples**: Error handling, security, performance, i18n, configuration

---

## Enum Values Reference

### layer (Architecture Layers)
```typescript
type Layer =
  | "presentation"      // UI, API endpoints, user interaction
  | "business"          // Core logic, domain models, workflows
  | "data"              // Database, repositories, persistence
  | "infrastructure"    // Auth, logging, external services
  | "cross-cutting"     // Security, error handling, i18n
```

### status (Decision/Entity Status)
```typescript
type Status =
  | "active"       // Currently in use and valid (default)
  | "deprecated"   // Outdated but not removed, scheduled for removal
  | "draft"        // Proposed but not yet approved/implemented
```

### msg_type (Message Type)
```typescript
type MessageType =
  | "decision"     // Decision announcement or update
  | "warning"      // Alert or cautionary message
  | "request"      // Request for action or input
  | "info"         // Informational message
```

### priority (Priority Level)
```typescript
type Priority =
  | "low"          // Can be addressed later
  | "medium"       // Normal priority (default)
  | "high"         // Should be addressed soon
  | "critical"     // Requires immediate attention
```

### change_type (File Change Type)
```typescript
type ChangeType =
  | "created"      // New file added
  | "modified"     // Existing file changed
  | "deleted"      // File removed
```

### category (Constraint Categories)
```typescript
type ConstraintCategory =
  | "performance"     // Performance requirements and limits
  | "architecture"    // Architectural rules and patterns
  | "security"        // Security policies and restrictions
```

### task_status (Kanban Task Status)
```typescript
type TaskStatus =
  | "todo"             // Not started, ready to begin
  | "in_progress"      // Currently being worked on
  | "waiting_review"   // Completed, awaiting review/approval
  | "blocked"          // Cannot proceed due to blocker
  | "done"             // Completed and approved
  | "archived"         // Archived for historical reference
```

**Valid Transitions** (enforced by state machine):
- `todo` → `in_progress`, `blocked`, `archived`
- `in_progress` → `waiting_review`, `blocked`, `todo`, `archived`
- `waiting_review` → `done`, `in_progress`, `blocked`, `archived`
- `blocked` → `todo`, `in_progress`, `archived`
- `done` → `archived`
- `archived` → (terminal state, no transitions)

**Auto-Stale Detection & Auto-Archive**:
- `in_progress` >2 hours → auto-move to `waiting_review`
- `waiting_review` >24 hours → auto-move to `todo`
- `done` >48 hours → auto-move to `archived` (weekend-aware)

---

## Atomic Mode

Determines batch operation failure handling:

**`atomic: true`** (All-or-Nothing) - Default
- ALL succeed or ALL fail
- Database transaction with rollback
- Guaranteed consistency

**`atomic: false`** (Best-Effort)
- Independent operations
- Partial success possible
- Failed items reported

### When to Use

**Use `atomic: true`** for:
- Critical data consistency (financial, multi-step workflows)
- All-or-nothing validation

**Use `atomic: false`** for:
- Bulk imports with expected failures
- AI agent best-effort updates
- Performance-critical operations

### Supported Tools
- `decision`: `set_batch`
- `message`: `send_batch`
- `file`: `record_batch`
- `task`: `batch_create`

---

## Action Parameter

**`action` parameter is REQUIRED in all tool calls**

### Why Required?
- Token efficiency: 96% reduction (20 tools → 7 tools)
- Logical grouping of related operations
- On-demand help via `action: "help"`

### Common Error
```json
❌ ERROR: "Unknown action: undefined"

// Fix: Always include action
✅ { "action": "get", "key": "auth_method" }
❌ { "key": "auth_method" }
```

### Available Actions

- **decision**: set, get, list, search_tags, search_layer, versions, set_batch, help
- **message**: send, get, mark_read, send_batch, help
- **file**: record, get, check_lock, record_batch, help
- **constraint**: add, get, deactivate, help
- **stats**: layer_summary, db_stats, clear, help
- **config**: get, update, help
- **task**: create, update, get, list, move, link, archive, batch_create, help

---

## Database Enum Mappings

Enum values stored as integers (MCP tools auto-convert - use strings in calls):

- **status**: 1=active, 2=deprecated, 3=draft
- **msg_type**: 1=decision, 2=warning, 3=request, 4=info
- **priority**: 1=low, 2=medium, 3=high, 4=critical
- **change_type**: 1=created, 2=modified, 3=deleted
- **task_status**: 1=todo, 2=in_progress, 3=waiting_review, 4=blocked, 5=done, 6=archived
