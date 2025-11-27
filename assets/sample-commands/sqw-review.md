---
description: Validate architectural consistency - research context, then verify decisions and constraints
---

# Sqlew Review Workflow

Validation and consistency checking workflow - invokes researcher for context analysis, then architect for validation.

## Purpose

Verify architectural consistency, validate decision implementation, and ensure constraints are followed. A two-phase workflow combining historical analysis with expert validation.

## What It Does

### Phase 1: Research Context (Research Agent)
1. Analyzes relevant decisions, constraints, and tasks
2. **Uses constraint suggest** (v4.0) to find related constraints efficiently
3. Identifies patterns and relationships
4. Detects gaps or inconsistencies
5. Provides evidence-based findings

### Phase 2: Architectural Validation (Architect Agent)
1. Reviews research findings
2. Validates decision consistency
3. Checks constraint compliance
4. Recommends corrections or updates
5. Documents new decisions if needed

## Usage

### Interactive Mode
```bash
/sqlew-review
```
Prompts for what to review and guides through both phases.

### With Arguments
```bash
/sqlew-review authentication implementation
/sqlew-review security decisions
/sqlew-review performance constraints
/sqlew-review backend agent work
```

## Workflow

### Phase 1: Researcher Analyzes Context

**Researcher examines:**
- Related decisions and their versions (using `suggest.by_key`, `suggest.by_tags`)
- Relevant constraints (v4.0: using `suggest.by_context` with `target: "constraint"`)
- Constraint compliance with decisions
- Implementation tasks (completed, in-progress, blocked)
- Cross-references and relationships

**Example interaction:**

> **Researcher**: Analyzing authentication implementation...
>
> *Runs suggest({ action: "by_key", key: "authentication" })*
> *Runs suggest({ action: "by_context", target: "constraint", text: "authentication", tags: ["security"] })*
>
> **Decisions Found** (3):
> 1. "api-authentication-method" - JWT tokens (v2, last updated 3 days ago)
> 2. "jwt-token-expiration-policy" - 15min access, 7d refresh (v1)
> 3. "session-management-strategy" - stateless sessions (v1)
>
> **Constraints Found** (2) via suggest (v4.0):
> 1. "All API endpoints must verify JWT tokens" (security, priority 4, score: 85)
> 2. "Token refresh must use rotation strategy" (security, priority 3, score: 72)
>
> **Implementation Tasks** (8):
> - ✅ 6 completed: JWT service, middleware, token rotation, tests
> - ⏳ 1 in-progress: Add OAuth2 social login
> - ❌ 1 blocked: None
>
> **Potential Issues Detected**:
> 1. Decision "jwt-token-expiration-policy" doesn't mention refresh token rotation, but constraint requires it
> 2. OAuth2 task not linked to authentication decisions
> 3. No constraint for OAuth2 token-to-JWT mapping
>
> Handing off to architect for validation...

### Phase 2: Architect Validates

**Architect reviews findings:**

> **Architect**: Reviewing authentication consistency...
>
> **Issue 1: Decision-Constraint Mismatch**
> - Decision: "jwt-token-expiration-policy" (missing rotation details)
> - Constraint: "Token refresh must use rotation strategy" (requires rotation)
> - **Action**: Update decision to include rotation strategy, or document as separate decision
>
> **Issue 2: Missing Task Links**
> - Task: "Add OAuth2 social login" (in-progress)
> - Missing link to: "api-authentication-method" decision
> - **Action**: Link task to decision for traceability
>
> **Issue 3: Missing OAuth2 Constraint**
> - OAuth2 implementation starting
> - No constraint for token mapping strategy
> - **Action**: Create constraint "OAuth2 tokens must be converted to internal JWT format"
>
> **Recommendations**:
> 1. Version "jwt-token-expiration-policy" to v2 with rotation details
> 2. Link OAuth2 task to authentication decisions
> 3. Create OAuth2-to-JWT mapping constraint
> 4. Consider documenting OAuth2 provider selection as decision
>
> Should I implement these recommendations?

