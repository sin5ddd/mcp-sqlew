# Shared Concepts Reference

> **Single Source of Truth** - This document defines common concepts used across all MCP-SQLEW documentation. Always reference this file for authoritative definitions.

## Table of Contents
- [Architecture Layers](#architecture-layers)
- [Enum Values Reference](#enum-values-reference)
- [Atomic Mode Explained](#atomic-mode-explained)
- [Action Parameter Requirement](#action-parameter-requirement)

---

## Architecture Layers

The system uses a 5-layer architecture for organizing decisions, constraints, file changes, and tasks:

### 1. **presentation** - User Interface Layer
**Definition**: Components that handle user interaction and data presentation.

**Examples**:
- React/Vue components, UI templates
- API endpoints (REST/GraphQL controllers)
- CLI command handlers
- Web forms and validation logic
- Response formatting and serialization

**When to Use**: Anything users directly interact with or that formats data for external consumption.

---

### 2. **business** - Business Logic Layer
**Definition**: Core application logic, business rules, and domain operations.

**Examples**:
- Service classes and business workflows
- Domain models and entities
- Validation rules and business constraints
- Use cases and application services
- State machines and process orchestration

**When to Use**: Core logic that defines "what" the application does, independent of how it's presented or stored.

---

### 3. **data** - Data Access Layer
**Definition**: Components responsible for data persistence and retrieval.

**Examples**:
- Database schemas and migrations
- Repository patterns and ORMs
- Data access objects (DAOs)
- Query builders and stored procedures
- Database connection management

**When to Use**: Anything that reads from or writes to persistent storage.

---

### 4. **infrastructure** - Infrastructure Layer
**Definition**: Technical capabilities and external service integrations.

**Examples**:
- Authentication/authorization mechanisms
- Logging and monitoring systems
- Message queues and event buses
- Email/SMS service integrations
- File storage and CDN integrations
- Caching mechanisms (Redis, Memcached)

**When to Use**: Supporting services that provide technical capabilities to other layers.

---

### 5. **cross-cutting** - Cross-Cutting Concerns
**Definition**: Aspects that span multiple layers or affect the entire application.

**Examples**:
- Error handling strategies
- Security policies and encryption
- Performance optimization patterns
- Internationalization (i18n)
- Audit logging across all layers
- Configuration management

**When to Use**: Concerns that don't belong to a single layer and affect multiple parts of the system.

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

## Atomic Mode Explained

### What is Atomic Mode?

**Atomic mode** determines how batch operations handle failures:

- **`atomic: true`** (All-or-Nothing)
  - ALL operations succeed, or ALL fail
  - Uses database transactions
  - Rollback on any error
  - Data consistency guaranteed

- **`atomic: false`** (Best-Effort)
  - Each operation attempted independently
  - Partial success possible
  - Failed items reported in response
  - Maximum throughput

### When to Use Each Mode

#### Use `atomic: true` (Default) When:
- **Data consistency is critical**
  - Financial transactions
  - Multi-step workflows that must complete together
  - Related records that must all exist or none exist

- **Validation is important**
  - You want to validate ALL items before committing ANY
  - One invalid item should prevent all changes

- **Examples**:
  ```typescript
  // All 3 decisions must be set together or none at all
  set_batch({
    decisions: [
      { key: "auth_method", value: "jwt", layer: "infrastructure" },
      { key: "session_timeout", value: "3600", layer: "infrastructure" },
      { key: "refresh_token_enabled", value: "true", layer: "infrastructure" }
    ],
    atomic: true  // If any fails, rollback all
  })
  ```

#### Use `atomic: false` When:
- **Partial success is acceptable**
  - Bulk imports where some failures are expected
  - Idempotent operations (safe to retry)
  - Performance is critical

- **AI agents making best-effort updates**
  - Don't want one bad item to block all others
  - Can handle partial success in response

- **Examples**:
  ```typescript
  // Try to send all messages, report which ones failed
  send_batch({
    messages: [/* 50 messages */],
    atomic: false  // Send as many as possible
  })
  ```

### Batch Operation Support

Currently supported in:
- `decision` tool: `action: "set_batch"` (atomic parameter available)
- `message` tool: `action: "send_batch"` (atomic parameter available)
- `file` tool: `action: "record_batch"` (atomic parameter available)
- `task` tool: `action: "batch_create"` (atomic parameter available)

### Performance Implications

- **Atomic mode (`atomic: true`)**:
  - Slower (transaction overhead)
  - Higher memory usage (holds all changes until commit)
  - Safer (guaranteed consistency)

- **Non-atomic mode (`atomic: false`)**:
  - Faster (no transaction overhead)
  - Lower memory usage (commit per operation)
  - More flexible (partial success handling)

---

## Action Parameter Requirement

### Why is `action` Required?

**All MCP tools in this system use action-based routing**. The `action` parameter is **REQUIRED** in every tool call.

### Design Rationale

1. **Token Efficiency** (96% reduction achieved)
   - Single tool with multiple actions vs. many separate tools
   - 20 tools → 7 tools (v2.0.0 → v3.0.0)
   - Tool definitions: 12,848 tokens → 481 tokens

2. **Logical Grouping**
   - Related operations grouped in one tool
   - `decision` tool handles all decision operations
   - `message` tool handles all messaging operations
   - Etc.

3. **Discoverability**
   - Each tool's actions are documented together
   - `action: "help"` provides on-demand documentation
   - Reduces upfront token cost (no documentation until requested)

### Common Error

```json
❌ ERROR: "Unknown action: undefined"
```

**Cause**: Missing `action` parameter

**Fix**: Always include `action` as the first parameter:
```json
✅ CORRECT:
{
  "action": "get",
  "key": "auth_method"
}

❌ INCORRECT:
{
  "key": "auth_method"  // Missing action parameter
}
```

### Available Actions by Tool

- **decision**: `set`, `get`, `list`, `search_tags`, `search_layer`, `versions`, `quick_set`, `search_advanced`, `set_batch`, `has_updates`, `set_from_template`, `create_template`, `list_templates`, `hard_delete`, `help`
- **message**: `send`, `get`, `mark_read`, `send_batch`, `help`
- **file**: `record`, `get`, `check_lock`, `record_batch`, `help`
- **constraint**: `add`, `get`, `deactivate`, `help`
- **stats**: `layer_summary`, `db_stats`, `clear`, `activity_log`, `flush`, `help`
- **config**: `get`, `update`, `help`
- **task**: `create`, `update`, `get`, `list`, `move`, `link`, `archive`, `batch_create`, `help`

### Getting Help

Every tool supports `action: "help"` for comprehensive documentation:
```json
{
  "action": "help"
}
```

This returns detailed usage instructions, parameter requirements, valid values, and examples for that specific tool.

---

## Database Enum Mappings

For reference, enum values are stored as integers in the database:

- **status**: 1=active, 2=deprecated, 3=draft
- **msg_type**: 1=decision, 2=warning, 3=request, 4=info
- **priority**: 1=low, 2=medium, 3=high, 4=critical
- **change_type**: 1=created, 2=modified, 3=deleted
- **task_status**: 1=todo, 2=in_progress, 3=waiting_review, 4=blocked, 5=done, 6=archived

The MCP tools handle string↔integer conversion automatically. Always use string values in tool calls.

---

## Version History

- **v3.0.0**: Added task_status enum and Auto-Stale Detection section
- **v2.1.0**: Added Atomic Mode Explained section
- **v2.0.0**: Initial creation with action-based API concepts
