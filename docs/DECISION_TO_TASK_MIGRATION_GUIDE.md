# Decision to Task Migration Guide for LLMs

## Overview

This guide helps AI agents migrate decisions from the `decision` tool to the `task` tool when appropriate. The task system (v3.0.0) provides 70% token efficiency for actionable items compared to decisions.

**Key Insight**: Not all decisions should become tasks. Only actionable, implementation-oriented decisions benefit from migration.

## When to Convert: Decision vs Task

### ✅ Convert to Task (Actionable Items)

Decisions with these characteristics should become tasks:

1. **Implementation Work**
   - "Implement X feature"
   - "Refactor Y module"
   - "Fix Z bug"
   - Keywords: implement, build, create, refactor, fix, add, develop

2. **Work-in-Progress (WIP)**
   - Decisions prefixed with "WIP:"
   - Decisions with "TODO:" or "IN PROGRESS:"
   - Example: `wip_add_logging|WIP: Adding structured logging to all services`

3. **Phase/Milestone Work**
   - Decisions describing implementation phases
   - Example: `phase2_sample_reference_complete|Phase 2.1 Sample Reference System complete`
   - **Note**: Completed phases can become `done` or `archived` tasks for tracking

4. **Test Tasks**
   - Decisions created for testing purposes
   - Example: `test_task_decision|Use Jest for testing`

### ❌ Keep as Decision (Knowledge/Documentation)

Decisions with these characteristics should remain decisions:

1. **Documentation/Explanation**
   - Explains how a system works
   - Describes patterns or best practices
   - Keywords: pattern, example, guide, explanation, documentation
   - Example: `motifs_v2_pattern_batch_generation|Batch generation pattern: Generate multiple...`

2. **Architectural Decisions**
   - Records why a choice was made
   - Example: `api/synthesis/oscillator-type-moved|Moved oscillator_type from base SynthConfig...`

3. **Status Reports**
   - Records what was implemented (past tense)
   - Example: `phase3_actual_implementation_status|Phase 3 ACTUALLY IMPLEMENTED...`

4. **Parameter/Configuration Documentation**
   - Explains how parameters work
   - Example: `motifs_v2_fabric_emotion_motif_length|Emotion parameter controls motif length...`

5. **Troubleshooting Guides**
   - Diagnostic information
   - Example: `motifs_v2_troubleshooting_no_notes|Troubleshooting: No notes generated...`

6. **Deprecated/Migrated Documentation**
   - Records migration history
   - Example: `docs_hierarchical_fabric_system_md|DEPRECATED: Documentation file...`

## Migration Process

### Step 1: Query Decisions

Use the `decision` MCP tool to list active decisions:

```javascript
{
  action: "list",
  status: "active",
  limit: 100
}
```

### Step 2: Analyze Each Decision

For each decision, ask these questions:

1. **Is it actionable?** (Does it describe work to be done?)
2. **Is it complete?** (If complete, should it be archived or kept as knowledge?)
3. **Is it a duplicate?** (Check if a task already exists)
4. **What's the status?** (todo, in_progress, done, blocked?)

### Step 3: Extract Task Metadata

From the decision, extract:

- **Title**: Short, actionable (50 chars max)
- **Description**: Full decision value (optional, can be long)
- **Status**: Map decision status to task status
  - Decision: `active` + WIP → Task: `in_progress`
  - Decision: `active` + not WIP → Task: `todo`
  - Decision: `active` + completed → Task: `done`
  - Decision: `deprecated` → Task: `archived`
- **Priority**: Infer from urgency/importance (1=low, 2=medium, 3=high, 4=critical)
- **Layer**: Preserve from decision (presentation, business, data, infrastructure, cross-cutting)
- **Tags**: Preserve from decision
- **Assigned Agent**: Map from decision's `decided_by_agent`

### Step 4: Create Task

Use the `task` MCP tool:

```javascript
{
  action: "create",
  title: "Implement sample reference generator",
  description: "Implemented sample reference generator with instrument-specific note ranges and Fabric-driven density. Generator produces SampleReference metadata for Sampler and Granular synths.",
  status: "done", // Completed phase
  priority: 3, // High priority (phase work)
  assigned_agent: "system",
  layer: "data",
  tags: ["phase2", "sample-reference", "fabric"]
}
```

### Step 5: Link to Original Decision

After creating the task, link it to the original decision:

```javascript
{
  action: "link",
  task_id: 123,
  link_type: "decision",
  target_id: "phase2_sample_reference_generator", // Decision key
  link_relation: "migrated_from"
}
```

