---
name: sqlew-plan-guidance
description: |
  Quick reference for sqlew MCP tools.
  Provides usage patterns for Plan mode integration.
---

## Quick Reference

### Research (Check Existing Context)

```typescript
mcp__sqlew__suggest action="by_tags" tags=["tag"]
mcp__sqlew__decision action="search_tags" tags=["tag"]
mcp__sqlew__task action="list" status="in_progress"
```

### Decision Recording

```typescript
mcp__sqlew__decision action="set"
  key="decision-key"
  value="chosen approach"
  rationale="why this decision was made"
  alternatives_considered="what other options were evaluated"
  tradeoffs="benefits and drawbacks"
```

### Task Creation

```typescript
mcp__sqlew__task action="create_batch" tasks=[
  { title: "Task title", layer: "business", priority: 3, file_actions: [...] }
]
```

### Constraint Management

```typescript
mcp__sqlew__constraint action="add"
  category="architecture"
  description="rule description"
  priority=3
```

## Tool Selection Guide

| Purpose | Tool | Action |
|---------|------|--------|
| Find related decisions | suggest | by_tags, by_key |
| Check for duplicates | suggest | check_duplicate |
| Record decision | decision | set |
| Create tasks | task | create, create_batch |
| Add constraint | constraint | add |
| List tasks | task | list |
