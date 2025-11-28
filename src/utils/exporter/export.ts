/**
 * JSON Export Utility - Data-only export for append-import
 * Schema-less export format for merging data across sqlew databases
 */

import { Knex } from 'knex';

// ============================================================================
// Export Types
// ============================================================================

export interface JsonExportOptions {
  projectName?: string;  // Export specific project, or all if undefined
}

export interface JsonExport {
  // Metadata for version compatibility and debugging
  metadata: {
    sqlew_version: string;      // e.g., "3.7.3"
    schema_version: number;      // Schema version number (3 = v3.7.x)
    exported_at: string;         // ISO 8601 timestamp
    export_mode: 'single_project' | 'all_projects';
    database_type: string;       // "sqlite" | "mysql" | "postgresql"
  };

  // Legacy fields (deprecated but kept for backward compatibility)
  version: string;
  exported_at: string;  // ISO 8601
  export_mode: 'single_project' | 'all_projects';
  database_type: string;

  // Project metadata
  project?: {
    name: string;
    display_name: string | null;
    detection_source: string;
    project_root_path: string | null;
    created_ts: number;
    last_active_ts: number;
    metadata: string | null;
  };

  projects?: Array<{
    name: string;
    display_name: string | null;
    detection_source: string;
    project_root_path: string | null;
    created_ts: number;
    last_active_ts: number;
    metadata: string | null;
  }>;

  // Master tables (only entries used by exported project(s))
  // Note: Agent system removed in v4.0 - agents field no longer exists
  master_tables: {
    files: Array<{ id: number; project_id: number; path: string }>;
    context_keys: Array<{ id: number; key: string }>;  // No project_id - global keys
    tags: Array<{ id: number; project_id: number; name: string }>;
    scopes: Array<{ id: number; project_id: number; name: string }>;
    constraint_categories: Array<{ id: number; name: string }>;
    layers: Array<{ id: number; name: string }>;
    task_statuses: Array<{ id: number; name: string }>;
    // v4.0+ tables
    decision_policies: Array<{ id: number; project_id: number; name: string; description: string | null; defaults: string | null; required_fields: string | null; validation_rules: string | null; quality_gates: string | null; suggest_similar: number; category: string | null; ts: number }>;
    tag_index: Array<{ id: number; tag: string; source_type: string; source_id: number; project_id: number; created_ts: number }>;
  };

  // Transaction tables (filtered by project_id)
  // Note: activity_log removed in v4.0 (was never created)
  transaction_tables: {
    decisions: any[];
    decisions_numeric: any[];
    decision_history: any[];
    decision_tags: any[];
    decision_scopes: any[];
    decision_context: any[];
    file_changes: any[];
    constraints: any[];
    constraint_tags: any[];
    tasks: any[];
    task_details: any[];
    task_tags: any[];
    task_file_links: any[];
    task_decision_links: any[];
    task_dependencies: any[];
  };
}

// ============================================================================
// Export Functions
// ============================================================================

/**
 * Generate JSON export from database
 */
