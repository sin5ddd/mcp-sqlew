## Plan Mode Integration

When `<system-reminder>Plan mode is active</system-reminder>` appears:

### Research Phase - Check existing context:
- `mcp__sqlew__suggest action="by_tags"` - find related decisions
- `mcp__sqlew__task action="list" status="in_progress"` - check active tasks

### Final Plan Phase - Record outcomes:
- `mcp__sqlew__decision action="set"` - record key architectural decisions
- `mcp__sqlew__task action="create_batch"` - create implementation tasks

**Quick Reference**: `.claude/skills/sqw-plan-guidance/SKILL.md`
