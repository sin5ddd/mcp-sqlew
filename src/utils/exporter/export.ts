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
  // Note: Only m_files, m_tags, m_scopes have project_id (added in v3.7.3)
  master_tables: {
    agents: Array<{ id: number; name: string; last_active_ts: number }>;
    files: Array<{ id: number; project_id: number; path: string }>;
    context_keys: Array<{ id: number; key: string }>;  // No project_id - global keys
    tags: Array<{ id: number; project_id: number; name: string }>;
    scopes: Array<{ id: number; project_id: number; name: string }>;
    constraint_categories: Array<{ id: number; name: string }>;
    layers: Array<{ id: number; name: string }>;
    task_statuses: Array<{ id: number; name: string }>;
  };

  // Transaction tables (filtered by project_id)
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
    activity_log: any[];
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
    const project = await knex('m_projects')
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
    const projects = await knex('m_projects').select('*');
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
      agents: [],
      files: [],
      context_keys: [],
      tags: [],
      scopes: [],
      constraint_categories: [],
      layers: [],
      task_statuses: [],
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
      activity_log: [],
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
    agents: [],
    files: [],
    context_keys: [],
    tags: [],
    scopes: [],
    constraint_categories: [],
    layers: [],
    task_statuses: [],
  };

  // Get used agent IDs from all transaction tables
  const usedAgentIds = new Set<number>();

  // From t_decisions
  const decisionAgents = await knex('t_decisions')
    .whereIn('project_id', projectIds)
    .whereNotNull('agent_id')
    .distinct('agent_id');
  decisionAgents.forEach(row => usedAgentIds.add(row.agent_id));

  // From t_file_changes
  const fileChangeAgents = await knex('t_file_changes')
    .whereIn('project_id', projectIds)
    .distinct('agent_id');
  fileChangeAgents.forEach(row => usedAgentIds.add(row.agent_id));

  // From t_constraints
  const constraintAgents = await knex('t_constraints')
    .whereIn('project_id', projectIds)
    .whereNotNull('agent_id')
    .distinct('agent_id');
  constraintAgents.forEach(row => usedAgentIds.add(row.agent_id));

  // From t_tasks
  const taskAgents = await knex('t_tasks')
    .whereIn('project_id', projectIds)
    .whereNotNull('assigned_agent_id')
    .distinct('assigned_agent_id as agent_id');
  taskAgents.forEach(row => usedAgentIds.add(row.agent_id));

  // From t_decision_context
  const contextAgents = await knex('t_decision_context')
    .whereIn('project_id', projectIds)
    .whereNotNull('agent_id')
    .distinct('agent_id');
  contextAgents.forEach(row => usedAgentIds.add(row.agent_id));

  if (usedAgentIds.size > 0) {
    masterTables.agents = await knex('m_agents')
      .whereIn('id', Array.from(usedAgentIds))
      .select('id', 'name', 'last_active_ts');
  }

  // Get used file IDs from t_file_changes and t_task_file_links
  const usedFileIds = new Set<number>();

  const fileChanges = await knex('t_file_changes')
    .whereIn('project_id', projectIds)
    .distinct('file_id');
  fileChanges.forEach(row => usedFileIds.add(row.file_id));

  const taskFiles = await knex('t_task_file_links')
    .whereIn('project_id', projectIds)
    .distinct('file_id');
  taskFiles.forEach(row => usedFileIds.add(row.file_id));

  if (usedFileIds.size > 0) {
    masterTables.files = await knex('m_files')
      .whereIn('id', Array.from(usedFileIds))
      .select('id', 'project_id', 'path');
  }

  // Get used context key IDs from t_decisions
  const usedKeyIds = new Set<number>();

  const decisions = await knex('t_decisions')
    .whereIn('project_id', projectIds)
    .distinct('key_id');
  decisions.forEach(row => usedKeyIds.add(row.key_id));

  const decisionsNumeric = await knex('t_decisions_numeric')
    .whereIn('project_id', projectIds)
    .distinct('key_id');
  decisionsNumeric.forEach(row => usedKeyIds.add(row.key_id));

  const taskDecisionLinks = await knex('t_task_decision_links')
    .whereIn('project_id', projectIds)
    .distinct('decision_key_id as key_id');
  taskDecisionLinks.forEach(row => usedKeyIds.add(row.key_id));

  if (usedKeyIds.size > 0) {
    masterTables.context_keys = await knex('m_context_keys')
      .whereIn('id', Array.from(usedKeyIds))
      .select('id', 'key');
  }

  // Get used tag IDs from various tag tables
  const usedTagIds = new Set<number>();

  // Join through parent table (t_decisions) to filter by project_id
  // Note: t_decision_tags uses decision_key_id (references m_context_keys.id)
  const decisionTags = await knex('t_decision_tags as dt')
    .join('t_decisions as d', 'dt.decision_key_id', 'd.key_id')
    .whereIn('d.project_id', projectIds)
    .distinct('dt.tag_id');
  decisionTags.forEach(row => usedTagIds.add(row.tag_id));

  // Join through parent table (t_constraints) to filter by project_id
  const constraintTags = await knex('t_constraint_tags as ct')
    .join('t_constraints as c', 'ct.constraint_id', 'c.id')
    .whereIn('c.project_id', projectIds)
    .distinct('ct.tag_id');
  constraintTags.forEach(row => usedTagIds.add(row.tag_id));

  // Join through parent table (t_tasks) to filter by project_id
  const taskTags = await knex('t_task_tags as tt')
    .join('t_tasks as t', 'tt.task_id', 't.id')
    .whereIn('t.project_id', projectIds)
    .distinct('tt.tag_id');
  taskTags.forEach(row => usedTagIds.add(row.tag_id));

  if (usedTagIds.size > 0) {
    masterTables.tags = await knex('m_tags')
      .whereIn('id', Array.from(usedTagIds))
      .select('id', 'project_id', 'name');
  }

  // Get used scope IDs from t_decision_scopes
  const usedScopeIds = new Set<number>();

  // Join through parent table (t_decisions) to filter by project_id
  // Note: t_decision_scopes uses decision_key_id (references m_context_keys.id)
  const decisionScopes = await knex('t_decision_scopes as ds')
    .join('t_decisions as d', 'ds.decision_key_id', 'd.key_id')
    .whereIn('d.project_id', projectIds)
    .distinct('ds.scope_id');
  decisionScopes.forEach(row => usedScopeIds.add(row.scope_id));

  if (usedScopeIds.size > 0) {
    masterTables.scopes = await knex('m_scopes')
      .whereIn('id', Array.from(usedScopeIds))
      .select('id', 'project_id', 'name');
  }

  // Get used category IDs from t_constraints
  const usedCategoryIds = new Set<number>();

  const constraints = await knex('t_constraints')
    .whereIn('project_id', projectIds)
    .distinct('category_id');
  constraints.forEach(row => usedCategoryIds.add(row.category_id));

  if (usedCategoryIds.size > 0) {
    masterTables.constraint_categories = await knex('m_constraint_categories')
      .whereIn('id', Array.from(usedCategoryIds))
      .select('id', 'name');
  }

  // Get used layer IDs from all tables that reference layers
  const usedLayerIds = new Set<number>();

  const decisionLayers = await knex('t_decisions')
    .whereIn('project_id', projectIds)
    .whereNotNull('layer_id')
    .distinct('layer_id');
  decisionLayers.forEach(row => usedLayerIds.add(row.layer_id));

  const fileChangeLayers = await knex('t_file_changes')
    .whereIn('project_id', projectIds)
    .whereNotNull('layer_id')
    .distinct('layer_id');
  fileChangeLayers.forEach(row => usedLayerIds.add(row.layer_id));

  const constraintLayers = await knex('t_constraints')
    .whereIn('project_id', projectIds)
    .whereNotNull('layer_id')
    .distinct('layer_id');
  constraintLayers.forEach(row => usedLayerIds.add(row.layer_id));

  const taskLayers = await knex('t_tasks')
    .whereIn('project_id', projectIds)
    .whereNotNull('layer_id')
    .distinct('layer_id');
  taskLayers.forEach(row => usedLayerIds.add(row.layer_id));

  if (usedLayerIds.size > 0) {
    masterTables.layers = await knex('m_layers')
      .whereIn('id', Array.from(usedLayerIds))
      .select('id', 'name');
  }

  // Get all task statuses (these are static enum-like data)
  masterTables.task_statuses = await knex('m_task_statuses')
    .select('id', 'name');

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
    activity_log: [],
  };

  // Export each transaction table
  transactionTables.decisions = await knex('t_decisions')
    .whereIn('project_id', projectIds)
    .select('*');

  transactionTables.decisions_numeric = await knex('t_decisions_numeric')
    .whereIn('project_id', projectIds)
    .select('*');

  transactionTables.decision_history = await knex('t_decision_history')
    .whereIn('project_id', projectIds)
    .select('*');

  // Junction tables - filter by joining through parent table
  // Note: decision junction tables use decision_key_id (references m_context_keys.id)
  transactionTables.decision_tags = await knex('t_decision_tags as dt')
    .join('t_decisions as d', 'dt.decision_key_id', 'd.key_id')
    .whereIn('d.project_id', projectIds)
    .select('dt.*');

  transactionTables.decision_scopes = await knex('t_decision_scopes as ds')
    .join('t_decisions as d', 'ds.decision_key_id', 'd.key_id')
    .whereIn('d.project_id', projectIds)
    .select('ds.*');

  transactionTables.decision_context = await knex('t_decision_context')
    .whereIn('project_id', projectIds)
    .select('*');

  transactionTables.file_changes = await knex('t_file_changes')
    .whereIn('project_id', projectIds)
    .select('*');

  transactionTables.constraints = await knex('t_constraints')
    .whereIn('project_id', projectIds)
    .select('*');

  // Junction table - filter by joining through parent table
  transactionTables.constraint_tags = await knex('t_constraint_tags as ct')
    .join('t_constraints as c', 'ct.constraint_id', 'c.id')
    .whereIn('c.project_id', projectIds)
    .select('ct.*');

  transactionTables.tasks = await knex('t_tasks')
    .whereIn('project_id', projectIds)
    .select('*');

  transactionTables.task_details = await knex('t_task_details')
    .whereIn('project_id', projectIds)
    .select('*');

  // Junction table - filter by joining through parent table
  transactionTables.task_tags = await knex('t_task_tags as tt')
    .join('t_tasks as t', 'tt.task_id', 't.id')
    .whereIn('t.project_id', projectIds)
    .select('tt.*');

  transactionTables.task_file_links = await knex('t_task_file_links')
    .whereIn('project_id', projectIds)
    .select('*');

  transactionTables.task_decision_links = await knex('t_task_decision_links')
    .whereIn('project_id', projectIds)
    .select('*');

  transactionTables.task_dependencies = await knex('t_task_dependencies')
    .whereIn('project_id', projectIds)
    .select('*');

  transactionTables.activity_log = await knex('t_activity_log')
    .whereIn('project_id', projectIds)
    .select('*');

  return transactionTables;
}
