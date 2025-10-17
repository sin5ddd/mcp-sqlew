# Best Practices & Troubleshooting

**Essential guidelines and solutions for common sqlew usage issues**

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

## ⚠️ CRITICAL: What to Store in Decisions

**Second Most Important Rule**: Decisions table stores **WHY and REASON**, NOT **WHAT was done**.

### The Principle

sqlew provides **organizational memory** by filling the gap between Git and code comments:

- **Git history** → WHAT changed (files, lines, commits)
- **Code comments** → HOW it works (implementation details)
- **sqlew decisions** → **WHY it was changed** (reasoning, trade-offs, context)
- **sqlew tasks** → WHAT needs to be done (work items, status, completion)

### ✅ GOOD Examples: Store WHY and REASON

These explain **architectural reasoning** and **design rationale**:

```javascript
// ✅ GOOD - Explains WHY with reasoning and trade-offs
{
  action: "set",
  key: "api/auth/jwt-choice",
  value: "Chose JWT over session-based auth because: (1) Stateless design scales horizontally, (2) Mobile clients can cache tokens, (3) Microservice architecture requires distributed auth. Trade-off: Revocation requires token blacklist, but acceptable for 15-min token lifetime.",
  layer: "business",
  tags: ["authentication", "architecture-decision"]
}

// ✅ GOOD - Problem analysis with solution rationale
{
  action: "set",
  key: "bug/batch-nested-transaction",
  value: "Found nested transaction bug in setDecisionBatch. setDecision uses transaction() internally, but setDecisionBatch wraps calls to setDecision in its own transaction, causing 'cannot start a transaction within a transaction' error. Solution: Extract setDecisionInternal() without transaction wrapper, batch manages outer transaction.",
  layer: "business",
  tags: ["bug", "transaction", "root-cause-analysis"]
}

// ✅ GOOD - Design trade-offs with honest assessment
{
  action: "set",
  key: "phase2-refactoring-assessment",
  value: "Query builder provides value for simple filters (files.ts 31% reduction). Context.ts patterns are domain-specific and more maintainable inline. Real savings: ~450 tokens (not estimated 2,050). Learned: Not all 'duplication' should be abstracted - domain logic clarity > generic utilities.",
  layer: "infrastructure",
  tags: ["refactoring", "assessment", "design-decision"]
}

// ✅ GOOD - Architectural constraint reasoning
{
  action: "set",
  key: "loom_material_duration_boundary",
  value: "Duration calculation must NOT occur in Loom module. Loom generates abstract structures (pitches, timings). Material module calculates concrete note properties (duration, velocity, MIDI pitch). VIOLATION: groove_engine.rs calculates duration using dense parameter - breaks architectural separation.",
  layer: "business",
  tags: ["architecture", "separation-of-concerns"]
}

// ✅ GOOD - Breaking change with migration rationale
{
  action: "set",
  key: "oscillator-type-refactor",
  value: "oscillator_type moved from base SynthConfig to MonophonicSynthConfig only. Reason: FM synths use per-operator oscillator_type, wavetable/granular/sampler/physical-modeling use different synthesis methods. Breaking change necessary to support diverse synthesis architectures.",
  layer: "data",
  tags: ["breaking", "synthesis", "architecture"]
}
```

### ❌ BAD Examples: Don't Store WHAT Was Done

These are task completion logs, status updates, or implementation logs:

```javascript
// ❌ BAD - Task completion log (use tasks tool instead)
{
  action: "set",
  key: "v3.0.2-testing-complete",
  value: "v3.0.2 comprehensive testing complete. All refactored tools verified working: validators.ts integration confirmed, query-builder.ts functioning correctly."
}
// WHY BAD: This records WHAT was completed, not WHY design decisions were made.
// FIX: Delete. Use tasks tool to track testing progress.

// ❌ BAD - Implementation status (use git commit instead)
{
  action: "set",
  key: "phase1-validation-refactoring-complete",
  value: "All 5 tool files successfully refactored to use validators.ts utility module. Eliminates 27+ duplicated validation patterns."
}
// WHY BAD: Records completion status, not architectural reasoning.
// FIX: Delete. If needed, create decision explaining WHY refactoring strategy was chosen.

// ❌ BAD - Test results (temporary status)
{
  action: "set",
  key: "refactoring/integration-test-results",
  value: "PASS - All refactored utilities integrate correctly. Build succeeds, no breaking changes detected."
}
// WHY BAD: Test results are temporary status, not design rationale.
// FIX: Delete. Test results belong in CI/CD logs, not architectural decisions.

// ❌ BAD - Documentation updates (implementation log)
{
  action: "set",
  key: "doc-restructure-complete",
  value: "Split AI_AGENT_GUIDE.md into 4 focused files. Achieved 68% average token reduction."
}
// WHY BAD: Records WHAT was done, not WHY documentation structure was chosen.
// FIX: Delete or rewrite to explain: "Documentation split into focused files because AI agents load only relevant sections - reduces token consumption by 81% vs loading full guide."

// ❌ BAD - Git commit summary (duplicate of git history)
{
  action: "set",
  key: "v2.1.1/git-commit",
  value: "Created release commit 2bf55a0: 6 files changed (386 insertions, 537 deletions)."
}
// WHY BAD: Git already tracks commits - no need to duplicate.
// FIX: Delete. Git history serves this purpose.
```

