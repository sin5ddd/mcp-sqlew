# Tool Selection Guide

**Quick reference for choosing the right tool**

## Tool Comparison Table

| Tool | Use For | Don't Use For | Key Feature |
|------|---------|---------------|-------------|
| **decision** | Recording choices made | Future work, requirements | Version history tracking |
| **suggest** (v3.9.0) | Finding similar decisions | Creating decisions | Three-tier duplicate detection |
| **constraint** | Requirements & rules | Decisions, tasks | Category-based organization |
| **task** | Work tracking (TODO) | Decisions, history | Auto-stale detection |
| **file** | File change tracking | Code search, content | Layer-based organization |
| **stats** | Metrics & cleanup | Data storage | Aggregated views |
| ~~**message**~~ | ~~Agent communication~~ | ~~Permanent records~~ | ⚠️ DEPRECATED v3.6.5 |

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
4. `message` - Alert other agents

**Performance Issue:**
1. `decision` - Record analysis and WHY this solution
2. `constraint` - Add performance requirement
3. `task` - Create optimization work item

**Security Vulnerability:**
1. `decision` - Record WHY this mitigation approach
2. `constraint` - Add security requirement
3. `task` - Create fix work item
4. `message` - Alert all agents

## Search Action Selection

| Action | Use For |
|--------|---------|
| **list** | Simple status/layer/tag filters |
| **search_tags** | Tag-focused with AND/OR logic |
| **search_layer** | Layer-focused queries |
| **search_advanced** | Complex multi-filter, pagination, full-text |
| **versions** | Version history of specific decision |

## Suggest Tool Actions (v3.9.0)

| Action | Use For |
|--------|---------|
| **by_key** | Pattern-based key search (e.g., `api/*/latency`) |
| **by_tags** | Tag similarity scoring (Jaccard index) |
| **by_context** | Multi-factor search (key + tags + layer) |
| **check_duplicate** | Pre-creation validation to prevent duplicates |

**When to use suggest vs search:**
- Use **suggest** to find *similar* decisions before creating new ones
- Use **search** actions to query *existing* decisions for information

---

## Related Documentation

- [TOOL_REFERENCE.md](TOOL_REFERENCE.md) - Parameter reference
- [WORKFLOWS.md](WORKFLOWS.md) - Multi-step workflows
- [BEST_PRACTICES.md](BEST_PRACTICES.md) - Common errors
- [SHARED_CONCEPTS.md](SHARED_CONCEPTS.md) - Layers, enums, concepts
- [DECISION_INTELLIGENCE.md](DECISION_INTELLIGENCE.md) - Three-tier duplicate detection (v3.9.0)
