# Tool Selection Guide

**Quick reference for choosing the right tool**

## Tool Comparison Table

| Tool | Use For | Don't Use For | Key Feature |
|------|---------|---------------|-------------|
| **decision** | Recording choices made | Future work, requirements | Version history tracking |
| **constraint** | Requirements & rules | Decisions, tasks | Category-based organization |
| **task** | Work tracking (TODO) | Decisions, history | Auto-stale detection |
| **file** | File change tracking, WAL flush | Code search, content | Layer-based organization |
| **suggest** | Duplicate detection, similarity search | Data storage | Three-tier scoring |
| **help** | Tool/action documentation | - | Token-efficient queries |
| **example** | Code examples | - | Topic-based search |
| **use_case** | Workflow examples | - | Category filtering |

## Decision vs Constraint vs Task

| Concept | Definition | Example |
|---------|------------|---------|
| **Decision** | A choice that WAS made | "We chose JWT authentication" |
| **Constraint** | A requirement that MUST be followed | "Response time must be <100ms" |
| **Task** | Work that NEEDS to be done | "Implement JWT authentication" |

## Decision vs Task: WHY vs WHAT

**Critical**: `decision` = WHY (reasoning), `task` = WHAT (work status)

| Question | Tool |
|----------|------|
| WHY did we choose this? | **decision** |
| WHAT needs to be done? | **task** |
| WHY was this bug introduced? | **decision** |
| WHAT is the completion status? | **task** |

## Common Scenarios

**Breaking API Change:**
1. `decision` - Record WHY change was necessary with reasoning
2. `constraint` - Add requirement for version prefixes going forward
3. `task` - Create migration work item

**Performance Issue:**
1. `decision` - Record analysis and WHY this solution
2. `constraint` - Add performance requirement
3. `task` - Create optimization work item

**Security Vulnerability:**
1. `decision` - Record WHY this mitigation approach
2. `constraint` - Add security requirement
3. `task` - Create fix work item

## Search & Duplicate Detection (v4.0.0)

**Decision Search Actions:**

| Action | Use For |
|--------|---------|
| **list** | Simple status/layer/tag filters |
| **search_tags** | Tag-focused with AND/OR logic |
| **search_layer** | Layer-focused queries |
| **search_advanced** | Complex multi-filter, pagination, full-text |
| **versions** | Version history of specific decision |

**Duplicate Detection (Three-Tier System):**

Decision Intelligence System automatically detects duplicates during creation:
- **Tier 1 - Gentle nudge (35-44)**: Non-blocking warning with suggestions
- **Tier 2 - Hard block (45-59)**: Blocks creation, requires resolution
- **Tier 3 - Auto-update (60+)**: Transparent update of existing decision

Use `suggest` tool or search actions to find existing decisions before creating new ones.

---

## Related Documentation

- [TOOL_REFERENCE.md](TOOL_REFERENCE.md) - Parameter reference
- [WORKFLOWS.md](WORKFLOWS.md) - Multi-step workflows
- [BEST_PRACTICES.md](BEST_PRACTICES.md) - Common errors
- [SHARED_CONCEPTS.md](SHARED_CONCEPTS.md) - Layers, enums, concepts
- [ARCHITECTURE.md](ARCHITECTURE.md) - System design and decision intelligence
