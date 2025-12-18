# AI Agent Guide for sqlew ADR System

**Quick Reference for Claude Code and other AI agents using sqlew (v4.0.0+)**

## What is sqlew?

sqlew is an **ADR (Architecture Decision Record) system designed for AI agents**. It enables you to create, query, and maintain structured architectural decisions in a SQL database, providing persistent context across sessions.

### Core Concept: ADR for AI

Traditional ADR uses Markdown files. sqlew brings ADR to AI agents through:
- **Structured storage** – Query decisions like database records
- **Relationship tracking** – Link decisions to tasks, files, and constraints
- **Similarity detection** – Find duplicate or related decisions automatically
- **Token efficiency** – Retrieve only relevant context (60-75% reduction)

---

## Most Important Rule

**ALWAYS include the `action` parameter in EVERY tool call.** This is the #1 cause of errors.

```javascript
// WRONG - Missing action
{
  key: "auth_method",
  value: "jwt"
}

// CORRECT - action parameter present
{
  action: "set",
  key: "auth_method",
  value: "jwt"
}
```

---

## Quick Start: Creating Your First ADR

### Basic ADR Workflow

```javascript
// 1. Record an architectural decision
{
  action: "set",
  key: "auth_method",
  value: "We chose JWT authentication over session-based auth. JWT enables stateless API design and better horizontal scaling. Session-based auth was rejected due to scaling concerns with shared session stores.",
  layer: "business",
  tags: ["security", "authentication", "api"]
}

// 2. Retrieve the decision
{
  action: "get",
  key: "auth_method"
}

// 3. Search for related decisions
{
  action: "list",
  tags: ["authentication"],
  status: "active"
}

// 4. Add architectural constraint
{
  action: "add",
  category: "security",
  constraint_text: "All authentication must use JWT with RS256 signing algorithm",
  layer: "business"
}
```

---

## When to Use Each Tool

| Tool | ADR Purpose | Key Feature |
|------|-------------|-------------|
| **decision** | Record architectural decisions | Full version history, alternatives tracking |
| **constraint** | Define architectural principles | Category-based rules, validation support |
| **task** | Track decision implementation | Links to decisions, status tracking |
| **file** | Document impacted code | Shows which files implement decisions |
| **stats** | ADR repository metrics | Decision counts, layer distribution |
| **suggest** | Find similar decisions | Prevent duplicate ADRs, detect conflicts |

### Understanding the ADR Data Model

| Concept | ADR Equivalent | Example |
|---------|----------------|---------|
| **Decision** | Architecture Decision Record | "We chose PostgreSQL over MongoDB for ACID compliance" |
| **Constraint** | Architectural Principle/Rule | "All database queries must use prepared statements" |
| **Task** | Implementation Action | "Migrate user authentication to JWT" |
| **File** | Impacted Component | "Modified auth.ts to implement JWT" |

### Complete ADR Workflow Example

```javascript
// 1. Record decision with full context
{
  action: "set",
  key: "database_choice",
  value: "PostgreSQL selected for production database. Alternatives considered: MongoDB (rejected: no ACID), MySQL (rejected: weaker JSON support). PostgreSQL chosen for ACID compliance, mature ecosystem, and superior JSON handling.",
  layer: "data",
  tags: ["database", "postgresql", "architecture"]
}

// 2. Define constraints based on decision
{
  action: "add",
  category: "database",
  constraint_text: "All database operations must use connection pooling with max 20 connections",
  layer: "data"
}

// 3. Create implementation task
{
  action: "create",
  title: "Set up PostgreSQL connection pool",
  description: "Implement connection pooling as per database_choice ADR",
  layer: "data",
  tags: ["database", "postgresql"]
}

// 4. Track file changes
{
  action: "set",
  path: "src/db/connection.ts",
  description: "PostgreSQL connection pool implementation",
  layer: "data"
}
```

---

## Common Errors & Solutions

### Error: "Unknown action: undefined"

**Cause**: Missing `action` parameter

