# Decision Context - Rich Decision Documentation (v3.2.2+)

## Overview

The **Decision Context** feature allows you to attach rich documentation to architectural and implementation decisions, explaining **WHY** a decision was made, what alternatives were considered, and the trade-offs involved. This goes beyond simple key-value storage to provide deep historical context that helps future developers (both human and AI) understand past reasoning.

---

## 🆕 Decision Intelligence Integration (v3.9.0)

### Project Historical Records with Automatic Updates

**v3.9.0 introduces intelligent duplicate detection** that treats decisions as **living historical records** rather than static entries. This transforms how you maintain project knowledge:

#### The Problem: Decision Fragmentation

Without intelligent detection, teams create fragmented decision records:
```
api-authentication → "Use JWT"
auth-method → "JWT tokens"
api-auth-strategy → "JWT with refresh tokens"
```

**Result**: 3 separate entries for the same decision, making it impossible to track the evolution of your authentication strategy.

#### The Solution: Three-Tier Historical Record Management

**Tier 1 (35-44 score): Related Record Alert**
- Shows potentially related historical records
- Allows you to link or update existing records
- Perfect for discovering "we discussed this before"

**Tier 2 (45-59 score): Update Existing Record**
- High similarity suggests same topic
- Prompts you to update the existing record with new context
- Maintains decision continuity

**Tier 3 (60+ score): Automatic Historical Update**
- Transparently updates existing record
- Preserves complete version history
- Zero friction for iterative refinement

#### Example: Evolving Authentication Decision

**Initial Decision (January)**:
```typescript
{
  action: "set",
  key: "api-authentication",
  value: "Use JWT tokens for API authentication",
  tags: ["api", "security", "authentication"],
  layer: "business"
}
```

**Updated Context (March)** - After security review:
```typescript
{
  action: "set",
  key: "api-auth-jwt-expiration",  // Similar key
  value: "JWT tokens with 15-minute expiration",
  tags: ["api", "security", "authentication"],  // Same tags
  layer: "business"  // Same layer
}

// v3.9.0 Response:
{
  "success": true,
  "auto_updated": true,
  "requested_key": "api-auth-jwt-expiration",
  "actual_key": "api-authentication",  // Updated existing record!
  "version": "1.0.1",  // Version incremented
  "message": "Auto-updated existing decision (similarity: 85)"
}
```

**Result**: Single historical record with version history:
- v1.0.0: "Use JWT tokens for API authentication"
- v1.0.1: "JWT tokens with 15-minute expiration"

**Query version history**:
```typescript
{
  action: "versions",
  key: "api-authentication"
}
// Returns both versions with timestamps
```

### Benefits for Project History

1. **Single Source of Truth**: One record per decision topic, not scattered duplicates
2. **Complete Version Trail**: Track how decisions evolved over time
3. **Context Accumulation**: Add context to existing decisions, building richer documentation
4. **Automatic Consolidation**: Similar decisions merge into the canonical record
5. **Discoverable History**: `suggest` tool finds related decisions instantly

### Combining Context with Duplicate Detection

**Best Practice**: Use duplicate detection to find existing records, then add context:

```typescript
// Step 1: Check for existing related decisions
{
  action: "check_duplicate",
  key: "cache-strategy-redis",
  tags: ["caching", "performance", "redis"]
}

// Response shows existing "cache-implementation" decision

// Step 2: Update existing record (Tier 3 auto-update)
{
  action: "set",
  key: "cache-strategy-redis",
  value: "Redis LRU cache with 1000-item limit",
  tags: ["caching", "performance", "redis"],
  layer: "infrastructure"
}
// Auto-updates "cache-implementation" to v1.0.2

// Step 3: Add rich context to the canonical record
{
  action: "add_decision_context",
  key: "cache-implementation",  // The actual key that was updated
  rationale: "Updated to Redis after hitting memory limits with in-process cache. 1000-item LRU covers 98% of requests.",
  alternatives_considered: [
    "Increase in-memory cache - Rejected: OOM risk",
    "Memcached - Rejected: No persistence",
    "Redis with TTL - Rejected: Hot items get evicted"
  ],
  tradeoffs: {
    "pros": ["Persistent cache", "Shared across instances", "Built-in LRU"],
    "cons": ["Network latency", "Operational complexity"]
  }
}
```

