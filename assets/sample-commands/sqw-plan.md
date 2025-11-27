---
description: Comprehensive planning - architect considers decisions, scrum master breaks down into tasks
---

# Sqlew Plan Workflow

Comprehensive planning workflow - invokes architect for architectural consideration, then scrum master for task breakdown.

## Purpose

Transform ideas or requirements into documented decisions and actionable task plans. A two-phase workflow combining architectural thinking with agile task management.

## What It Does

### Phase 1: Architectural Consideration (Architect Agent)
1. Checks for related decisions (using `suggest`)
2. Discusses architectural implications
3. Documents key decisions if needed
4. **Reviews auto-suggested constraints** (v4.0) - decision.set returns related constraints
5. Establishes constraints if needed (with duplicate checking via `suggest`)

### Phase 2: Task Breakdown (Scrum Master Agent)
1. Breaks work into manageable tasks
2. Assigns appropriate layers and priorities
3. Establishes task dependencies
4. Links tasks to decisions/constraints
5. Assigns to specialized agents if needed

## Usage

### Interactive Mode
```bash
/sqlew-plan
```
Prompts for feature/requirement details and guides through both phases.

### With Arguments
```bash
/sqlew-plan implement user authentication
/sqlew-plan add caching layer
/sqlew-plan migrate to microservices
```

## Workflow

### Phase 1: Architect Considers Architecture

**Architect checks:**
- Are there existing decisions about this area? (using `suggest.by_key`, `suggest.by_tags`)
- What architectural patterns apply?
- What constraints already exist? (v4.0: using `suggest.by_context` with `target: "constraint"`)
- What constraints should govern this work?
- What decisions need to be documented?
- Are there related constraints? (v4.0: auto-suggested when recording decisions)

**Example interaction:**

> **Architect**: Let me check existing authentication decisions...
>
> Found 2 related decisions:
> - "api-authentication-method" - JWT tokens
> - "session-management-strategy" - stateless sessions
>
> **Related Constraints Found** (v4.0):
> - "All API endpoints must verify JWT tokens" (security, priority 4)
> - "Token refresh must use rotation strategy" (security, priority 3)
>
> Your requirement is to "add OAuth2 social login support"
>
> This extends existing JWT authentication. I recommend documenting:
> 1. Which OAuth2 providers to support
> 2. How OAuth2 tokens map to JWT tokens
> 3. User account linking strategy
>
> These new decisions should comply with existing constraints. Should I document these decisions?

**You discuss and architect documents decisions. The system auto-suggests related constraints for review.**

### Phase 2: Scrum Master Creates Tasks

**Scrum Master breaks down work:**

> **Scrum Master**: Based on the OAuth2 social login decisions, I'll create tasks:
>
> **Planning Tasks** (planning layer, no files needed):
> 1. Research OAuth2 provider SDKs (priority 3)
> 2. Design account linking flow (priority 3)
>
> **Implementation Tasks** (requires files):
> 3. Implement Google OAuth2 integration (business layer, priority 3)
>    - Files: src/auth/oauth/google.ts, src/auth/oauth/types.ts
>    - Depends on: task #1
>
> 4. Implement GitHub OAuth2 integration (business layer, priority 3)
>    - Files: src/auth/oauth/github.ts
>    - Depends on: task #1
>
> 5. Add account linking service (business layer, priority 3)
>    - Files: src/auth/linking-service.ts, src/db/models/linked-accounts.ts
>    - Depends on: task #2
>
> 6. Create OAuth2 middleware (cross-cutting layer, priority 3)
>    - Files: src/middleware/oauth2.ts
>    - Depends on: tasks #3, #4, #5
>
> 7. Write integration tests (business layer, priority 2)
>    - Files: tests/integration/oauth2.test.ts
>    - Depends on: task #6
>
> 8. Update API documentation (documentation layer, priority 2)
>    - Files: docs/api/authentication.md
>    - Depends on: task #7
>
> Tasks will be linked to the OAuth2 decisions documented.
>
> Dependencies established:
> - 1 → 3, 4
> - 2 → 5
> - 3, 4, 5 → 6
> - 6 → 7
> - 7 → 8
>
> Shall I create these tasks?

## When to Use

Use `/sqlew-plan` when:
- Starting a new feature or capability
- Architectural decisions are unclear or need documentation
- You need a complete plan from concept to implementation
- You want both strategic (decisions) and tactical (tasks) planning

**Don't use when:**
- Only documenting decisions (use `/sqlew-decide` instead)
- Only creating tasks (use `/sqlew-scrum` instead)
- Researching existing plans (use `/sqlew-research` instead)

## Two-Phase Benefits

### Why Not Just Create Tasks?

Without architectural consideration:
- Tasks may conflict with existing decisions
- Important constraints may be overlooked
- Existing constraints may be violated unknowingly
- Architectural implications not documented
- Future developers lack context

With architect phase:
- Decisions documented before implementation
- **Related constraints auto-discovered** (v4.0) - ensures compliance
- New constraints established with duplicate checking
- Tasks aligned with architecture
- Context preserved for future work

### Why Not Just Document Decisions?

Without task breakdown:
- No clear implementation path
- No dependency management
- No workload coordination
- No progress tracking

With scrum master phase:
- Clear, actionable tasks
- Proper dependency chains
- Agent assignments
- Progress visibility

