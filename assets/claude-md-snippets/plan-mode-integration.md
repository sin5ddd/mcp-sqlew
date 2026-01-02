## Plan Mode Integration

### Decision & Constraint Recording Format

When writing plans, use these formats to record decisions and constraints.
They will be **auto-detected on ExitPlanMode** and registered as draft in sqlew.

**Decision format:**
```markdown
### 📌 Decision: [key/path]
- **Value**: Description of the decision
- **Layer**: presentation | business | data | infrastructure | cross-cutting
- **Tags**: tag1, tag2 (optional)
```

**Constraint format:**
```markdown
### 🚫 Constraint: [category]
- **Rule**: Description of the constraint
- **Priority**: critical | high | medium | low
- **Tags**: tag1, tag2 (optional)
```

Category options: `architecture` | `security` | `code-style` | `performance`

### With Claude Code Hooks (Recommended)

If you've run `sqlew init --hooks`, sqlew integration is **fully automatic**:
- Related decisions are auto-suggested before Task execution
- Plan files are auto-tracked with unique IDs
- 📌/🚫 patterns are auto-detected and registered as draft
- Decisions are auto-saved when code is edited
- Status updates to `in_review` when all tasks complete
- Status updates to `implemented` after git merge/rebase

### Manual Usage (Without Hooks)

When `<system-reminder>Plan mode is active</system-reminder>` appears:

**Research Phase:**
- `/sqlew search for <topic>` - find related decisions
- `/sqlew show remaining tasks` - check active tasks

**Final Plan Phase:**
- `/sqlew record <decision>` - record key architectural decisions
- `/sqlew create task <description>` - create implementation tasks

**Quick Reference**: `.claude/skills/sqlew-decision-format/SKILL.md`
