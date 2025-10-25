# Best Practices & Troubleshooting

## Critical Rules

### 1. Always Include `action` Parameter
**#1 cause of errors**

```javascript
❌ { key: "some_key", value: "some value" }
✅ { action: "set", key: "some_key", value: "some value" }
```

### 2. Store WHY in Decisions, Not WHAT

**Organizational memory gap:**
- Git history → WHAT changed
- Code comments → HOW it works
- **Decisions** → WHY it was changed (reasoning, trade-offs)
- **Tasks** → WHAT needs to be done (work status)

### Good vs Bad Examples

**✅ GOOD - Store WHY:**
- "Chose JWT because: stateless scales, mobile caching, distributed auth. Trade-off: needs blacklist."
- "Nested transaction bug: setDecision wraps, batch wraps → extract internal helper."
- "Duration must NOT be in Loom - breaks architectural separation."

**❌ BAD - Don't store WHAT:**
- "v3.0.2 testing complete. All tools verified working." → Use tasks
- "Refactoring complete. Query builder created." → Use git commits
- "PASS - All tests passing." → Use CI/CD logs
- "Doc restructure complete." → Use git commits

---

## Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "Unknown action: undefined" | Missing `action` | Always include `action` parameter |
| "Parameter 'value' is required" | Using `defaults` with templates | Pass parameters directly, not in `defaults` |
| "Invalid layer" | Wrong layer name | Use: presentation, business, data, infrastructure, cross-cutting |
| "Invalid status" | Wrong status | Use: active, deprecated, draft |
| "Batch limit exceeded" | >50 items | Split into batches of ≤50 |

---

## Best Practices

1. **Always use `action` parameter** - Required in ALL calls
2. **Use `atomic: false` for batches** - Avoid transaction failures
3. **Choose right search action** - `list` (simple), `search_tags` (tag-focused), `search_advanced` (complex)
4. **Use templates** - For repeated decision patterns
5. **Meaningful tags** - Descriptive, consistent naming
6. **Always specify `layer`** - Organizes architectural concerns
7. **Use `has_updates`** - Check before fetching (95% token savings)
8. **Handle errors** - Check for `error` field in responses
9. **Constraints for requirements** - Use `constraint` for rules, `decision` for choices
10. **Clean up regularly** - Use `clear` action or auto-cleanup config

---

## Performance Tips

**Token Efficiency:**
- `has_updates` before fetching (95% savings)
- Metadata-only task queries (70% smaller)
- Batch operations (52% reduction)

**Database Health:**
- Monitor with `db_stats`
- Enable auto-cleanup
- Archive completed tasks

**Multi-Agent:**
- Priority levels for messages
- Link tasks to decisions
- Update status promptly

---

## Related Documentation

- [TOOL_SELECTION.md](TOOL_SELECTION.md) - Tool selection guide
- [TOOL_REFERENCE.md](TOOL_REFERENCE.md) - Parameter reference
- [WORKFLOWS.md](WORKFLOWS.md) - Multi-step workflows
- [SHARED_CONCEPTS.md](SHARED_CONCEPTS.md) - Layers, enums, concepts

**Tip**: Use `{action: "help"}` for any tool's detailed documentation.