export async function generateJsonExport(
  knex: Knex,
  options: JsonExportOptions = {}
): Promise<string> {
  const { projectName } = options;

  // Determine export mode and get project ID(s)
  let exportMode: 'single_project' | 'all_projects';
  let projectIds: number[];
  let projectData: any;

  if (projectName) {
    exportMode = 'single_project';

    // Get project by name
    const project = await knex('v4_projects')
      .where({ name: projectName })
      .first();

    if (!project) {
      throw new Error(`Project not found: ${projectName}`);
    }

    projectIds = [project.id];
    projectData = {
      name: project.name,
      display_name: project.display_name,
      detection_source: project.detection_source,
      project_root_path: project.project_root_path,
      created_ts: project.created_ts,
      last_active_ts: project.last_active_ts,
      metadata: project.metadata,
    };
  } else {
    exportMode = 'all_projects';

    // Get all projects
    const projects = await knex('v4_projects').select('*');
    projectIds = projects.map(p => p.id);
    projectData = projects.map(p => ({
      name: p.name,
      display_name: p.display_name,
      detection_source: p.detection_source,
      project_root_path: p.project_root_path,
      created_ts: p.created_ts,
      last_active_ts: p.last_active_ts,
      metadata: p.metadata,
    }));
  }

  // Get database type
  const dbType = knex.client.config.client;
  const databaseType = dbType === 'better-sqlite3' || dbType === 'sqlite3' ? 'sqlite'
                     : dbType === 'mysql' || dbType === 'mysql2' ? 'mysql'
                     : 'postgresql';

  // Build JSON export structure
  const exportTimestamp = new Date().toISOString();
  const jsonExport: JsonExport = {
    // New metadata format (v3.7.3+)
    metadata: {
      sqlew_version: '3.7.3',
      schema_version: 3,  // Schema v3 = v3.7.x multi-project support
      exported_at: exportTimestamp,
      export_mode: exportMode,
      database_type: databaseType,
    },
    // Legacy fields (backward compatibility)
    version: '3.7.3',
    exported_at: exportTimestamp,
    export_mode: exportMode,
    database_type: databaseType,
    master_tables: {
      files: [],
      context_keys: [],
      tags: [],
      scopes: [],
      constraint_categories: [],
      layers: [],
      task_statuses: [],
      decision_policies: [],
      tag_index: [],
    },
    transaction_tables: {
      decisions: [],
      decisions_numeric: [],
      decision_history: [],
      decision_tags: [],
      decision_scopes: [],
      decision_context: [],
      file_changes: [],
      constraints: [],
      constraint_tags: [],
      tasks: [],
      task_details: [],
      task_tags: [],
      task_file_links: [],
      task_decision_links: [],
      task_dependencies: [],
    },
  };

  // Add project data
  if (exportMode === 'single_project') {
    jsonExport.project = projectData;
  } else {
    jsonExport.projects = projectData;
  }

  // Export master tables (only used IDs)
  jsonExport.master_tables = await exportMasterTables(knex, projectIds);

  // Export transaction tables (filtered by project_id)
  jsonExport.transaction_tables = await exportTransactionTables(knex, projectIds);

  return JSON.stringify(jsonExport, null, 2);
}

/**
 * Export master tables - only entries used by specified project(s)
 */