### Policy-Based Historical Record Management

Enable automatic duplicate checking for all decisions in a category:

```typescript
{
  action: "create_policy",
  name: "architecture-decisions",
  defaults: {
    layer: "cross-cutting",
    tags: ["architecture"]
  },
  suggest_similar: 1,  // Auto-check for duplicates
  validation_rules: {
    patterns: { key: "^arch/" }
  }
}

// Now all arch/* decisions automatically check history
{
  action: "set",
  key: "arch/database-strategy",
  value: "PostgreSQL with read replicas",
  // Automatically checks for related arch/* decisions
  // Updates existing record if high similarity found
}
```

### See Also

- **[DECISION_INTELLIGENCE.md](DECISION_INTELLIGENCE.md)** - Complete three-tier system documentation
- **[WORKFLOWS.md](WORKFLOWS.md)** - Workflow 5: Decision Intelligence & Duplicate Prevention

---

## When Do You Need This Feature?

### ❌ When You DON'T Need It

**Simple Configuration Decisions** - Use regular `decision` tool:
```typescript
// Just storing a value - no context needed
{ action: "set", key: "max_retries", value: 3 }
{ action: "set", key: "api_endpoint", value: "https://api.example.com" }
```

**Obvious Choices** - Self-explanatory decisions:
```typescript
// Technology choices that are industry standard
{ action: "set", key: "language", value: "TypeScript" }
```

---

### ✅ When You NEED It

#### **Scenario 1: Multi-Session AI Development**

**Problem**: You're developing a feature over multiple days. On Day 3, an AI agent revisits a Day 1 decision and doesn't understand why approach X was chosen over Y.

**Before Decision Context** (Day 1):
```typescript
// Agent 1 makes a decision
{ action: "set", key: "auth/token_storage", value: "httponly_cookie" }
```

**On Day 3** - Agent 2 asks: *"Why httponly cookie instead of localStorage?"*
- No documented rationale
- Agent 2 might waste 20 minutes re-evaluating the same alternatives
- Risk of choosing a worse approach due to lack of context

**With Decision Context** (Day 1):
```typescript
// Agent 1 documents the decision with full context
{
  action: "add_decision_context",
  key: "auth/token_storage",
  rationale: "Using httpOnly cookies to prevent XSS attacks. The application handles sensitive financial data, so localStorage (vulnerable to XSS) is unacceptable despite better mobile support.",
  alternatives_considered: [
    "localStorage - Rejected: Vulnerable to XSS attacks",
    "sessionStorage - Rejected: Doesn't persist across tabs",
    "IndexedDB - Rejected: Overly complex for simple token storage"
  ],
  tradeoffs: {
    "pros": [
      "XSS-resistant (httpOnly flag)",
      "Automatic CSRF protection with SameSite",
      "Works on all modern browsers"
    ],
    "cons": [
      "Requires server-side session management",
      "More complex mobile app integration",
      "Cannot be accessed by JavaScript"
    ]
  },
  decided_by: "security-agent"
}
```

**On Day 3** - Agent 2 reads the context:
- ✅ Instantly understands security was the priority
- ✅ Sees all alternatives were already evaluated
- ✅ No wasted time re-analyzing
- ✅ Can make informed decision if requirements change

---

#### **Scenario 2: Architecture Reviews & Team Handoffs**

**Problem**: New developer (or AI agent) joins the project 6 months later. They see a non-standard architecture choice and want to "fix" it, not knowing it was intentional.

**Real Example: Database Choice**

**Without Context**:
```typescript
{ action: "set", key: "db/engine", value: "sqlite" }
```