### Side-by-Side Comparison

| ✅ GOOD (WHY/REASON) | ❌ BAD (WHAT/STATUS) |
|---------------------|---------------------|
| "Chose JWT because stateless auth scales horizontally for microservices" | "Implemented JWT authentication. Tests passing." |
| "Nested transaction bug: setDecision wraps in transaction, batch also wraps → solution: extract internal helper" | "Fixed batch_create nested transaction bug." |
| "Query builder works for simple filters but domain logic better inline for maintainability" | "Phase 2 refactoring complete. Query builder created." |
| "Duration must NOT be in Loom - breaks architectural separation between abstract timing and concrete notes" | "Removed duration from Loom module. Fixed errors." |

### When to Use Each Tool

| Tool | Purpose | Example |
|------|---------|---------|
| **decision** | WHY: Architectural reasoning | "Chose Redis because sub-10ms latency required" |
| **task** | WHAT: Work items & status | "Implement Redis caching (status: in_progress)" |
| **constraint** | Requirements & rules | "Cache response time must be <10ms" |
| **message** | Agent coordination | "Redis blocked - waiting for infra approval" |
| **file** | Track changes | "Modified src/cache.ts - added Redis client" |

---

## Common Errors & Solutions

💡 **See also**: [ARCHITECTURE.md](ARCHITECTURE.md) for detailed layer, enum, and status definitions.

### Error: "Unknown action: undefined"

**Cause**: Missing `action` parameter

**Solution**: Always include `action` as the first parameter

```javascript
// ❌ WRONG
{
  key: "some_key",
  value: "some value",
  layer: "business"
}

// ✅ CORRECT
{
  action: "set",
  key: "some_key",
  value: "some value",
  layer: "business"
}
```

### Error: "Parameter \"value\" is required"

**Cause**: Using `defaults` instead of direct parameters with templates

**Solution**: Provide parameters directly, not nested in `defaults`

```javascript
// ❌ WRONG
{
  action: "set_from_template",
  template: "deprecation",
  key: "some_key",
  defaults: {
    value: "...",
    layer: "cross-cutting"
  }
}

// ✅ CORRECT
{
  action: "set_from_template",
  template: "deprecation",
  key: "some_key",
  value: "...",
  layer: "cross-cutting"
}
```

### Error: "Invalid layer"

**Cause**: Using a layer name that doesn't exist

**Solution**: Use one of the 5 standard layers

**Valid layers**: `presentation`, `business`, `data`, `infrastructure`, `cross-cutting`

```javascript
// ❌ WRONG
{
  action: "set",
  key: "my_key",
  value: "my_value",
  layer: "backend"  // Invalid!
}

// ✅ CORRECT
{
  action: "set",
  key: "my_key",
  value: "my_value",
  layer: "business"  // Valid!
}
```

### Error: "Invalid status"

**Cause**: Using a status value that doesn't exist

**Solution**: Use one of the 3 valid statuses

**Valid statuses**: `active`, `deprecated`, `draft`

### Error: "Batch operations are limited to 50 items maximum"

**Cause**: Too many items in batch array

**Solution**: Split into multiple batches of ≤50 items each

---

## Best Practices

### 1. Always Use `action` Parameter

**Never forget to include `action`** - it's required in ALL tool calls.

### 2. Use `atomic: false` for Batch Operations

Unless you specifically need all-or-nothing guarantees, use `atomic: false` to avoid transaction failures from validation errors.

```javascript
{
  action: "set_batch",
  atomic: false,  // Recommended for AI agents
  decisions: [...]
}
```

### 3. Choose the Right Search Action

- Simple queries → `list`
- Tag-focused → `search_tags`
- Complex multi-filter → `search_advanced`

See [TOOL_SELECTION.md](TOOL_SELECTION.md) for detailed guidance.

### 4. Use Templates for Common Patterns

If you're repeatedly setting decisions with the same metadata, create a template.

```javascript
{
  action: "set_from_template",
  template: "breaking_change",
  key: "api_change_v2",
  value: "Moved endpoint to /v2/users"
}
```

### 5. Provide Meaningful Tags

Tags are crucial for searchability. Use descriptive, consistent tag naming:

```javascript
// ✅ GOOD
tags: ["authentication", "security", "jwt", "v1.2.0"]

// ❌ BAD
tags: ["stuff", "important", "thing"]
```

