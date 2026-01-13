## Queue Monitoring After Plan Mode

### When to Check

After ExitPlanMode or when Plan-to-ADR processing completes, check if there are unprocessed items in the queue.

**Queue file location:** `.sqlew/queue/pending.json`

### How to Check

1. Read `.sqlew/queue/pending.json`
2. If `items` array is not empty, items are stuck in the queue
3. Investigate why they weren't processed (likely High Similarity)

### Common Issue: High Similarity Block

Items may remain in queue if they have high similarity (60%+) to existing decisions. This happens because:
- HookQueueWatcher runs in background
- Similarity warnings/blocks don't reach the AI

### Resolution Steps

If items remain in queue:

1. **Check existing decisions** using `/sqlew search for <topic>`
2. **Decide action:**
   - If truly duplicate: Clear the queue item (edit pending.json)
   - If different intent: Update the key to be more specific
3. **Report to user** if manual intervention is needed

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

### Clearing Stuck Items

To clear processed/duplicate items, edit `.sqlew/queue/pending.json`:
- Remove items from the `items` array
- Or set `"items": []` to clear all