### Step 6: Hard-Delete Unnecessary Decisions

**IMPORTANT:** For pure actionable items (WIP, TODO, implementation tasks), use **hard-delete** to permanently remove them and reduce database bloat.

**Recommended: Hard-Delete** (For pure WIP/task items with no knowledge value)
```javascript
{
  action: "hard_delete",
  key: "wip_add_logging"
}
```

**Rationale:**
- Prevents deprecated decision bloat
- Tasks are now the source of truth
- Task links maintain traceability
- 70 records removed per decision (decision + tags + scopes + version history)

**Alternative: Keep and Update** (ONLY for decisions with knowledge value)
```javascript
{
  action: "set",
  key: "phase2_sample_reference_generator",
  value: "Knowledge: Sample reference generator uses instrument-specific ranges (Piano: C3-C6, Bass: E1-E3, ...) and Fabric-driven density. Implementation tracked in task #123.",
  status: "active"
}
```

**When to use each:**
- **Hard-delete:** WIP items, test tasks, pure implementation work (95% of migrations)
- **Keep & Update:** Decisions that also document "why" or have architectural insight (5% of migrations)

## Example Migrations

### Example 1: WIP Decision → In-Progress Task

**Before (Decision):**
```
key: wip_add_logging
value: WIP: Adding structured logging to all services
layer: infrastructure
agent: test-agent
```

**After (Task):**
```javascript
{
  action: "create",
  title: "Add structured logging to all services",
  description: "Implementing structured logging system across all microservices",
  status: "in_progress",
  priority: 2,
  assigned_agent: "test-agent",
  layer: "infrastructure",
  tags: ["logging", "infrastructure"]
}
// Then link and hard-delete decision
{
  action: "link",
  task_id: 8,
  link_type: "decision",
  target_id: "wip_add_logging",
  link_relation: "migrated_from"
}
{
  action: "hard_delete",
  key: "wip_add_logging"
}
```

### Example 2: Completed Phase → Done Task

**Before (Decision):**
```
key: phase2_sample_reference_complete
value: Phase 2.1 Sample Reference System complete: SampleReference struct, generator with instrument-specific ranges, Fabric-driven density, 13 passing tests (8 unit + 5 integration)
layer: data
```

**After (Task):**
```javascript
{
  action: "create",
  title: "Phase 2.1: Sample Reference System",
  description: "SampleReference struct, generator with instrument-specific ranges, Fabric-driven density, 13 passing tests (8 unit + 5 integration)",
  acceptance_criteria: "- SampleReference struct implemented\n- Instrument-specific ranges\n- Fabric-driven density\n- 13 passing tests",
  status: "done",
  priority: 3,
  assigned_agent: "system",
  layer: "data",
  tags: ["phase2", "sample-reference", "testing"]
}
```

### Example 3: Knowledge Decision → Keep as Decision

