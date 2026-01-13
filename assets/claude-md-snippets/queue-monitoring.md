## Queue Monitoring After Plan Mode

### When to Check

After ExitPlanMode or when Plan-to-ADR processing completes, check if there are unprocessed items in the queue.

**Queue file location:** `.sqlew/queue/pending.json`

### How to Check

Use the `queue` MCP tool to check the queue status:

```
queue { action: "list" }
```

If `count > 0`, items are stuck in the queue.

### Common Issue: High Similarity Block

Items may remain in queue if they have high similarity (60%+) to existing decisions. This happens because:
- HookQueueWatcher runs in background
- Similarity warnings/blocks don't reach the AI

### Resolution Steps

If items remain in queue:

1. **Check existing decisions** using `/sqlew search for <topic>`
2. **Decide action:**
   - If truly duplicate: Use `queue { action: "remove", index: N }` to remove
   - If different intent: Update the key to be more specific
3. **Report to user** if manual intervention is needed

### Queue Tool Actions

| Action | Description | Example |
|--------|-------------|---------|
| `list` | Show all pending items | `queue { action: "list" }` |
| `remove` | Remove specific item | `queue { action: "remove", index: 0 }` |
| `clear` | Remove all items | `queue { action: "clear" }` |

### Queue File Format

```json
{
  "items": [
    {
      "type": "decision",
      "action": "create",
      "timestamp": "2026-01-13T00:00:00.000Z",
      "data": {
        "key": "path/to/decision",
        "value": "description",
        "status": "draft",
        "layer": "infrastructure",
        "tags": ["plan", "auto-extracted", "..."]
      }
    }
  ]
}
```
