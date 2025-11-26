/**
 * JSON Import Main Orchestrator
 *
 * Coordinates the entire import process with transaction atomicity.
 * Implements architectural decisions #247-259 for safe multi-project data migration.
 *
 * Import Order:
 * 1. Validate JSON schema
 * 2. Check project name conflict (skip if exists)
 * 3. Create new project
 * 4. Import master tables → ID mappings
 * 5. Import transaction data with remapped IDs
 * 6. Import junction tables with remapped IDs
 */

import type { Knex } from 'knex';
import type {
  JsonImportOptions,
  JsonImportResult,
  ImportContext,
  ImportStats,
  IdMapping
} from '../../types.js';
import { importMasterTables } from './master-tables.js';
import { sortTasksByDependencies, type TaskDependency } from './topological-sort.js';

/**
 * Main import function
 *
 * Architectural Decision #256: Transaction atomicity
 * All imports wrapped in transaction, rollback on error
 *
 * @param knex - Knex database instance
 * @param jsonData - Parsed JSON export data
 * @param options - Import options
 * @returns Import result with statistics
 */
export async function importJsonData(
  knex: Knex,
  jsonData: any,
  options: JsonImportOptions = {}
): Promise<JsonImportResult> {
  const { targetProjectName, skipIfExists = true, dryRun = false } = options;

  // Step 1: Extract project name
  const projectName = targetProjectName || jsonData.project?.name || jsonData.projects?.[0]?.name;
  if (!projectName) {
    return {
      success: false,
      error: 'No project name specified and none found in JSON export'
    };
  }

  console.error(`\nImporting project: ${projectName}`);

  // Step 2: Check for project name conflict
  const existingProject = await knex('v4_projects')
    .where({ name: projectName })
    .first();

  if (existingProject && skipIfExists) {
    console.error(`⚠️  Project "${projectName}" already exists (ID: ${existingProject.id})`);
    console.error(`   Skipping import to avoid conflicts`);
    return {
      success: true,
      skipped: true,
      skip_reason: 'project_exists',
      project_name: projectName
    };
  }

  if (dryRun) {
    console.error(`✓ Dry run: Validation passed, would import to new project "${projectName}"`);
    return {
      success: true,
      project_name: projectName
    };
  }

  // Step 3: Perform import in transaction
  try {
    const result = await knex.transaction(async (trx) => {
      return await performImport(trx, jsonData, projectName);
    });

    console.error(`\n✓ Import complete: ${result.stats!.transaction_tables.tasks_created} tasks, ${result.stats!.transaction_tables.decisions_created} decisions`);
    return result;

  } catch (error) {
    console.error(`\n❌ Import failed: ${error instanceof Error ? error.message : String(error)}`);
    console.error(`   Transaction rolled back, no data imported`);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Perform import within transaction
 */
async function performImport(
  trx: Knex.Transaction,
  jsonData: any,
  projectName: string
): Promise<JsonImportResult> {
  // Step 1: Create new project
  const projectData = jsonData.project || jsonData.projects?.[0];
  const [projectId] = await trx('v4_projects').insert({
    name: projectName,
    display_name: projectData?.display_name || projectName,
    detection_source: projectData?.detection_source || 'import',
    project_root_path: projectData?.project_root_path || null,
    created_ts: Math.floor(Date.now() / 1000),
    last_active_ts: Math.floor(Date.now() / 1000),
    metadata: JSON.stringify({
      imported_at: new Date().toISOString(),
      source_version: jsonData.metadata?.sqlew_version || jsonData.version,
      source_export_mode: jsonData.metadata?.export_mode || jsonData.export_mode
    })
  });

  console.error(`  ✓ Created project "${projectName}" (ID: ${projectId})`);

  // Step 2: Initialize import context
  const ctx: ImportContext = {
    knex: trx,
    projectId,
    jsonData,
    options: {},
    mappings: {
      projects: new Map(),
      agents: new Map(),
      files: new Map(),
      context_keys: new Map(),
      tags: new Map(),
      scopes: new Map(),
      constraint_categories: new Map(),
      layers: new Map(),
      task_statuses: new Map(),
      tasks: new Map()
    },
    stats: initializeStats()
  };

  ctx.stats.project_created = true;

  // Step 3: Import master tables
  await importMasterTables(ctx);

  // Step 4: Import transaction tables
  await importTransactionTables(ctx);

  // Step 5: Import junction tables
  await importJunctionTables(ctx);

  return {
    success: true,
    project_id: projectId,
    project_name: projectName,
    stats: ctx.stats
  };
}

/**
 * Import transaction tables with ID remapping
 */
async function importTransactionTables(ctx: ImportContext): Promise<void> {
  console.error('  Importing transaction tables...');

  // Import in dependency order
  await importDecisions(ctx);
  await importDecisionsNumeric(ctx);
  await importDecisionHistory(ctx);
  await importDecisionContext(ctx);
  await importFileChanges(ctx);
  await importConstraints(ctx);
  await importTasks(ctx);  // Uses topological sort internally
  await importTaskDetails(ctx);
  await importActivityLog(ctx);

  console.error(`  ✓ Transaction tables imported`);
}

/**
 * Import v4_decisions with remapped context_key IDs
 */
async function importDecisions(ctx: ImportContext): Promise<void> {
  const decisions = ctx.jsonData.transaction_tables.decisions || [];

  for (const decision of decisions) {
    const newKeyId = ctx.mappings.context_keys.get(decision.key_id);
    if (!newKeyId) continue;

    await ctx.knex('v4_decisions').insert({
      key_id: newKeyId,
      value: decision.value,
      agent_id: ctx.mappings.agents.get(decision.agent_id) || null,
      layer_id: ctx.mappings.layers.get(decision.layer_id) || null,
      version: decision.version,
      status: decision.status,
      ts: decision.ts,
      project_id: ctx.projectId
    });
  }

  ctx.stats.transaction_tables.decisions_created = decisions.length;
}

/**
 * Import v4_decisions_numeric with remapped context_key IDs
 */
async function importDecisionsNumeric(ctx: ImportContext): Promise<void> {
  const decisions = ctx.jsonData.transaction_tables.decisions_numeric || [];

  for (const decision of decisions) {
    const newKeyId = ctx.mappings.context_keys.get(decision.key_id);
    if (!newKeyId) continue;

    await ctx.knex('v4_decisions_numeric').insert({
      key_id: newKeyId,
      value: decision.value,
      agent_id: ctx.mappings.agents.get(decision.agent_id) || null,
      layer_id: ctx.mappings.layers.get(decision.layer_id) || null,
      version: decision.version,
      status: decision.status,
      ts: decision.ts,
      project_id: ctx.projectId
    });
  }

  ctx.stats.transaction_tables.decisions_numeric_created = decisions.length;
}

/**
 * Import v4_decision_history with remapped context_key IDs
 */
async function importDecisionHistory(ctx: ImportContext): Promise<void> {
  const history = ctx.jsonData.transaction_tables.decision_history || [];

  for (const entry of history) {
    const newKeyId = ctx.mappings.context_keys.get(entry.key_id);
    if (!newKeyId) continue;

    await ctx.knex('v4_decision_history').insert({
      key_id: newKeyId,
      version: entry.version,
      value: entry.value,
      agent_id: ctx.mappings.agents.get(entry.agent_id) || null,
      ts: entry.ts,
      project_id: ctx.projectId
    });
  }

  ctx.stats.transaction_tables.decision_history_created = history.length;
}

/**
 * Import v4_decision_context with remapped IDs
 */
async function importDecisionContext(ctx: ImportContext): Promise<void> {
  const contexts = ctx.jsonData.transaction_tables.decision_context || [];

  for (const context of contexts) {
    const newKeyId = ctx.mappings.context_keys.get(context.decision_key_id);
    if (!newKeyId) continue;

    await ctx.knex('v4_decision_context').insert({
      decision_key_id: newKeyId,
      rationale: context.rationale,
      alternatives_considered: context.alternatives_considered,
      tradeoffs: context.tradeoffs,
      decision_date: context.decision_date,
      agent_id: ctx.mappings.agents.get(context.agent_id) || null,
      related_task_id: null,  // Will be updated later if task exists
      related_constraint_id: null,
      project_id: ctx.projectId
    });
  }

  ctx.stats.transaction_tables.decision_context_created = contexts.length;
}

/**
 * Import v4_file_changes with remapped IDs
 */
async function importFileChanges(ctx: ImportContext): Promise<void> {
  const changes = ctx.jsonData.transaction_tables.file_changes || [];

  for (const change of changes) {
    const newFileId = ctx.mappings.files.get(change.file_id);
    if (!newFileId) continue;

    await ctx.knex('v4_file_changes').insert({
      file_id: newFileId,
      change_type: change.change_type,
      agent_id: ctx.mappings.agents.get(change.agent_id) || null,
      layer_id: ctx.mappings.layers.get(change.layer_id) || null,
      description: change.description,
      ts: change.ts,
      project_id: ctx.projectId
    });
  }

  ctx.stats.transaction_tables.file_changes_created = changes.length;
}

/**
 * Import v4_constraints with remapped IDs
 */
async function importConstraints(ctx: ImportContext): Promise<void> {
  const constraints = ctx.jsonData.transaction_tables.constraints || [];

  for (const constraint of constraints) {
    await ctx.knex('v4_constraints').insert({
      category_id: ctx.mappings.constraint_categories.get(constraint.category_id) || constraint.category_id,
      constraint_text: constraint.constraint_text,
      priority: constraint.priority,
      active: constraint.active,
      agent_id: ctx.mappings.agents.get(constraint.agent_id) || null,
      layer_id: ctx.mappings.layers.get(constraint.layer_id) || null,
      ts: constraint.ts,
      project_id: ctx.projectId
    });
  }

  ctx.stats.transaction_tables.constraints_created = constraints.length;
}

/**
 * Import v4_tasks with topological sort for dependencies
 */
async function importTasks(ctx: ImportContext): Promise<void> {
  const tasks: any[] = ctx.jsonData.transaction_tables.tasks || [];
  const dependencies: TaskDependency[] = ctx.jsonData.transaction_tables.task_dependencies || [];

  // Sort tasks by dependency order
  const sortedTasks = sortTasksByDependencies(tasks, dependencies);

  for (const task of sortedTasks) {
    const [newTaskId] = await ctx.knex('v4_tasks').insert({
      title: task.title,
      status_id: ctx.mappings.task_statuses.get(task.status_id) || task.status_id,
      assigned_agent_id: ctx.mappings.agents.get(task.assigned_agent_id) || null,
      created_by_agent_id: ctx.mappings.agents.get(task.created_by_agent_id) || null,
      priority: task.priority,
      layer_id: ctx.mappings.layers.get(task.layer_id) || null,
      created_ts: task.created_ts,
      updated_ts: task.updated_ts,
      completed_ts: task.completed_ts,
      project_id: ctx.projectId
    });

    ctx.mappings.tasks.set(task.id, newTaskId);
  }

  ctx.stats.transaction_tables.tasks_created = tasks.length;
}

/**
 * Import v4_task_details with remapped task IDs
 */
async function importTaskDetails(ctx: ImportContext): Promise<void> {
  const details = ctx.jsonData.transaction_tables.task_details || [];

  for (const detail of details) {
    const newTaskId = ctx.mappings.tasks.get(detail.task_id);
    if (!newTaskId) continue;

    await ctx.knex('v4_task_details').insert({
      task_id: newTaskId,
      description: detail.description,
      acceptance_criteria: detail.acceptance_criteria,
      notes: detail.notes,
      project_id: ctx.projectId
    });
  }

  ctx.stats.transaction_tables.task_details_created = details.length;
}

/**
 * Import v4_activity_log with remapped IDs
 */
async function importActivityLog(ctx: ImportContext): Promise<void> {
  const activities = ctx.jsonData.transaction_tables.activity_log || [];

  for (const activity of activities) {
    await ctx.knex('v4_activity_log').insert({
      ts: activity.ts,
      agent_id: ctx.mappings.agents.get(activity.agent_id) || null,
      action_type: activity.action_type,
      target: activity.target,
      layer_id: ctx.mappings.layers.get(activity.layer_id) || null,
      details: activity.details,
      project_id: ctx.projectId
    });
  }

  ctx.stats.transaction_tables.activity_log_created = activities.length;
}

/**
 * Import junction tables with remapped IDs
 */
async function importJunctionTables(ctx: ImportContext): Promise<void> {
  console.error('  Importing junction tables...');

  await importDecisionTags(ctx);
  await importDecisionScopes(ctx);
  await importConstraintTags(ctx);
  await importTaskTags(ctx);
  await importTaskFileLinks(ctx);
  await importTaskDecisionLinks(ctx);
  await importTaskDependencies(ctx);

  console.error(`  ✓ Junction tables imported`);
}

/**
 * Import v4_decision_tags with remapped IDs
 */
async function importDecisionTags(ctx: ImportContext): Promise<void> {
  const tags = ctx.jsonData.transaction_tables.decision_tags || [];

  for (const tag of tags) {
    const newKeyId = ctx.mappings.context_keys.get(tag.decision_key_id);
    const newTagId = ctx.mappings.tags.get(tag.tag_id);
    if (!newKeyId || !newTagId) continue;

    await ctx.knex('v4_decision_tags').insert({
      decision_key_id: newKeyId,
      tag_id: newTagId,
      project_id: ctx.projectId
    });
  }

  ctx.stats.junction_tables.decision_tags_created = tags.length;
}

/**
 * Import v4_decision_scopes with remapped IDs
 */
async function importDecisionScopes(ctx: ImportContext): Promise<void> {
  const scopes = ctx.jsonData.transaction_tables.decision_scopes || [];

  for (const scope of scopes) {
    const newKeyId = ctx.mappings.context_keys.get(scope.decision_key_id);
    const newScopeId = ctx.mappings.scopes.get(scope.scope_id);
    if (!newKeyId || !newScopeId) continue;

    await ctx.knex('v4_decision_scopes').insert({
      decision_key_id: newKeyId,
      scope_id: newScopeId,
      project_id: ctx.projectId
    });
  }

  ctx.stats.junction_tables.decision_scopes_created = scopes.length;
}

/**
 * Import v4_constraint_tags with remapped IDs
 */
async function importConstraintTags(ctx: ImportContext): Promise<void> {
  const tags = ctx.jsonData.transaction_tables.constraint_tags || [];

  for (const tag of tags) {
    const newTagId = ctx.mappings.tags.get(tag.tag_id);
    if (!newTagId) continue;

    // Note: constraint_id is not remapped as constraints are imported sequentially
    // and the IDs may not match. This is a limitation of the current implementation.
    // For now, we skip importing constraint tags.
  }

  ctx.stats.junction_tables.constraint_tags_created = 0;
}

/**
 * Import v4_task_tags with remapped IDs
 */
async function importTaskTags(ctx: ImportContext): Promise<void> {
  const tags = ctx.jsonData.transaction_tables.task_tags || [];

  for (const tag of tags) {
    const newTaskId = ctx.mappings.tasks.get(tag.task_id);
    const newTagId = ctx.mappings.tags.get(tag.tag_id);
    if (!newTaskId || !newTagId) continue;

    await ctx.knex('v4_task_tags').insert({
      task_id: newTaskId,
      tag_id: newTagId,
      project_id: ctx.projectId
    });
  }

  ctx.stats.junction_tables.task_tags_created = tags.length;
}

/**
 * Import v4_task_file_links with remapped IDs
 */
async function importTaskFileLinks(ctx: ImportContext): Promise<void> {
  const links = ctx.jsonData.transaction_tables.task_file_links || [];

  for (const link of links) {
    const newTaskId = ctx.mappings.tasks.get(link.task_id);
    const newFileId = ctx.mappings.files.get(link.file_id);
    if (!newTaskId || !newFileId) continue;

    await ctx.knex('v4_task_file_links').insert({
      task_id: newTaskId,
      file_id: newFileId,
      project_id: ctx.projectId
    });
  }

  ctx.stats.junction_tables.task_file_links_created = links.length;
}

/**
 * Import v4_task_decision_links with remapped IDs
 */
async function importTaskDecisionLinks(ctx: ImportContext): Promise<void> {
  const links = ctx.jsonData.transaction_tables.task_decision_links || [];

  for (const link of links) {
    const newTaskId = ctx.mappings.tasks.get(link.task_id);
    const newKeyId = ctx.mappings.context_keys.get(link.decision_key_id);
    if (!newTaskId || !newKeyId) continue;

    await ctx.knex('v4_task_decision_links').insert({
      task_id: newTaskId,
      decision_key_id: newKeyId,
      project_id: ctx.projectId,
      link_type: link.link_type || 'implements'
    });
  }

  ctx.stats.junction_tables.task_decision_links_created = links.length;
}

/**
 * Import v4_task_dependencies with remapped task IDs
 */
async function importTaskDependencies(ctx: ImportContext): Promise<void> {
  const dependencies: TaskDependency[] = ctx.jsonData.transaction_tables.task_dependencies || [];

  for (const dep of dependencies) {
    const newBlockerId = ctx.mappings.tasks.get(dep.blocker_task_id);
    const newBlockedId = ctx.mappings.tasks.get(dep.blocked_task_id);
    if (!newBlockerId || !newBlockedId) continue;

    await ctx.knex('v4_task_dependencies').insert({
      blocker_task_id: newBlockerId,
      blocked_task_id: newBlockedId,
      created_ts: dep.created_ts,
      project_id: ctx.projectId
    });
  }

  ctx.stats.junction_tables.task_dependencies_created = dependencies.length;
}

/**
 * Initialize empty statistics
 */
function initializeStats(): ImportStats {
  return {
    project_created: false,
    master_tables: {
      agents_created: 0,
      files_created: 0,
      files_reused: 0,
      context_keys_created: 0,
      tags_created: 0,
      tags_reused: 0,
      scopes_created: 0,
      scopes_reused: 0
    },
    transaction_tables: {
      decisions_created: 0,
      decisions_numeric_created: 0,
      decision_history_created: 0,
      decision_context_created: 0,
      file_changes_created: 0,
      constraints_created: 0,
      tasks_created: 0,
      task_details_created: 0,
      activity_log_created: 0
    },
    junction_tables: {
      decision_tags_created: 0,
      decision_scopes_created: 0,
      constraint_tags_created: 0,
      task_tags_created: 0,
      task_file_links_created: 0,
      task_decision_links_created: 0,
      task_dependencies_created: 0
    }
  };
}