**Keep This (Don't Convert):**
```
key: motifs_v2_fabric_emotion_motif_length
value: Emotion parameter controls motif length in MotifsV2Pipeline. Range: -1.0 to 3.0...
layer: business
```

**Reason**: This is documentation explaining how a parameter works. It's knowledge, not an action item.

## Batch Migration Strategy

For large-scale migration, use batch operations:

```javascript
// Step 1: Query all WIP decisions
{
  action: "search_advanced",
  search_text: "WIP:",
  status: ["active"],
  limit: 100
}

// Step 2: Create tasks in batch
{
  action: "batch_create",
  tasks: [
    {
      title: "Task 1",
      status: "in_progress",
      priority: 2,
      // ...
    },
    {
      title: "Task 2",
      status: "todo",
      priority: 1,
      // ...
    }
  ],
  atomic: false // Best-effort for AI agents
}

// Step 3: Link tasks to decisions
for (let i = 0; i < createdTasks.length; i++) {
  {
    action: "link",
    task_id: createdTasks[i].id,
    link_type: "decision",
    target_id: wip_decisions[i].key,
    link_relation: "migrated_from"
  }
}

// Step 4: Hard-delete migrated decisions (no batch API, do individually)
for (const decision of wip_decisions) {
  {
    action: "hard_delete",
    key: decision.key
  }
}
```

## Token Efficiency Analysis

**Decision Storage:**
- Key: ~30 bytes
- Value: ~300 bytes (avg)
- Metadata: ~50 bytes
- **Total: ~380 bytes per decision**

**Task Storage (Metadata-Only Query):**
- Title: ~50 bytes
- Status/Priority: ~10 bytes
- Layer/Tags: ~30 bytes
- **Total: ~90 bytes per task (76% reduction)**

**For 200 decisions → tasks migration:**
- Before: 200 × 380 = 76,000 bytes
- After: 200 × 90 = 18,000 bytes
- **Savings: 58,000 bytes (76% reduction) for list queries**

## Common Pitfalls

### ❌ Pitfall 1: Converting All Decisions

**Wrong**: Migrate all 202 decisions to tasks

**Right**: Migrate only ~10-20 actionable decisions, keep rest as knowledge

### ❌ Pitfall 2: Losing Context

**Wrong**: Hard-delete decision WITHOUT linking first

**Right**: Link task to decision FIRST, then hard-delete decision

**Correct Order:**
1. Create task
2. Link task to decision (`task.link` action)
3. Hard-delete decision (`decision.hard_delete` action)

This maintains traceability through task links while eliminating bloat.

### ❌ Pitfall 3: Wrong Status Mapping

**Wrong**: All decisions → `todo` tasks

**Right**: Map correctly:
- WIP → `in_progress`
- Completed → `done` or `archived`
- Planned → `todo`
- Blocked → `blocked`

### ❌ Pitfall 4: Ignoring Layers/Tags

**Wrong**: Create tasks without layer/tags

**Right**: Preserve metadata for filtering and organization

## Verification Checklist

After migration, verify:

- [ ] All actionable decisions converted to tasks
- [ ] Knowledge decisions remain as decisions
- [ ] Tasks linked to original decisions (BEFORE deletion)
- [ ] Original decisions hard-deleted (reduces bloat by ~70 records per decision)
- [ ] Status mapping correct (WIP → in_progress, etc.)
- [ ] Priority assigned based on urgency
- [ ] Layer and tags preserved
- [ ] No duplicate tasks created
- [ ] Database integrity verified (no orphaned records)

## Automated Migration Script (Pseudo-code)

```javascript
async function migrateDecisionsToTasks(db) {
  // 1. Get all active decisions
  const decisions = await mcp.decision({
    action: "list",
    status: "active",
    limit: 500
  });

  const tasksToCreate = [];
  const decisionsToUpdate = [];

  for (const decision of decisions) {
    // 2. Determine if actionable
    const isActionable =
      decision.key.startsWith("wip_") ||
      decision.value.match(/^WIP:/i) ||
      decision.value.match(/^TODO:/i) ||
      decision.value.match(/^(Implement|Build|Create|Refactor|Fix|Add)/i);

    if (!isActionable) continue; // Keep as decision

    // 3. Extract metadata
    const task = {
      title: extractTitle(decision),
      description: decision.value,
      status: decision.key.startsWith("wip_") ? "in_progress" : "todo",
      priority: inferPriority(decision),
      assigned_agent: decision.agent || "system",
      layer: decision.layer,
      tags: decision.tags || []
    };

    tasksToCreate.push(task);

    // 4. Mark for hard-deletion
    decisionsToUpdate.push({
      key: decision.key,
      original: decision.value,
      shouldHardDelete: true
    });
  }

  // 5. Create tasks
  const createdTasks = await mcp.task({
    action: "batch_create",
    tasks: tasksToCreate,
    atomic: false
  });

  // 6. Link and hard-delete
  for (let i = 0; i < createdTasks.length; i++) {
    const task = createdTasks[i];
    const decision = decisionsToUpdate[i];

    // Link (maintains traceability)
    await mcp.task({
      action: "link",
      task_id: task.id,
      link_type: "decision",
      target_id: decision.key,
      link_relation: "migrated_from"
    });

    // Hard-delete (removes bloat)
    await mcp.decision({
      action: "hard_delete",
      key: decision.key
    });
  }

  return {
    migrated: createdTasks.length,
    kept: decisions.length - createdTasks.length
  };
}
```

## Summary

**Key Principles:**
1. **Not all decisions are tasks** - Only actionable items should migrate
2. **Preserve context** - Link tasks to original decisions BEFORE deletion
3. **Hard-delete unnecessary decisions** - Reduces bloat (~70 records per decision)
4. **Map status correctly** - WIP → in_progress, completed → done
5. **Maintain metadata** - Preserve layers, tags, priority
6. **Verify results** - Check token efficiency and data integrity

**Expected Results:**
- 202 decisions → ~10-20 tasks (5-10% migration rate)
- Remaining ~180-190 decisions stay as knowledge/documentation
- 70% token efficiency for task list queries
- Better task management with status tracking and auto-stale detection