## Example: Complete Planning Session

```bash
/sqlew-plan add Redis caching layer
```

### Phase 1: Architect

> **Architect**: Let me check for caching decisions...
>
> *Runs suggest({ action: "by_key", key: "caching" }) - no results*
> *Runs suggest({ action: "by_context", target: "constraint", text: "caching", tags: ["performance"] })*
>
> No existing caching decisions found. Checking performance constraints...
>
> **Found Constraint** (via suggest):
> - "API response time must be <200ms" (performance, priority 4, score: 72)
>
> Your requirement to "add Redis caching layer" has architectural implications:
>
> **Decisions to document:**
> 1. Cache infrastructure choice (Redis vs Memcached vs in-memory)
> 2. Cache invalidation strategy
> 3. What to cache (endpoints, database queries, computed results)
> 4. Cache TTL policies
>
> **Constraints to establish** (will check for duplicates first):
> 1. All cache keys must use namespace prefixes
> 2. Cache failures must not break application
> 3. Cache metrics must be monitored
>
> Let's document these decisions...

*Architect documents 4 decisions (each returns related_constraints for review)*
*Architect checks for duplicate constraints using suggest({ target: "constraint" }) before creating*
*Creates 3 new constraints (no duplicates found)*

> **Architect**: Decisions and constraints documented. Handing off to scrum master for task breakdown...

### Phase 2: Scrum Master

> **Scrum Master**: Based on the Redis caching decisions, I'll create tasks:
>
> **Infrastructure Tasks:**
> 1. Set up Redis infrastructure (infrastructure layer, priority 4, critical)
> 2. Configure Redis client library (infrastructure layer, priority 4)
>
> **Implementation Tasks:**
> 3. Implement cache service abstraction (cross-cutting layer, priority 3)
> 4. Add caching to API endpoints (presentation layer, priority 3)
> 5. Add query result caching (data layer, priority 3)
> 6. Implement cache invalidation logic (business layer, priority 3)
>
> **Monitoring Tasks:**
> 7. Add cache hit/miss metrics (cross-cutting layer, priority 2)
> 8. Set up cache monitoring dashboard (infrastructure layer, priority 2)
>
> **Testing Tasks:**
> 9. Write cache service tests (cross-cutting layer, priority 3)
> 10. Write cache invalidation tests (business layer, priority 3)
>
> **Documentation Tasks:**
> 11. Document caching strategy (documentation layer, priority 2)
>
> Dependencies: 1→2→3→(4,5,6)→7,8 and 3→9, 6→10, (9,10)→11
>
> All tasks linked to Redis caching decisions and constraints.
>
> Ready to create 11 tasks?

## Integration with Other Workflows

This workflow combines:
- `/sqlew-decide` - Decision documentation (architect phase)
- `/sqlew-scrum` - Task management (scrum master phase)

Use with:
- **Before**: `/sqlew-research` to understand existing context
- **During**: Architect and scrum master handle the planning
- **After**: Implement tasks, use `/sqlew-review` to validate

## Token Efficiency

This workflow is more token-efficient than separate operations:

**Separate workflows**:
- Research: 2k tokens
- Decide: 5k tokens
- Constraint search: 2k tokens
- Create tasks: 3k tokens
- Total: 12k tokens

**Combined /sqlew-plan (v4.0)**:
- Single context: 7k tokens (40% savings)
- Architect→Scrum handoff preserves context
- No redundant searches
- Auto-suggested constraints reduce queries
- Constraint duplicate checking integrated

**Estimated Token Usage**: 7,000-15,000 tokens per planning session

**AI Time Estimate**:
- Architect phase: 10-20 minutes
- Scrum master phase: 15-30 minutes
- **Total**: 25-50 minutes

## Tips

1. **Provide clear requirements** - the more specific, the better the plan
2. **Trust the architect** - let them identify architectural implications
3. **Review suggested constraints** (v4.0) - architect shows related constraints automatically
4. **Review task breakdown** - verify priorities and dependencies make sense
5. **Adjust before creation** - easier to modify plan before tasks created
6. **Link everything** - architect and scrum master will link decisions→constraints→tasks

## Comparison with Other Workflows

### /sqlew-decide
- **Focus**: Decision documentation only
- **Use when**: You know what decision to document
- **Phases**: 1 (architect)

### /sqlew-scrum
- **Focus**: Task management only
- **Use when**: Decisions already documented
- **Phases**: 1 (scrum master)

### /sqlew-plan
- **Focus**: Complete planning (decisions + tasks)
- **Use when**: Starting new work, unclear architecture
- **Phases**: 2 (architect → scrum master)

### /sqlew-research
- **Focus**: Historical context analysis
- **Use when**: Understanding existing state
- **Phases**: 1 (researcher)

### /sqlew-review
- **Focus**: Validation and consistency
- **Use when**: Verifying completed work
- **Phases**: 2 (researcher → architect)

## Error Recovery

If architectural decisions are complex:
- Architect will ask clarifying questions
- Take time to discuss alternatives
- Break into multiple planning sessions if needed

If task breakdown is unclear:
- Scrum master will ask about dependencies
- Verify agent assignments make sense
- Adjust priorities based on project context

You get end-to-end planning from architectural thinking to actionable tasks in a single workflow.