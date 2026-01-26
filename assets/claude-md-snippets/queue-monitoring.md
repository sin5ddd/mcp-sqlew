## Queue Monitoring After Plan Mode

### When to Check

After ExitPlanMode or when Plan-to-ADR processing completes, check if there are unprocessed items in the queue.

**Queue file locations:**
- Pending: `.sqlew/queue/pending.json`
- Failed: `.sqlew/queue/failed.json`

### How to Check

Use the `queue` MCP tool to check the queue status:

```
queue { action: "list" }
```

The response includes:
- `count`: Number of pending items
- `failedCount`: Number of failed items (if any)

### Failed Queue (v5.0.1+)

Items that fail processing (e.g., HighSimilarity errors) are automatically moved to `failed.json` instead of being retried indefinitely.

**Why items fail:**
- **HighSimilarity (60%+)**: Item is too similar to an existing decision
- **Validation errors**: Invalid layer, category, or other data issues

**Resolution:**
1. Check `failedItems` in `queue { action: "list" }` response
2. For duplicates: Clear with `queue { action: "clear", target: "failed" }`
3. For different intent: Re-register manually with a more specific key via `/sqlew record <decision>`

### Queue Tool Actions

| Action | Description | Example |
|--------|-------------|---------|
| `list` | Show pending and failed items | `queue { action: "list" }` |
| `remove` | Remove specific pending item | `queue { action: "remove", index: 0 }` |
| `clear` | Clear pending queue (default) | `queue { action: "clear" }` |
| `clear` | Clear failed queue | `queue { action: "clear", target: "failed" }` |
| `clear` | Clear both queues | `queue { action: "clear", target: "all" }` |

### Queue File Formats

**pending.json:**
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

**failed.json:**
```json
{
  "items": [
    {
      "item": {
        "type": "decision",
        "action": "create",
        "timestamp": "2026-01-24T...",
        "data": { "key": "...", "value": "..." }
      },
      "error": "HighSimilarity: 65% match with existing decision 'path/to/existing'",
      "failedAt": "2026-01-24T..."
    }
  ]
}
```