### 6. Always Specify `layer` for Decisions

Layer classification helps organize architectural concerns.

💡 **See [ARCHITECTURE.md](ARCHITECTURE.md#layers) for detailed layer definitions and usage examples.**

Quick reference:
- **presentation**: UI, API endpoints, user-facing interfaces
- **business**: Service logic, workflows, business rules
- **data**: Database models, schemas, data access
- **infrastructure**: Configuration, deployment, DevOps
- **cross-cutting**: Logging, monitoring, security (affects multiple layers)

### 7. Use `has_updates` for Efficient Polling

Instead of fetching all data repeatedly, check for updates first:

```javascript
// Check if anything changed
{
  action: "has_updates",
  agent_name: "my-agent",
  since_timestamp: "2025-10-15T08:00:00Z"
}

// Response: {has_updates: true, counts: {decisions: 5, messages: 2, files: 3}}

// Only fetch if has_updates is true
```

Token cost: ~5-10 tokens per check vs full data retrieval.

### 8. Handle Errors Gracefully

All tools return JSON responses. Check for `error` field:

```javascript
// Response format
{
  "error": "Invalid layer: backend"
}

// Success format
{
  "success": true,
  "key": "my_key",
  ...
}
```

### 9. Use Constraints for Requirements

**Constraint** vs **Decision**:

- **Decision**: "We chose PostgreSQL" (a choice that was made)
- **Constraint**: "Response time must be <100ms" (a requirement to follow)

```javascript
{
  action: "add",
  category: "performance",
  constraint_text: "API response time must be under 100ms",
  priority: "critical",
  layer: "business",
  tags: ["api", "performance"]
}
```

### 10. Clean Up Old Data Regularly

Use the `clear` action to prevent database bloat:

```javascript
// Manual cleanup
{
  action: "clear",
  messages_older_than_hours: 48,
  file_changes_older_than_days: 14
}

// Or rely on auto-cleanup (configured via config tool)
{
  action: "update",
  ignoreWeekend: true,
  messageRetentionHours: 24,
  fileHistoryRetentionDays: 7
}
```

---

## Troubleshooting Checklist

Before asking for help, check:

1. ✅ Did you include the `action` parameter?
2. ✅ Are all required parameters provided?
3. ✅ Are enum values spelled correctly? (layer, status, msg_type, etc.)
4. ✅ For templates: Are you passing parameters directly (not in `defaults`)?
5. ✅ For batch operations: Is array size ≤50?
6. ✅ For timestamps: Are you using ISO 8601 format?

---

## Summary: Most Common Mistakes

1. **Missing `action` parameter** ← #1 error!
2. Using `defaults` instead of direct parameters with templates
3. Invalid layer/status/priority values (use exact strings)
4. Forgetting to specify `layer` when setting decisions
5. Using `atomic: true` by default in batch operations (use `false`)
6. Using wrong search action (`list` vs `search_tags` vs `search_advanced`)
7. Empty arrays in batch operations
8. Typos in parameter names (e.g., `messsage` instead of `message`)

---

## Need More Help?

Use the built-in help action for any tool:

```javascript
// Get detailed help for decision tool
{
  action: "help"
}
```

This returns comprehensive documentation with:
- All actions and their parameters
- Examples for each action
- Valid values for enum parameters
- Behavior descriptions

---

## Performance Tips

### Token Efficiency

1. **Use `has_updates` before fetching** - Save 95% tokens when no changes
2. **Use metadata-only task queries** - 70% smaller than decision tool
3. **Batch operations** - 52% token reduction vs individual calls
4. **Use search actions wisely** - `list` for simple queries, `search_advanced` for complex

### Database Health

1. **Monitor with `db_stats`** - Check database size regularly
2. **Enable auto-cleanup** - Configure retention via `config` tool
3. **Use weekend-aware mode** - Skip weekends for retention calculation
4. **Archive completed tasks** - Keep task board clean

### Multi-Agent Coordination

1. **Use priority levels** - Critical messages get attention first
2. **Broadcast sparingly** - Use targeted messages when possible
3. **Link tasks to decisions** - Maintain traceability
4. **Update task status promptly** - Enable auto-stale detection to work

---

## Related Documentation

- **[TOOL_SELECTION.md](TOOL_SELECTION.md)** - Choosing the right tool for your task
- **[TOOL_REFERENCE.md](TOOL_REFERENCE.md)** - Complete parameter reference
- **[WORKFLOWS.md](WORKFLOWS.md)** - Multi-step workflow examples
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Layer definitions and system architecture
- **[AI_AGENT_GUIDE.md](AI_AGENT_GUIDE.md)** - Complete guide (original comprehensive version)

---

**Remember**: When in doubt, call `{action: "help"}` on any tool!
