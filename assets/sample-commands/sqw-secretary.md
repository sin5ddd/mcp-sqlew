---
description: Quick decision capture - fast-track documentation with duplicate checking and context
---

# Sqlew Decide Workflow

Quick decision documentation workflow - invokes the architect agent for streamlined decision capture.

## Purpose

Fast-track architectural decision documentation when you know what needs to be decided. Bypasses manual tool invocation and delegates to the specialized architect agent.

## What It Does

1. Checks for duplicate/related decisions
2. Guides you through decision documentation
3. Records decision with full context (rationale, alternatives, tradeoffs)
4. **Automatically suggests related constraints** (v4.0) - review and link relevant ones
5. Links to related decisions if needed
6. Creates constraints if decision implies architectural rules (with duplicate checking)

## Usage

### Interactive Mode
```bash
/sqlew-decide
```
Prompts for decision details and invokes architect agent.

### With Arguments
```bash
/sqlew-decide API authentication method
/sqlew-decide database schema approach
/sqlew-decide caching strategy
```

## Workflow

When you run this command, the architect agent will:

1. **Check for duplicates** using the decision topic/key
2. **Show related decisions** if any exist
3. **Ask clarifying questions** about:
   - The decision being made
   - Alternatives considered
   - Rationale for the choice
   - Tradeoffs involved
4. **Document the decision** with comprehensive context
5. **Review related constraints** (v4.0) - automatically suggested in response
6. **Link to related decisions** if applicable
7. **Suggest constraints** if the decision implies architectural rules
   - Uses `suggest({ target: "constraint" })` to check for duplicates first (v4.0)

## Example: Quick Authentication Decision

```bash
/sqlew-decide API authentication method
```

**Architect responds:**

> Let me check for existing authentication decisions...
>
> Found 1 related decision:
> - "session-management-strategy" - stateless sessions
>
> Are you documenting a new authentication decision or refining this one?

**You respond:**

> New decision about JWT token structure

**Architect responds:**

> I'll document this decision. Please provide:
>
> 1. What JWT structure did you choose?
> 2. What alternatives did you consider?
> 3. Why this approach?
> 4. What are the tradeoffs?

**You provide details, architect documents:**

> Decision "jwt-token-structure" recorded in business layer:
>
> **Value**: JWT tokens contain { user_id, role, exp, iat } claims only
>
> **Rationale**: Minimize token size for performance, store extended profile data server-side
>
> **Alternatives Considered**:
> - Full user profile in token (too large, 2KB+ tokens)
> - Minimal claims only user_id (requires extra DB lookup for role checks)
>
> **Tradeoffs**:
> - ✅ Small token size (~300 bytes)
> - ✅ No DB lookup for role-based authorization
> - ❌ Profile changes require new token issuance
> - ❌ Cannot store session-specific data in token
>
> Linked to existing "api-authentication-method" decision.
>
> **Related Constraints Found** (v4.0 auto-suggestion):
> - "All API endpoints must verify JWT tokens" (security, score: 78)
> - "Token refresh must use rotation strategy" (security, score: 65)
>
> Should I link these constraints? Should I create a new constraint requiring all tokens follow this structure?

## When to Use

Use `/sqlew-decide` when:
- You have a clear decision to document
- You want guided prompts for comprehensive documentation
- You need duplicate detection before recording
- You want the architect's expertise in decision structuring

**Don't use when:**
- Researching existing decisions (use `/sqlew-research` instead)
- Planning implementation tasks (use `/sqlew-plan` instead)
- Reviewing decisions for consistency (use `/sqlew-review` instead)

## Comparison with Direct Tool Usage

### Using /sqlew-decide (Recommended)
```bash
/sqlew-decide JWT token expiration policy
```
Architect agent handles:
- Duplicate checking
- Guided questions
- Proper formatting
- Relationship linking
- Constraint suggestion

### Direct Tool Usage (Advanced)
```typescript
suggest({ action: "check_duplicate", key: "jwt-expiration" })
decision({
  action: "set",
  key: "jwt-token-expiration-policy",
  value: "...",
  rationale: "...",
  // ... manual context entry
})
```
Requires:
- Manual duplicate checking
- Self-guided documentation
- Manual relationship management

## Benefits

1. **Guided Process** - Architect prompts for all necessary context
2. **Duplicate Prevention** - Automatic similarity checking (decisions and constraints)
3. **Consistency** - Architect ensures proper formatting and completeness
4. **Relationships** - Automatic linking to related decisions
5. **Constraint Discovery** (v4.0) - Auto-suggests related constraints for review
6. **Speed** - Faster than manual tool invocation
7. **Quality** - Architect's expertise in decision documentation

## Integration with Other Workflows

This command works well with:

- **Before**: Use `/sqlew-research authentication` to understand existing decisions
- **After**: Use `/sqlew-plan` to create implementation tasks
- **Later**: Use `/sqlew-review` to verify decision consistency

## Token Efficiency

This workflow is token-efficient because:
- Architect uses `suggest` to check duplicates (saves 2-5k tokens vs listing all decisions)
- Auto-suggested `related_constraints` in response (v4.0) - no separate query needed
- Constraint duplicate checking before creation (v4.0) - prevents redundant constraints
- Guided questions prevent missing context (saves revision tokens)
- Automatic linking prevents orphaned decisions (saves later discovery tokens)

**Estimated Token Usage**: 3,000-8,000 tokens per decision documentation session

**AI Time Estimate**: 5-10 minutes per decision

## Tips

1. **Be specific with the decision topic** - helps duplicate detection
2. **Provide context upfront** - "We're using JWT and need to decide token expiration"
3. **Think through alternatives first** - speeds up the documentation process
4. **Be honest about tradeoffs** - helps future decision-making
5. **Tag appropriately** - enables discovery later

## Error Recovery

If the architect finds duplicates:
- Review the existing decision
- Decide if you're updating, versioning, or creating related decision
- Architect will guide you through the appropriate action

If related constraints are suggested (v4.0):
- Review each suggested constraint for relevance
- Link relevant constraints to the decision
- If creating new constraint, architect will check for duplicates first

If the decision is unclear:
- Architect will ask clarifying questions
- Take time to think through alternatives and rationale
- Better to document thoroughly than quickly

You get expert-guided decision documentation without manually managing the tools.