async function exportMasterTables(
  knex: Knex,
  projectIds: number[]
): Promise<JsonExport['master_tables']> {
  const masterTables: JsonExport['master_tables'] = {
    files: [],
    context_keys: [],
    tags: [],
    scopes: [],
    constraint_categories: [],
    layers: [],
    task_statuses: [],
    decision_policies: [],
    tag_index: [],
  };

  // Note: Agent system removed in v4.0 - no agent-related queries needed

  // Get used file IDs from v4_file_changes and v4_task_file_links
  const usedFileIds = new Set<number>();

  const fileChanges = await knex('v4_file_changes')
    .whereIn('project_id', projectIds)
    .distinct('file_id');
  fileChanges.forEach(row => usedFileIds.add(row.file_id));

  const taskFiles = await knex('v4_task_file_links')
    .whereIn('project_id', projectIds)
    .distinct('file_id');
  taskFiles.forEach(row => usedFileIds.add(row.file_id));

  if (usedFileIds.size > 0) {
    masterTables.files = await knex('v4_files')
      .whereIn('id', Array.from(usedFileIds))
      .select('id', 'project_id', 'path');
  }

  // Get used context key IDs from v4_decisions
  const usedKeyIds = new Set<number>();

  const decisions = await knex('v4_decisions')
    .whereIn('project_id', projectIds)
    .distinct('key_id');
  decisions.forEach(row => usedKeyIds.add(row.key_id));

  const decisionsNumeric = await knex('v4_decisions_numeric')
    .whereIn('project_id', projectIds)
    .distinct('key_id');
  decisionsNumeric.forEach(row => usedKeyIds.add(row.key_id));

  const taskDecisionLinks = await knex('v4_task_decision_links')
    .whereIn('project_id', projectIds)
    .distinct('decision_key_id as key_id');
  taskDecisionLinks.forEach(row => usedKeyIds.add(row.key_id));

  if (usedKeyIds.size > 0) {
    masterTables.context_keys = await knex('v4_context_keys')
      .whereIn('id', Array.from(usedKeyIds))
      .select('id', 'key_name as key');
  }

  // Get used tag IDs from various tag tables
  const usedTagIds = new Set<number>();

  // Join through parent table (v4_decisions) to filter by project_id
  // Note: v4_decision_tags uses decision_key_id (references v4_context_keys.id)
  const decisionTags = await knex('v4_decision_tags as dt')
    .join('v4_decisions as d', 'dt.decision_key_id', 'd.key_id')
    .whereIn('d.project_id', projectIds)
    .distinct('dt.tag_id');
  decisionTags.forEach(row => usedTagIds.add(row.tag_id));

  // Join through parent table (v4_constraints) to filter by project_id
  const constraintTags = await knex('v4_constraint_tags as ct')
    .join('v4_constraints as c', 'ct.constraint_id', 'c.id')
    .whereIn('c.project_id', projectIds)
    .distinct('ct.tag_id');
  constraintTags.forEach(row => usedTagIds.add(row.tag_id));

  // Join through parent table (v4_tasks) to filter by project_id
  const taskTags = await knex('v4_task_tags as tt')
    .join('v4_tasks as t', 'tt.task_id', 't.id')
    .whereIn('t.project_id', projectIds)
    .distinct('tt.tag_id');
  taskTags.forEach(row => usedTagIds.add(row.tag_id));

  if (usedTagIds.size > 0) {
    masterTables.tags = await knex('v4_tags')
      .whereIn('id', Array.from(usedTagIds))
      .select('id', 'project_id', 'name');
  }

  // Get used scope IDs from v4_decision_scopes
  const usedScopeIds = new Set<number>();

  // Join through parent table (v4_decisions) to filter by project_id
  // Note: v4_decision_scopes uses decision_key_id (references v4_context_keys.id)
  const decisionScopes = await knex('v4_decision_scopes as ds')
    .join('v4_decisions as d', 'ds.decision_key_id', 'd.key_id')
    .whereIn('d.project_id', projectIds)
    .distinct('ds.scope_id');
  decisionScopes.forEach(row => usedScopeIds.add(row.scope_id));

  if (usedScopeIds.size > 0) {
    masterTables.scopes = await knex('v4_scopes')
      .whereIn('id', Array.from(usedScopeIds))
      .select('id', 'project_id', 'name');
  }

  // Get used category IDs from v4_constraints
  const usedCategoryIds = new Set<number>();

  const constraints = await knex('v4_constraints')
    .whereIn('project_id', projectIds)
    .distinct('category_id');
  constraints.forEach(row => usedCategoryIds.add(row.category_id));

  if (usedCategoryIds.size > 0) {
    masterTables.constraint_categories = await knex('v4_constraint_categories')
      .whereIn('id', Array.from(usedCategoryIds))
      .select('id', 'name');
  }

  // Get used layer IDs from all tables that reference layers
  const usedLayerIds = new Set<number>();

  const decisionLayers = await knex('v4_decisions')
    .whereIn('project_id', projectIds)
    .whereNotNull('layer_id')
    .distinct('layer_id');
  decisionLayers.forEach(row => usedLayerIds.add(row.layer_id));

  const fileChangeLayers = await knex('v4_file_changes')
    .whereIn('project_id', projectIds)
    .whereNotNull('layer_id')
    .distinct('layer_id');
  fileChangeLayers.forEach(row => usedLayerIds.add(row.layer_id));

  const constraintLayers = await knex('v4_constraints')
    .whereIn('project_id', projectIds)
    .whereNotNull('layer_id')
    .distinct('layer_id');
  constraintLayers.forEach(row => usedLayerIds.add(row.layer_id));

  const taskLayers = await knex('v4_tasks')
    .whereIn('project_id', projectIds)
    .whereNotNull('layer_id')
    .distinct('layer_id');
  taskLayers.forEach(row => usedLayerIds.add(row.layer_id));

  if (usedLayerIds.size > 0) {
    masterTables.layers = await knex('v4_layers')
      .whereIn('id', Array.from(usedLayerIds))
      .select('id', 'name');
  }

  // Get all task statuses (these are static enum-like data)
  masterTables.task_statuses = await knex('v4_task_statuses')
    .select('id', 'name');

  // Export v4.0+ tables: decision_policies (filtered by project_id)
  masterTables.decision_policies = await knex('v4_decision_policies')
    .whereIn('project_id', projectIds)
    .select('id', 'project_id', 'name', 'description', 'defaults', 'required_fields', 'validation_rules', 'quality_gates', 'suggest_similar', 'category', 'ts');

  // Export v4.0+ tables: tag_index (filtered by project_id)
  masterTables.tag_index = await knex('v4_tag_index')
    .whereIn('project_id', projectIds)
    .select('id', 'tag', 'source_type', 'source_id', 'project_id', 'created_ts');

  return masterTables;
}