## When to Use

Use `/sqlew-review` when:
- Verifying implementation follows decisions
- Checking architectural consistency
- Auditing constraint compliance
- Validating completed work
- Investigating potential issues

**Don't use when:**
- Creating new decisions (use `/sqlew-decide` instead)
- Planning new work (use `/sqlew-plan` instead)
- Just querying history (use `/sqlew-research` instead)

## Review Types

### Decision Consistency Review
Verify decisions are:
- Complete and well-documented
- Consistent with each other
- Implemented by tasks
- Compliant with constraints
- Properly versioned

### Implementation Review
Verify tasks:
- Linked to decisions they implement
- Following constraint guidelines
- Properly prioritized
- Not blocked unnecessarily
- Completed work matches decisions

### Constraint Compliance Review
Verify constraints are:
- Clear and actionable
- Reflected in decisions
- Enforced by task acceptance criteria
- Not conflicting with each other
- Appropriate priority level

### Agent Workload Review
Verify agents have:
- Balanced workload
- Clear task assignments
- No prolonged blocked tasks
- Consistent work patterns
- Appropriate expertise matches

## Example: Complete Review Session

```bash
/sqlew-review security architecture
```

### Phase 1: Researcher

> **Researcher**: Analyzing security architecture...
>
> *Runs suggest({ action: "by_tags", tags: ["security"] })*
> *Runs suggest({ action: "by_context", target: "constraint", tags: ["security"], layer: "cross-cutting" })*
>
> **Security Decisions** (5):
> 1. "api-authentication-method" - JWT tokens
> 2. "api-authorization-approach" - role-based access control
> 3. "password-hashing-algorithm" - bcrypt with work factor 12
> 4. "https-enforcement-strategy" - HTTPS-only in production
> 5. "security-headers-policy" - strict CSP, HSTS, X-Frame-Options
>
> **Security Constraints Found** (4) via suggest (v4.0):
> 1. "All passwords must be hashed with bcrypt" (security, priority 4, score: 88)
> 2. "All API endpoints must verify authentication" (security, priority 4, score: 85)
> 3. "Production must enforce HTTPS" (security, priority 4, score: 80)
> 4. "All responses must include security headers" (security, priority 3, score: 72)
>
> **Security Tasks** (12 total):
> - ✅ 9 completed
> - ⏳ 2 in-progress: HTTPS redirect middleware, CSP configuration
> - ❌ 1 blocked: Security audit (waiting for external auditor)
>
> **Cross-Layer Analysis**:
> - Presentation: 3 tasks (HTTPS, CSP, HSTS)
> - Business: 4 tasks (auth, authz, password hashing)
> - Cross-cutting: 5 tasks (security middleware, logging)
>
> **Findings**:
> 1. ✅ All decisions have implementing tasks
> 2. ✅ All constraints aligned with decisions
> 3. ⚠️ CSP configuration task in-progress for 5 days (possible stale)
> 4. ⚠️ No decision documented for session timeout policy
> 5. ⚠️ HTTPS redirect task not linked to "https-enforcement-strategy" decision
>
> Handing to architect for validation...

### Phase 2: Architect