```javascript
// WRONG
{ key: "some_key", value: "some value" }

// CORRECT
{ action: "set", key: "some_key", value: "some value" }
```

### Error: "Invalid layer"

**Valid layers** (9 total):
- `presentation`, `business`, `data`, `infrastructure`, `cross-cutting`
- `documentation`, `planning`, `coordination`, `review`

### Error: "Invalid status"

**Valid decision statuses**: `active`, `deprecated`, `draft`

**Valid task statuses**: `pending`, `in_progress`, `blocked`, `on_hold`, `completed`

### Error: "Batch operations are limited to 50 items maximum"

**Solution**: Split into multiple batches of ≤50 items each

---

## Key Parameters Quick Reference

### decision tool

| Action | Required | Optional |
|--------|----------|----------|
| **set** | action, key, value, layer | version, status, tags, scopes |
| **get** | action, key | version |
| **list** | action | status, layer, tags, limit |

### task tool

| Action | Required | Optional |
|--------|----------|----------|
| **create** | action, title | description, priority, layer, tags, status |
| **move** | action, task_id, status | - |
| **list** | action | status, layer, tags, limit |

### constraint tool

| Action | Required | Optional |
|--------|----------|----------|
| **add** | action, category, constraint_text | priority, layer, tags |
| **get** | action | category, layer, active_only |

> **Full parameter reference**: See [TOOL_REFERENCE.md](TOOL_REFERENCE.md)

---

## ADR Best Practices for AI Agents

### Writing Good ADRs

1. **Include rationale** - Explain WHY, not just WHAT
   ```javascript
   // BAD: "Use PostgreSQL"
   // GOOD: "Use PostgreSQL for ACID compliance (rejected MongoDB for lack of transactions)"
   ```

2. **Document alternatives** - Show what was considered and rejected
   ```javascript
   value: "JWT chosen. Alternatives: session-based (rejected: scaling), OAuth (overkill for internal API)"
   ```

3. **Use descriptive keys** - Make decisions discoverable
   ```javascript
   // BAD: key: "db"
   // GOOD: key: "database_postgresql_production"
   ```

4. **Tag comprehensively** - Enable efficient searching
   ```javascript
   tags: ["database", "postgresql", "production", "acid", "scalability"]
   ```

5. **Link related entities** - Connect decisions to implementation
   ```javascript
   // Record decision → Create constraint → Make task → Track files
   ```

### Technical Best Practices

1. **Always include `action` parameter** - #1 error source
2. **Always specify `layer`** - Required for architectural organization
3. **Use `atomic: false` for batch operations** - Avoid all-or-nothing failures
4. **Check for duplicates first** - Use `suggest` tool before creating decisions
5. **Version important changes** - Increment version for significant updates

> **Detailed best practices**: See [BEST_PRACTICES.md](BEST_PRACTICES.md)

---

## Built-In Documentation

All tools provide built-in help with zero token cost:

```javascript
// Get detailed help for any tool
{ action: "help" }

// Get comprehensive examples
{ action: "example" }
```

---

## Related Documentation

| Document | Content |
|----------|---------|
| [TOOL_REFERENCE.md](TOOL_REFERENCE.md) | Complete parameter reference |
| [WORKFLOWS.md](WORKFLOWS.md) | Multi-step workflow examples |
| [BEST_PRACTICES.md](BEST_PRACTICES.md) | Detailed best practices |
| [DECISION_INTELLIGENCE.md](DECISION_INTELLIGENCE.md) | Decision duplicate detection |
| [CONSTRAINT_INTELLIGENCE.md](CONSTRAINT_INTELLIGENCE.md) | Constraint duplicate detection |
| [BATCH_VALIDATION.md](BATCH_VALIDATION.md) | Batch operations guide |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System architecture |

---

## Most Common Mistakes

1. **Missing `action` parameter** ← #1 error!
2. Invalid layer/status values
3. Forgetting to specify `layer` when setting decisions
4. Using `atomic: true` by default in batch operations
5. Using `new_status` instead of `status` for task.move

**When in doubt**: Call `{action: "help"}` or `{action: "example"}`!
