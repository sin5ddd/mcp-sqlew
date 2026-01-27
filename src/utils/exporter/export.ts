/**
 * JSON Export Utility - Data-only export for append-import
 * Schema-less export format for merging data across sqlew databases
 */

import { Knex } from 'knex';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Get version from package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJsonPath = join(__dirname, '../../../package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
const SQLEW_VERSION = packageJson.version;
// Extract major.minor version for schema compatibility (e.g., "4.0.1" → "4.0")
const SCHEMA_VERSION = SQLEW_VERSION.split('.').slice(0, 2).join('.');

// ============================================================================
// Export Types
// ============================================================================

export interface JsonExportOptions {
  projectName?: string;  // Export specific project, or all if undefined
}

export interface JsonExport {
  // Metadata for version compatibility and debugging
  metadata: {
    sqlew_version: string;      // e.g., "4.0.1"
    schema_version: string;      // Schema version (major.minor), e.g., "4.0"
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
    id: number;
    name: string;
    display_name: string | null;
    detection_source: string;
    project_root_path: string | null;
    created_ts: number;
    last_active_ts: number;
    metadata: string | null;
  };

  projects?: Array<{
    id: number;
    name: string;
    display_name: string | null;
    detection_source: string;
    project_root_path: string | null;
    created_ts: number;
    last_active_ts: number;
    metadata: string | null;
  }>;

  // Master tables (only entries used by exported project(s))
  // Note: Agent system removed in v4.0, task/file system removed in v5.0
  master_tables: {
    context_keys: Array<{ id: number; key: string }>;  // No project_id - global keys
    tags: Array<{ id: number; project_id: number; name: string }>;
    scopes: Array<{ id: number; project_id: number; name: string }>;
    constraint_categories: Array<{ id: number; name: string }>;
    layers: Array<{ id: number; name: string }>;
    // v4.0+ tables
    decision_policies: Array<{ id: number; project_id: number; name: string; description: string | null; defaults: string | null; required_fields: string | null; validation_rules: string | null; quality_gates: string | null; suggest_similar: number; category: string | null; ts: number }>;
    tag_index: Array<{ id: number; tag: string; source_type: string; source_id: number; project_id: number; created_ts: number }>;
  };

  // Transaction tables (filtered by project_id)
  // Note: activity_log removed in v4.0, task/file system removed in v5.0
  transaction_tables: {
    decisions: any[];
    decisions_numeric: any[];
    decision_history: any[];
    decision_tags: any[];
    decision_scopes: any[];
    decision_context: any[];
    constraints: any[];
    constraint_tags: any[];
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
      id: project.id,
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

    // Get all projects (exclude 'default' fallback project)
    const projects = await knex('m_projects')
      .select('*')
      .where('name', '!=', 'default');
    projectIds = projects.map(p => p.id);
    projectData = projects.map(p => ({
      id: p.id,
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
      sqlew_version: SQLEW_VERSION,
      schema_version: SCHEMA_VERSION,  // major.minor from SQLEW_VERSION
      exported_at: exportTimestamp,
      export_mode: exportMode,
      database_type: databaseType,
    },
    // Legacy fields (backward compatibility)
    version: SQLEW_VERSION,
    exported_at: exportTimestamp,
    export_mode: exportMode,
    database_type: databaseType,
    master_tables: {
      context_keys: [],
      tags: [],
      scopes: [],
      constraint_categories: [],
      layers: [],
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
      constraints: [],
      constraint_tags: [],
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
 * Note: Task/file system removed in v5.0
 */
async function exportMasterTables(
  knex: Knex,
  projectIds: number[]
): Promise<JsonExport['master_tables']> {
  const masterTables: JsonExport['master_tables'] = {
    context_keys: [],
    tags: [],
    scopes: [],
    constraint_categories: [],
    layers: [],
    decision_policies: [],
    tag_index: [],
  };

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

  if (usedKeyIds.size > 0) {
    masterTables.context_keys = await knex('m_context_keys')
      .whereIn('id', Array.from(usedKeyIds))
      .select('id', 'key_name as key');
  }

  // Get used tag IDs from decision_tags and constraint_tags
  const usedTagIds = new Set<number>();

  // Join through parent table (t_decisions) to filter by project_id
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

  if (usedTagIds.size > 0) {
    masterTables.tags = await knex('m_tags')
      .whereIn('id', Array.from(usedTagIds))
      .select('id', 'project_id', 'name');
  }

  // Get used scope IDs from t_decision_scopes
  const usedScopeIds = new Set<number>();

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

  // Get used layer IDs from decisions and constraints
  const usedLayerIds = new Set<number>();

  const decisionLayers = await knex('t_decisions')
    .whereIn('project_id', projectIds)
    .whereNotNull('layer_id')
    .distinct('layer_id');
  decisionLayers.forEach(row => usedLayerIds.add(row.layer_id));

  const constraintLayers = await knex('t_constraints')
    .whereIn('project_id', projectIds)
    .whereNotNull('layer_id')
    .distinct('layer_id');
  constraintLayers.forEach(row => usedLayerIds.add(row.layer_id));

  if (usedLayerIds.size > 0) {
    masterTables.layers = await knex('m_layers')
      .whereIn('id', Array.from(usedLayerIds))
      .select('id', 'name');
  }

  // Export decision_policies (filtered by project_id)
  masterTables.decision_policies = await knex('t_decision_policies')
    .whereIn('project_id', projectIds)
    .select('id', 'project_id', 'name', 'description', 'defaults', 'required_fields', 'validation_rules', 'quality_gates', 'suggest_similar', 'category', 'ts');

  // Export tag_index (filtered by project_id)
  masterTables.tag_index = await knex('t_tag_index')
    .whereIn('project_id', projectIds)
    .select('id', 'tag', 'source_type', 'source_id', 'project_id', 'created_ts');

  return masterTables;
}

/**
 * Export transaction tables filtered by project_id
 * Note: Task/file system removed in v5.0
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
    constraints: [],
    constraint_tags: [],
  };

  // Export decision tables
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

  // Export constraint tables
  transactionTables.constraints = await knex('t_constraints')
    .whereIn('project_id', projectIds)
    .select('*');

  transactionTables.constraint_tags = await knex('t_constraint_tags as ct')
    .join('t_constraints as c', 'ct.constraint_id', 'c.id')
    .whereIn('c.project_id', projectIds)
    .select('ct.*');

  return transactionTables;
}
