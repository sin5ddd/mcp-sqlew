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