/**
 * Export transaction tables filtered by project_id
 */
async function exportTransactionTables(
  knex: Knex,
  projectIds: number[]
): Promise<JsonExport['transaction_tables']> {
  const transactionTables: JsonExport['transaction_tables'] = {
    decisions: [],
    decisions_numeric: [],
    decision_history: [],
    decision_tags: [],
    decision_scopes: [],
    decision_context: [],
    file_changes: [],
    constraints: [],
    constraint_tags: [],
    tasks: [],
    task_details: [],
    task_tags: [],
    task_file_links: [],
    task_decision_links: [],
    task_dependencies: [],
  };

  // Export each transaction table
  transactionTables.decisions = await knex('v4_decisions')
    .whereIn('project_id', projectIds)
    .select('*');

  transactionTables.decisions_numeric = await knex('v4_decisions_numeric')
    .whereIn('project_id', projectIds)
    .select('*');

  transactionTables.decision_history = await knex('v4_decision_history')
    .whereIn('project_id', projectIds)
    .select('*');

  // Junction tables - filter by joining through parent table
  // Note: decision junction tables use decision_key_id (references v4_context_keys.id)
  transactionTables.decision_tags = await knex('v4_decision_tags as dt')
    .join('v4_decisions as d', 'dt.decision_key_id', 'd.key_id')
    .whereIn('d.project_id', projectIds)
    .select('dt.*');

  transactionTables.decision_scopes = await knex('v4_decision_scopes as ds')
    .join('v4_decisions as d', 'ds.decision_key_id', 'd.key_id')
    .whereIn('d.project_id', projectIds)
    .select('ds.*');

  transactionTables.decision_context = await knex('v4_decision_context')
    .whereIn('project_id', projectIds)
    .select('*');

  transactionTables.file_changes = await knex('v4_file_changes')
    .whereIn('project_id', projectIds)
    .select('*');

  transactionTables.constraints = await knex('v4_constraints')
    .whereIn('project_id', projectIds)
    .select('*');

  // Junction table - filter by joining through parent table
  transactionTables.constraint_tags = await knex('v4_constraint_tags as ct')
    .join('v4_constraints as c', 'ct.constraint_id', 'c.id')
    .whereIn('c.project_id', projectIds)
    .select('ct.*');

  transactionTables.tasks = await knex('v4_tasks')
    .whereIn('project_id', projectIds)
    .select('*');

  // task_details doesn't have project_id, join through v4_tasks
  transactionTables.task_details = await knex('v4_task_details as td')
    .join('v4_tasks as t', 'td.task_id', 't.id')
    .whereIn('t.project_id', projectIds)
    .select('td.*');

  // Junction table - filter by joining through parent table
  transactionTables.task_tags = await knex('v4_task_tags as tt')
    .join('v4_tasks as t', 'tt.task_id', 't.id')
    .whereIn('t.project_id', projectIds)
    .select('tt.*');

  transactionTables.task_file_links = await knex('v4_task_file_links')
    .whereIn('project_id', projectIds)
    .select('*');

  transactionTables.task_decision_links = await knex('v4_task_decision_links')
    .whereIn('project_id', projectIds)
    .select('*');

  transactionTables.task_dependencies = await knex('v4_task_dependencies')
    .whereIn('project_id', projectIds)
    .select('*');

  // Note: activity_log removed in v4.0 (table was never created)

  return transactionTables;
}