> **Architect**: Security architecture validation...
>
> **Overall Assessment**: Strong security foundation with minor gaps
>
> **Issue 1: Stale CSP Configuration Task**
> - Task in-progress for 5 days without updates
> - **Action**: Check if task is blocked, move to waiting_review, or reassign
>
> **Issue 2: Missing Session Timeout Decision**
> - Multiple authentication decisions but no session timeout policy
> - Constraint: "All API endpoints must verify authentication" implies timeout needed
> - **Action**: Document "session-timeout-policy" decision
>
> **Issue 3: Missing Task Link**
> - HTTPS redirect task not linked to HTTPS enforcement decision
> - **Action**: Link task to decision for traceability
>
> **Issue 4: Password Reset Security Not Addressed**
> - Password hashing documented but not reset/recovery security
> - **Action**: Consider documenting "password-reset-security" decision
>
> **Constraint Compliance**: ✅ All active
> - Password hashing: ✅ Implemented (bcrypt work factor 12)
> - Authentication verification: ✅ Middleware in place
> - HTTPS enforcement: ⏳ In progress (nearly complete)
> - Security headers: ⏳ In progress (CSP configuration)
>
> **Recommendations**:
> 1. Investigate CSP configuration task (5 days stale)
> 2. Document session timeout policy decision
> 3. Link HTTPS redirect task to enforcement decision
> 4. Consider password reset security decision
> 5. Create constraint for session timeout after decision documented
>
> **Priority Actions** (next 24 hours):
> 1. Check CSP task status (possibly blocked?)
> 2. Document session timeout decision (closes security gap)
>
> Should I implement these recommendations?

## Integration with Other Workflows

This workflow combines:
- `/sqlew-research` - Context analysis (researcher phase)
- `/sqlew-decide` - Decision updates (architect phase)

Use with:
- **Before review**: Complete implementation work
- **During review**: Researcher → architect validation
- **After review**: Implement recommendations, create corrective tasks

## Token Efficiency

This workflow is efficient for comprehensive validation:

**Manual validation**:
- Query decisions: 3k tokens
- Query constraints: 2k tokens
- Query tasks: 4k tokens
- Cross-reference: 2k tokens
- Validate: 3k tokens
- Total: 14k tokens

**Combined /sqlew-review (v4.0)**:
- Research phase: 5k tokens (using suggest for constraints)
- Architect phase: 4k tokens (validation)
- **Total**: 9k tokens (35% savings)
- Constraint suggest reduces query overhead significantly

**Estimated Token Usage**: 10,000-20,000 tokens per review session

**AI Time Estimate**:
- Research phase: 10-20 minutes
- Architect phase: 15-25 minutes
- **Total**: 25-45 minutes

## Review Checklist

The workflow automatically checks:

### Decision Quality
- [ ] Key decisions documented
- [ ] Rationale provided
- [ ] Alternatives considered
- [ ] Tradeoffs acknowledged
- [ ] Properly tagged
- [ ] Appropriate layer assigned

### Decision Consistency
- [ ] No conflicting decisions
- [ ] Versions tracked properly
- [ ] Related decisions linked
- [ ] Decision context complete

### Implementation Coverage
- [ ] Decisions have implementing tasks
- [ ] Tasks linked to decisions
- [ ] Acceptance criteria match decisions
- [ ] No orphaned implementations

### Constraint Compliance
- [ ] Constraints documented
- [ ] Constraints aligned with decisions
- [ ] Tasks follow constraints
- [ ] Priorities appropriate

### Task Health
- [ ] No stale in-progress tasks
- [ ] Blocked tasks have valid reasons
- [ ] Dependencies logical
- [ ] Agent assignments appropriate

## Tips

1. **Be specific about review scope** - "authentication" vs "entire security architecture"
2. **Review regularly** - catch issues early (weekly for active projects)
3. **Act on findings** - researcher + architect provide actionable recommendations
4. **Document corrections** - update decisions when inconsistencies found
5. **Link everything** - tasks ↔ decisions ↔ constraints for traceability

## Review Triggers

Consider running `/sqlew-review` when:
- Completing a major feature
- Before starting related work
- After significant decision changes
- Investigating quality issues
- Onboarding new team members
- Preparing for code review
- Quarterly architecture audits

## Error Recovery

If research finds too many issues:
- Break review into smaller scopes
- Prioritize critical issues first
- Create corrective tasks via scrum master
- Schedule follow-up review

If architect validation is unclear:
- Request more specific research
- Break complex issues into sub-reviews
- Consult original decision authors
- Document uncertainty as new decision

You get comprehensive validation combining data-driven research with expert architectural analysis.