**New developer thinks**: *"SQLite? That's just for prototypes. Let me migrate to PostgreSQL..."*
- Wastes 2 days migrating
- Breaks deployment (the app runs on edge functions where PostgreSQL isn't available)
- Rolls back changes

**With Context**:
```typescript
{
  action: "add_decision_context",
  key: "db/engine",
  rationale: "Using SQLite because this app deploys to Cloudflare Workers (edge compute), which provides D1 (SQLite-compatible). PostgreSQL is not available in this environment. Performance requirements are modest (< 1000 req/min).",
  alternatives_considered: [
    "PostgreSQL - Rejected: Not available on Cloudflare Workers edge runtime",
    "DynamoDB - Rejected: Adds 50-100ms latency vs local SQLite",
    "Durable Objects - Rejected: Experimental, limited query capabilities"
  ],
  tradeoffs: {
    "pros": [
      "Zero latency (co-located with compute)",
      "Native Cloudflare D1 support",
      "No external database costs",
      "Simple deployment"
    ],
    "cons": [
      "Limited to 1GB database size",
      "No real-time multi-write (uses eventual consistency)",
      "Fewer advanced SQL features than PostgreSQL"
    ]
  },
  decided_by: "architect-agent",
  related_constraint_id: 42  // Links to "must run on edge" constraint
}
```

**New developer reads context**:
- ✅ Understands deployment environment constraint
- ✅ Sees PostgreSQL was already evaluated and rejected
- ✅ Saves 2 days of wasted migration work
- ✅ Can propose alternative if constraints change

---

#### **Scenario 3: Breaking Changes & Deprecations**

**Problem**: You need to introduce a breaking API change. Future agents need to understand why compatibility was broken and how to migrate.

**Example: API Versioning**

**Without Context**:
```typescript
{ action: "set", key: "api/version", value: "v2" }
```

**Future agent sees v1 code and thinks**: *"This is old, should I delete it?"*

**With Context**:
```typescript
{
  action: "add_decision_context",
  key: "api/version_v2_breaking_change",
  rationale: "Introduced v2 API with breaking changes to fix fundamental design flaw in v1's authentication model. V1 used client-provided user IDs (security vulnerability CVE-2024-XXXX). V2 enforces server-side session validation. V1 will be deprecated 2025-12-31.",
  alternatives_considered: [
    "Patch v1 in-place - Rejected: Would break all existing clients immediately",
    "Add optional server-validation flag - Rejected: Allows insecure usage to persist",
    "Create v2 with gradual migration - Selected: Gives clients 12 months to migrate"
  ],
  tradeoffs: {
    "pros": [
      "Fixes critical security vulnerability",
      "Provides migration window for clients",
      "Cleaner API design in v2"
    ],
    "cons": [
      "Requires maintaining two API versions for 12 months",
      "Client migration effort (approx 2 hours per integration)",
      "Potential user confusion during transition"
    ]
  },
  decided_by: "security-team",
  related_task_id: 156  // Links to "Implement v2 API" task
}
```

**Future agent benefits**:
- ✅ Understands why v1 can't be deleted yet (12-month migration window)
- ✅ Knows exact deprecation date (2025-12-31)
- ✅ Can communicate migration requirements to users
- ✅ Understands security reasoning behind breaking change

---

#### **Scenario 4: Performance Optimization Trade-offs**

**Problem**: Performance optimization often involves trade-offs (memory vs speed, complexity vs latency). Future agents need to understand these choices to avoid "optimizing" in the wrong direction.

**Example: Caching Strategy**

**With Context**:
```typescript
{
  action: "add_decision_context",
  key: "cache/strategy",
  rationale: "Using LRU cache with 1000-item limit instead of unbounded cache. Benchmarks showed 1000 items covers 98% of requests with 50MB memory usage. Unbounded cache grew to 2GB in production testing, causing OOM errors.",
  alternatives_considered: [
    "Unbounded cache - Rejected: Memory leaks in long-running processes",
    "TTL-based cache - Rejected: Hot items get evicted unnecessarily",
    "Two-tier (L1 LRU + L2 Redis) - Rejected: Adds 5ms latency and operational complexity"
  ],
  tradeoffs: {
    "pros": [
      "Predictable memory usage (max 50MB)",
      "98% hit rate on production traffic",
      "Simple implementation (no external dependencies)"
    ],
    "cons": [
      "2% of requests miss cache (cold items)",
      "No cross-server cache sharing",
      "Requires tuning item limit per deployment size"
    ]
  },
  decided_by: "performance-agent"
}
```

**Future optimization agent**:
- ✅ Understands 1000-item limit is intentional (not arbitrary)
- ✅ Knows unbounded cache was already tested and failed
- ✅ Can propose Redis tier if cross-server sharing becomes critical
- ✅ Won't waste time re-benchmarking already-tested alternatives

---

## Workflow Patterns

### Pattern 1: Decision → Context → Task

**Use when**: A decision requires implementation work

```typescript
// Step 1: Make the decision
{
  action: "set",
  key: "db/connection_pooling",
  value: "enabled",
  tags: ["performance", "database"]
}

// Step 2: Document context
{
  action: "add_decision_context",
  key: "db/connection_pooling",
  rationale: "Enabling connection pooling to reduce connection overhead from 50ms to 5ms per query. Application makes 100 req/sec, so this saves 4.5 seconds of connection time per second (90% reduction).",
  tradeoffs: {
    "pros": ["90% connection time reduction", "Better resource utilization"],
    "cons": ["Requires pool size tuning", "More complex error handling"]
  }
}

// Step 3: Create implementation task
{
  action: "create",
  title: "Implement database connection pooling",
  layer: "data",
  tags: ["performance"],
  priority: "high"
}

// Step 4: Link decision to task
{
  action: "add_decision_context",
  key: "db/connection_pooling",
  rationale: "...",  // Same as above
  related_task_id: 123  // Link to the task created in step 3
}
```

---

### Pattern 2: Review Decision Context Over Time

**Use when**: Requirements change, and you need to revisit old decisions

```typescript
// Query all decision contexts for a specific layer
{
  action: "list_decision_contexts",
  decision_key: "auth/token_storage"  // Get all context entries for this decision
}

// Example response:
{
  "contexts": [
    {
      "id": 1,
      "decision_key": "auth/token_storage",
      "rationale": "Using httpOnly cookies...",
      "decided_by": "security-agent",
      "decision_date": "2025-01-15T10:00:00Z"
    },
    {
      "id": 5,
      "decision_key": "auth/token_storage",
      "rationale": "Updated to add SameSite=Strict after CSRF attack attempt...",
      "decided_by": "security-team",
      "decision_date": "2025-03-20T14:30:00Z"
    }
  ]
}
```

**Insight**: Decision context accumulates over time, showing decision evolution.

---

## Best Practices

### 1. Write for Future You (or Future AI)

Assume the reader has **zero context** about your project. Explain:
- **Why** this decision was necessary
- **What problem** it solves
- **Why alternatives** were rejected

❌ Bad rationale:
```
"Using Redis for better performance"
```

✅ Good rationale:
```
"Using Redis for session storage to handle 10,000 concurrent users. Previous in-memory storage caused server crashes under load due to limited RAM (8GB per instance). Redis provides distributed storage with automatic failover."
```

---

### 2. Use JSON Arrays for Alternatives

Make alternatives scannable and structured:

```typescript
alternatives_considered: [
  "Option A - Rejected: Reason X",
  "Option B - Rejected: Reason Y",
  "Option C - Selected: Reason Z"
]
```

---

### 3. Balance Pros/Cons Honestly

Don't hide the downsides - future developers need to know when to revisit:

```typescript
tradeoffs: {
  "pros": [
    "Fast implementation (2 days)",
    "Well-documented library"
  ],
  "cons": [
    "Library is deprecated (EOL 2026)",  // Important to know!
    "License is AGPL (might conflict with commercial use)"
  ]
}
```

---

### 4. Link to Related Work

Create traceability:

```typescript
{
  related_task_id: 42,          // Implementation task
  related_constraint_id: 7      // "Must support offline mode" constraint
}
```

---

## API Reference

### Add Decision Context

```typescript
{
  action: "add_decision_context",
  key: "decision_key",                    // Required: Decision to document
  rationale: "Explanation...",            // Required: Why this decision?
  alternatives_considered: [              // Optional: JSON array
    "Alternative 1 - Rejected: Reason",
    "Alternative 2 - Selected: Reason"
  ],
  tradeoffs: {                            // Optional: JSON object
    "pros": ["Pro 1", "Pro 2"],
    "cons": ["Con 1", "Con 2"]
  },
  decided_by: "agent-name",               // Optional: Who decided
  related_task_id: 123,                   // Optional: Link to task
  related_constraint_id: 45               // Optional: Link to constraint
}
```

### Get Decision with Context

```typescript
{
  action: "get",
  key: "decision_key",
  include_context: true  // Include all context entries
}
```

### List Decision Contexts

```typescript
{
  action: "list_decision_contexts",
  decision_key: "auth/token_storage",  // Optional: Filter by decision
  related_task_id: 123,                // Optional: Filter by task
  limit: 50,                           // Optional: Default 50
  offset: 0                            // Optional: Default 0
}
```

---

## Token Efficiency

**Decision Context is optional** - only use it for important decisions where future understanding is critical.

**Token Cost Comparison**:
- Simple decision: ~50 tokens
- Decision with context: ~200-500 tokens
- Time saved avoiding re-analysis: 1000-5000 tokens

**Use it when**:
- Decision is non-obvious or controversial
- Trade-offs were significant
- Future developers might question the choice
- Multiple alternatives were considered

**Skip it when**:
- Decision is self-explanatory
- Value is temporary/experimental
- Standard industry practice

---

## Migration from Old Decisions

If you have old decisions that need context, add it retroactively:

```typescript
// Step 1: Find old decision
{ action: "get", key: "old_decision" }

// Step 2: Add context
{
  action: "add_decision_context",
  key: "old_decision",
  rationale: "Retroactive documentation: This decision was made on 2024-06-15 to solve problem X. At the time, we chose approach Y because of constraint Z."
}
```

---

## Summary: When to Use Decision Context

| **Scenario** | **Use Decision Context?** | **Why?** |
|-------------|---------------------------|----------|
| Simple config value | ❌ No | Self-explanatory |
| Architecture choice | ✅ Yes | Future developers need to understand trade-offs |
| Breaking change | ✅ Yes | Migration context critical |
| Temporary experiment | ❌ No | Will be replaced soon |
| Performance optimization | ✅ Yes | Trade-offs need documentation |
| Security decision | ✅ Yes | Reasoning must be preserved |
| Technology selection | ✅ Yes | Alternatives evaluation important |

---

## Key Takeaways

### Decision Context + Decision Intelligence = Complete Historical Records

**v3.9.0 transforms how you manage project knowledge:**

1. **Decision Context** (v3.2.2) → Adds rich documentation (rationale, alternatives, trade-offs)
2. **Decision Intelligence** (v3.9.0) → Prevents fragmentation, maintains continuity

**Together they provide:**
- **Living historical records** that evolve with your project
- **Version trails** showing decision evolution over time
- **Automatic consolidation** preventing scattered duplicates
- **Rich context** explaining WHY decisions were made
- **Discoverable knowledge** via similarity search

**Best workflow:**
1. Use `check_duplicate` before creating new decisions
2. Let auto-update merge similar decisions into canonical records
3. Add rich context to the consolidated record
4. Query `versions` to see decision evolution

**Decision Context transforms decisions from "what" into "why"** - making your codebase understandable to future developers and AI agents across months or years of development.

**Decision Intelligence ensures decisions are living records** - automatically updated and consolidated rather than scattered across fragmented entries.
