/**
 * Migration: Multi-Project Support v3.7.0 (Consolidated)
 *
 * Consolidates 4 separate migrations into a single comprehensive migration:
 * - 20251101000000_add_multi_project_support (enhancements)
 * - 20251104000000_multi_project_support_v3_7_0 (upgrades)
 * - 20251104000001_multi_project_fix_constraints (upgrades)
 * - 20251104000002_hotfix_missing_project_id (upgrades)
 *
 * Adds multi-project isolation support by:
 * 1. Creating m_projects master table
 * 2. Adding project_id to all transaction tables (14 tables)
 * 3. Updating PRIMARY KEY constraints to composite (key_id, project_id)
 * 4. Recreating m_config table with proper PRIMARY KEY structure
 * 5. Adding indexes for multi-project queries
 * 6. Recreating all views with project_id support
 *
 * Satisfies Constraints:
 * - #22 (CRITICAL): All transaction tables have project_id
 * - #23 (CRITICAL): m_projects table with name/detection_source
 * - #39 (HIGH): Composite indexes with project_id first
 */

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Check if migration already completed
  const hasProjectsTable = await knex.schema.hasTable('m_projects');
  const hasProjectIdInDecisions = await knex.schema.hasColumn('t_decisions', 'project_id');
  const hasMigrationMarker = await knex.schema.hasTable('_multi_project_pk_fixed');

  console.log(`🔍 Multi-project migration check:`);
  console.log(`   - m_projects: ${hasProjectsTable}`);
  console.log(`   - project_id in t_decisions: ${hasProjectIdInDecisions}`);
  console.log(`   - migration marker: ${hasMigrationMarker}`);

  // If fully migrated, skip
  if (hasProjectsTable && hasProjectIdInDecisions && hasMigrationMarker) {
    console.log('✓ Multi-project schema already migrated, skipping');
    return;
  }

  console.log('🔄 Starting multi-project support migration v3.7.0 (consolidated)...');

  // Disable foreign key constraints temporarily for SQLite
  await knex.raw('PRAGMA foreign_keys = OFF');
  console.log('✓ Disabled foreign key constraints');

  // ============================================================================
  // STEP 1: Create m_projects Master Table
  // ============================================================================

  let defaultProjectId: number;

  if (!hasProjectsTable) {
    await knex.schema.createTable('m_projects', (table) => {
      table.increments('id').primary();
      table.string('name', 64).notNullable().unique();
      table.string('display_name', 128);
      table.string('detection_source', 20).notNullable(); // 'cli' | 'config' | 'git' | 'metadata' | 'directory'
      table.string('project_root_path', 512);
      table.integer('created_ts').notNullable();
      table.integer('last_active_ts').notNullable();
      table.text('metadata'); // JSON string for extensibility
    });

    // Insert default project for existing data
    const now = Math.floor(Date.now() / 1000);
    await knex('m_projects').insert({
      id: 1,
      name: 'default-project',
      display_name: 'Default Project (Migrated)',
      detection_source: 'directory',
      created_ts: now,
      last_active_ts: now,
    });

    defaultProjectId = 1;
    console.log(`✓ Created m_projects table with default project (ID: ${defaultProjectId})`);
  } else {
    // Use existing first project as default
    const firstProject = await knex('m_projects').orderBy('id').first<{ id: number }>();
    defaultProjectId = firstProject?.id || 1;
    console.log(`✓ Using existing project ID ${defaultProjectId} as default`);
  }

  // ============================================================================
  // STEP 2: Drop All Views and Triggers (Before Table Modifications)
  // ============================================================================

  // Drop ALL views (including old schema views)
  const views = await knex.raw(`SELECT name FROM sqlite_master WHERE type='view'`);
  for (const view of views) {
    await knex.raw(`DROP VIEW IF EXISTS ${view.name}`);
  }
  console.log(`✓ Dropped all ${views.length} views before table modifications`);

  // Drop ALL triggers (old schema compatibility)
  const triggers = await knex.raw(`SELECT name FROM sqlite_master WHERE type='trigger'`);
  for (const trigger of triggers) {
    await knex.raw(`DROP TRIGGER IF EXISTS ${trigger.name}`);
  }
  console.log(`✓ Dropped all ${triggers.length} triggers before table modifications`);

  // Drop old t_agent_messages table if exists (removed in v3.6.5)
  await knex.schema.dropTableIfExists('t_agent_messages');
  console.log('✓ Dropped t_agent_messages if it existed (removed in v3.6.5)');

  // ============================================================================
  // STEP 3: Add project_id to Transaction Tables
  // ============================================================================

  // Helper function to add project_id column using raw SQL (more reliable for old schemas)
  async function addProjectIdColumn(tableName: string, knex: Knex, defaultProjectId: number): Promise<void> {
    const hasColumn = await knex.schema.hasColumn(tableName, 'project_id');
    if (!hasColumn) {
      // Use raw SQL to avoid Knex's schema parsing issues with old schemas
      await knex.raw(`ALTER TABLE ${tableName} ADD COLUMN project_id INTEGER NOT NULL DEFAULT ${defaultProjectId}`);
      // Add foreign key separately
      await knex.raw(`CREATE INDEX IF NOT EXISTS idx_${tableName}_project ON ${tableName}(project_id)`);
      console.log(`✓ Added project_id to ${tableName}`);
    } else {
      console.log(`  ⏭  ${tableName} already has project_id, skipping`);
    }
  }

  // Transaction tables that need project_id
  // Note: t_decision_context is handled separately in Step 4 (after PRIMARY KEY fix)
  const transactionTables = [
    't_decision_history',
    't_decision_tags',
    't_decision_scopes',
    't_file_changes',
    't_constraints',
    't_tasks',
    't_task_details',
    't_task_tags',
    't_task_file_links',
    't_task_decision_links',
    't_task_dependencies',
  ];

  for (const tableName of transactionTables) {
    await addProjectIdColumn(tableName, knex, defaultProjectId);
  }

  // ============================================================================
  // STEP 4: Fix PRIMARY KEY Constraints (t_decisions tables)
  // ============================================================================

  // For SQLite, we need to recreate tables to change PRIMARY KEY from single-column
  // to composite (key_id, project_id)

  if (!hasMigrationMarker) {
    console.log('🔄 Fixing PRIMARY KEY constraints for t_decisions tables...');

    // Drop t_decision_context temporarily (has FK to t_decisions)
    let decisionContextData: any[] = [];
    const hasDecisionContext = await knex.schema.hasTable('t_decision_context');
    if (hasDecisionContext) {
      decisionContextData = await knex('t_decision_context').select('*');
      await knex.schema.dropTable('t_decision_context');
      console.log('✓ Temporarily dropped t_decision_context (will recreate)');
    }

    // 4a. t_decisions
    const decisionsData = await knex('t_decisions').select('*');

    await knex.schema.dropTableIfExists('t_decisions');
    await knex.schema.createTable('t_decisions', (table) => {
      table.integer('key_id').unsigned().notNullable();
      table.integer('project_id').unsigned().notNullable().defaultTo(defaultProjectId);
      table.text('value').notNullable();
      table.integer('agent_id').unsigned();
      table.integer('layer_id').unsigned();
      table.string('version', 20).defaultTo('1.0.0');
      table.integer('status').defaultTo(1);
      table.integer('ts').notNullable();

      // Composite PRIMARY KEY
      table.primary(['key_id', 'project_id']);

      // Foreign keys
      table.foreign('key_id').references('m_context_keys.id');
      table.foreign('agent_id').references('m_agents.id');
      table.foreign('layer_id').references('m_layers.id');
      table.foreign('project_id').references('m_projects.id').onDelete('CASCADE');
    });

    if (decisionsData.length > 0) {
      // Ensure project_id is set for existing data
      await knex('t_decisions').insert(
        decisionsData.map((row: any) => ({
          ...row,
          project_id: row.project_id || defaultProjectId,
        }))
      );
    }

    console.log(`✓ Recreated t_decisions with composite PRIMARY KEY (${decisionsData.length} rows)`);

    // 4b. t_decisions_numeric
    const decisionsNumericData = await knex('t_decisions_numeric').select('*');

    await knex.schema.dropTableIfExists('t_decisions_numeric');
    await knex.schema.createTable('t_decisions_numeric', (table) => {
      table.integer('key_id').unsigned().notNullable();
      table.integer('project_id').unsigned().notNullable().defaultTo(defaultProjectId);
      table.double('value').notNullable();
      table.integer('agent_id').unsigned();
      table.integer('layer_id').unsigned();
      table.string('version', 20).defaultTo('1.0.0');
      table.integer('status').defaultTo(1);
      table.integer('ts').notNullable();

      // Composite PRIMARY KEY
      table.primary(['key_id', 'project_id']);

      // Foreign keys
      table.foreign('key_id').references('m_context_keys.id');
      table.foreign('agent_id').references('m_agents.id');
      table.foreign('layer_id').references('m_layers.id');
      table.foreign('project_id').references('m_projects.id').onDelete('CASCADE');
    });

    if (decisionsNumericData.length > 0) {
      await knex('t_decisions_numeric').insert(
        decisionsNumericData.map((row: any) => ({
          ...row,
          project_id: row.project_id || defaultProjectId,
        }))
      );
    }

    console.log(`✓ Recreated t_decisions_numeric with composite PRIMARY KEY (${decisionsNumericData.length} rows)`);

    // Create migration marker
    await knex.schema.createTable('_multi_project_pk_fixed', (table) => {
      table.integer('applied_ts').notNullable();
    });

    await knex('_multi_project_pk_fixed').insert({
      applied_ts: Math.floor(Date.now() / 1000),
    });

    console.log('✓ Created migration marker table');

    // Recreate t_decision_context if it existed
    if (hasDecisionContext) {
      await knex.schema.createTable('t_decision_context', (table) => {
        table.increments('id').primary();
        table.integer('decision_key_id').unsigned().notNullable();
        table.text('rationale');
        table.text('alternatives'); // JSON array
        table.text('tradeoffs'); // JSON object
        table.integer('decided_by_agent_id').unsigned();
        table.integer('decision_date').notNullable().defaultTo(knex.raw('(unixepoch())'));
        table.integer('related_task_id').unsigned();
        table.integer('related_constraint_id').unsigned();
        table.integer('ts').notNullable().defaultTo(knex.raw('(unixepoch())'));
        table.integer('project_id').unsigned().notNullable().defaultTo(defaultProjectId);

        // Foreign keys
        table.foreign('decision_key_id').references('m_context_keys.id');
        table.foreign('decided_by_agent_id').references('m_agents.id');
        table.foreign('related_task_id').references('t_tasks.id').onDelete('SET NULL');
        table.foreign('related_constraint_id').references('t_constraints.id').onDelete('SET NULL');
        table.foreign('project_id').references('m_projects.id').onDelete('CASCADE');

        // Unique constraint
        table.unique(['decision_key_id', 'id']);
      });

      // Restore data with project_id
      if (decisionContextData.length > 0) {
        await knex('t_decision_context').insert(
          decisionContextData.map((row: any) => ({
            ...row,
            project_id: row.project_id || defaultProjectId,
          }))
        );
      }

      console.log(`✓ Recreated t_decision_context (${decisionContextData.length} rows)`);
    }
  } else {
    console.log('✓ PRIMARY KEY constraints already fixed, skipping');
  }

  // ============================================================================
  // STEP 5: Recreate m_config Table
  // ============================================================================

  // m_config needs special handling to avoid nullable composite PRIMARY KEY
  // We use a single-column PRIMARY KEY on 'key' and project_id is nullable

  const configHasProjectId = await knex.schema.hasColumn('m_config', 'project_id');

  if (!configHasProjectId) {
    console.log('🔄 Recreating m_config table with multi-project support...');

    // Drop temp table if exists from previous partial run
    await knex.schema.dropTableIfExists('m_config_new');

    // Create new m_config table with project_id
    await knex.schema.createTable('m_config_new', (table) => {
      table.string('key', 64).notNullable();
      table.integer('project_id').unsigned().nullable(); // Nullable for global config
      table.text('value').notNullable();

      // Single-column PRIMARY KEY (key only)
      table.primary(['key']);

      // Foreign key with CASCADE delete
      table.foreign('project_id').references('id').inTable('m_projects').onDelete('CASCADE');

      // Composite index for project-scoped lookups
      table.index(['project_id', 'key'], 'idx_config_project_key');
    });

    // Migrate existing config data
    const existingConfig = await knex('m_config').select('key', 'value');
    if (existingConfig.length > 0) {
      await knex('m_config_new').insert(
        existingConfig.map((row: any) => ({
          key: row.key,
          project_id: null, // Global config has NULL project_id
          value: row.value,
        }))
      );
    }

    // Swap tables
    await knex.schema.dropTable('m_config');
    await knex.schema.renameTable('m_config_new', 'm_config');

    console.log(`✓ Recreated m_config table (${existingConfig.length} rows migrated)`);
  } else {
    console.log('✓ m_config already has project_id, skipping');
  }

  // ============================================================================
  // STEP 6: Create Composite Indexes (Constraint #39)
  // ============================================================================

  // All multi-project indexes should have project_id first for optimal performance
  const indexes = [
    { table: 't_decisions', columns: ['project_id', 'key_id'], name: 'idx_decisions_project_key' },
    { table: 't_decisions', columns: ['project_id', 'ts'], name: 'idx_decisions_project_ts' },
    { table: 't_decisions_numeric', columns: ['project_id', 'key_id'], name: 'idx_decisions_numeric_project_key' },
    { table: 't_decision_tags', columns: ['project_id', 'decision_key_id'], name: 'idx_decision_tags_project_key' },
    { table: 't_tasks', columns: ['project_id', 'status_id'], name: 'idx_tasks_project_status' },
    { table: 't_tasks', columns: ['project_id', 'created_ts'], name: 'idx_tasks_project_created' },
  ];

  for (const { table, columns, name } of indexes) {
    try {
      // Check if index already exists
      const indexCheck = await knex.raw(
        `SELECT name FROM sqlite_master WHERE type='index' AND name=?`,
        [name]
      );

      if (!indexCheck || indexCheck.length === 0) {
        await knex.schema.alterTable(table, (tbl) => {
          tbl.index(columns, name);
        });
        console.log(`✓ Created index ${name}`);
      } else {
        console.log(`  ⏭  Index ${name} already exists, skipping`);
      }
    } catch (error: any) {
      // Ignore duplicate index errors
      if (!error.message.includes('already exists')) {
        throw error;
      }
      console.log(`  ⏭  Index ${name} already exists, skipping`);
    }
  }

  // ============================================================================
  // STEP 7: Recreate All Views with Multi-Project Support
  // ============================================================================

  console.log('🔄 Recreating views with multi-project support...');

  // v_tagged_decisions
  await knex.raw(`
    CREATE VIEW v_tagged_decisions AS
    SELECT
        k.key,
        d.value,
        d.project_id,
        l.name as layer,
        a.name as decided_by,
        datetime(d.ts, 'unixepoch') as updated,
        GROUP_CONCAT(t.tag, ', ') as tags
    FROM t_decisions d
    JOIN m_context_keys k ON d.key_id = k.id
    LEFT JOIN m_layers l ON d.layer_id = l.id
    LEFT JOIN m_agents a ON d.agent_id = a.id
    LEFT JOIN t_decision_tags dt ON d.key_id = dt.key_id AND d.project_id = dt.project_id
    LEFT JOIN m_tags t ON dt.tag_id = t.id
    WHERE d.status = 1
    GROUP BY d.key_id, d.project_id, k.key, d.value, l.name, a.name, d.ts
    ORDER BY d.ts DESC
  `);

  // v_active_context
  await knex.raw(`
    CREATE VIEW v_active_context AS
    SELECT
        k.key,
        d.value,
        d.project_id,
        l.name as layer,
        a.name as decided_by,
        datetime(d.ts, 'unixepoch') as updated
    FROM t_decisions d
    JOIN m_context_keys k ON d.key_id = k.id
    LEFT JOIN m_layers l ON d.layer_id = l.id
    LEFT JOIN m_agents a ON d.agent_id = a.id
    WHERE d.status = 1 AND d.ts > (strftime('%s','now') - 3600)
    ORDER BY d.ts DESC
  `);

  // v_layer_summary
  await knex.raw(`
    CREATE VIEW v_layer_summary AS
    SELECT l.name as layer,
           COUNT(*) as decision_count
    FROM t_decisions d
    JOIN m_layers l ON d.layer_id = l.id
    WHERE d.status = 1
    GROUP BY l.id, l.name
    ORDER BY decision_count DESC
  `);

  // v_recent_file_changes
  await knex.raw(`
    CREATE VIEW v_recent_file_changes AS
    SELECT f.path as file_path,
           fc.project_id,
           l.name as layer,
           a.name as changed_by,
           datetime(fc.ts, 'unixepoch') as changed_at
    FROM t_file_changes fc
    JOIN m_files f ON fc.file_id = f.id
    LEFT JOIN m_layers l ON fc.layer_id = l.id
    LEFT JOIN m_agents a ON fc.agent_id = a.id
    ORDER BY fc.ts DESC
    LIMIT 50
  `);

  // v_tagged_constraints
  await knex.raw(`
    CREATE VIEW v_tagged_constraints AS
    SELECT c.id,
           c.constraint_text,
           c.project_id,
           cat.name as category,
           c.priority,
           a.name as author,
           datetime(c.ts, 'unixepoch') as created
    FROM t_constraints c
    LEFT JOIN m_constraint_categories cat ON c.category_id = cat.id
    LEFT JOIN m_agents a ON c.agent_id = a.id
    WHERE c.active = 1
    ORDER BY c.priority DESC, c.ts DESC
  `);

  // v_task_board
  await knex.raw(`
    CREATE VIEW v_task_board AS
    SELECT t.id,
           t.title,
           t.project_id,
           ts.name as status,
           t.priority,
           a.name as assigned_to,
           datetime(t.created_ts, 'unixepoch') as created,
           datetime(t.updated_ts, 'unixepoch') as updated
    FROM t_tasks t
    JOIN m_task_statuses ts ON t.status_id = ts.id
    LEFT JOIN m_agents a ON t.assigned_agent_id = a.id
    ORDER BY t.priority DESC, t.created_ts DESC
  `);

  console.log('✓ Recreated all 6 views with project_id support');

  // ============================================================================
  // STEP 8: Re-enable Foreign Key Constraints
  // ============================================================================

  await knex.raw('PRAGMA foreign_keys = ON');
  console.log('✓ Re-enabled foreign key constraints');

  console.log('✅ Multi-project support migration v3.7.0 completed successfully');
}

export async function down(knex: Knex): Promise<void> {
  console.log('🔄 Rolling back multi-project support migration...');

  // Drop views
  await knex.raw('DROP VIEW IF EXISTS v_tagged_decisions');
  await knex.raw('DROP VIEW IF EXISTS v_active_context');
  await knex.raw('DROP VIEW IF EXISTS v_layer_summary');
  await knex.raw('DROP VIEW IF EXISTS v_recent_file_changes');
  await knex.raw('DROP VIEW IF EXISTS v_tagged_constraints');
  await knex.raw('DROP VIEW IF EXISTS v_task_board');

  // Drop indexes
  const indexes = [
    'idx_decisions_project_key',
    'idx_decisions_project_ts',
    'idx_decisions_numeric_project_key',
    'idx_decision_tags_project_key',
    'idx_tasks_project_status',
    'idx_tasks_project_created',
    'idx_config_project_key',
  ];

  for (const indexName of indexes) {
    await knex.raw(`DROP INDEX IF EXISTS ${indexName}`);
  }

  // Restore m_config to original structure
  const configHasProjectId = await knex.schema.hasColumn('m_config', 'project_id');
  if (configHasProjectId) {
    await knex.schema.dropTableIfExists('m_config_old');

    await knex.schema.createTable('m_config_old', (table) => {
      table.string('key', 64).primary();
      table.text('value').notNullable();
    });

    const configData = await knex('m_config').where({ project_id: null }).select('key', 'value');
    if (configData.length > 0) {
      await knex('m_config_old').insert(configData);
    }

    await knex.schema.dropTable('m_config');
    await knex.schema.renameTable('m_config_old', 'm_config');
  }

  // Restore t_decisions tables to single-column PRIMARY KEY
  const decisionsData = await knex('t_decisions').select('*');

  await knex.schema.dropTableIfExists('t_decisions');
  await knex.schema.createTable('t_decisions', (table) => {
    table.integer('key_id').unsigned().primary();
    table.text('value').notNullable();
    table.integer('agent_id').unsigned();
    table.integer('layer_id').unsigned();
    table.string('version', 20).defaultTo('1.0.0');
    table.integer('status').defaultTo(1);
    table.integer('ts').notNullable();

    table.foreign('key_id').references('m_context_keys.id');
    table.foreign('agent_id').references('m_agents.id');
    table.foreign('layer_id').references('m_layers.id');
  });

  // Note: Data may be lost if there were multiple projects
  if (decisionsData.length > 0) {
    await knex('t_decisions').insert(
      decisionsData.map((row: any) => {
        const { project_id, ...rest } = row;
        return rest;
      })
    );
  }

  // Same for t_decisions_numeric
  const decisionsNumericData = await knex('t_decisions_numeric').select('*');

  await knex.schema.dropTableIfExists('t_decisions_numeric');
  await knex.schema.createTable('t_decisions_numeric', (table) => {
    table.integer('key_id').unsigned().primary();
    table.double('value').notNullable();
    table.integer('agent_id').unsigned();
    table.integer('layer_id').unsigned();
    table.string('version', 20).defaultTo('1.0.0');
    table.integer('status').defaultTo(1);
    table.integer('ts').notNullable();

    table.foreign('key_id').references('m_context_keys.id');
    table.foreign('agent_id').references('m_agents.id');
    table.foreign('layer_id').references('m_layers.id');
  });

  if (decisionsNumericData.length > 0) {
    await knex('t_decisions_numeric').insert(
      decisionsNumericData.map((row: any) => {
        const { project_id, ...rest } = row;
        return rest;
      })
    );
  }

  // Remove project_id from all transaction tables
  const transactionTables = [
    't_task_dependencies',
    't_task_decision_links',
    't_task_file_links',
    't_task_tags',
    't_task_details',
    't_tasks',
    't_constraints',
    't_file_changes',
    't_decision_context',
    't_decision_scopes',
    't_decision_tags',
    't_decision_history',
  ];

  for (const tableName of transactionTables) {
    const hasTable = await knex.schema.hasTable(tableName);
    if (hasTable) {
      const hasColumn = await knex.schema.hasColumn(tableName, 'project_id');
      if (hasColumn) {
        await knex.schema.alterTable(tableName, (table) => {
          table.dropColumn('project_id');
        });
        console.log(`✓ Removed project_id from ${tableName}`);
      }
    }
  }

  // Drop migration marker
  await knex.schema.dropTableIfExists('_multi_project_pk_fixed');

  // Drop m_projects table
  await knex.schema.dropTableIfExists('m_projects');

  // Recreate original views (without project_id)
  await knex.raw(`
    CREATE VIEW v_tagged_decisions AS
    SELECT
        k.key,
        d.value,
        l.name as layer,
        a.name as decided_by,
        datetime(d.ts, 'unixepoch') as updated,
        GROUP_CONCAT(t.tag, ', ') as tags
    FROM t_decisions d
    JOIN m_context_keys k ON d.key_id = k.id
    LEFT JOIN m_layers l ON d.layer_id = l.id
    LEFT JOIN m_agents a ON d.agent_id = a.id
    LEFT JOIN t_decision_tags dt ON d.key_id = dt.key_id
    LEFT JOIN m_tags t ON dt.tag_id = t.id
    WHERE d.status = 1
    GROUP BY d.key_id
    ORDER BY d.ts DESC
  `);

  await knex.raw(`
    CREATE VIEW v_active_context AS
    SELECT
        k.key,
        d.value,
        l.name as layer,
        a.name as decided_by,
        datetime(d.ts, 'unixepoch') as updated
    FROM t_decisions d
    JOIN m_context_keys k ON d.key_id = k.id
    LEFT JOIN m_layers l ON d.layer_id = l.id
    LEFT JOIN m_agents a ON d.agent_id = a.id
    WHERE d.status = 1 AND d.ts > (strftime('%s','now') - 3600)
    ORDER BY d.ts DESC
  `);

  await knex.raw(`
    CREATE VIEW v_layer_summary AS
    SELECT l.name as layer,
           COUNT(*) as decision_count
    FROM t_decisions d
    JOIN m_layers l ON d.layer_id = l.id
    WHERE d.status = 1
    GROUP BY l.id, l.name
    ORDER BY decision_count DESC
  `);

  await knex.raw(`
    CREATE VIEW v_recent_file_changes AS
    SELECT f.path as file_path,
           l.name as layer,
           a.name as changed_by,
           datetime(fc.ts, 'unixepoch') as changed_at
    FROM t_file_changes fc
    JOIN m_files f ON fc.file_id = f.id
    LEFT JOIN m_layers l ON fc.layer_id = l.id
    LEFT JOIN m_agents a ON fc.agent_id = a.id
    ORDER BY fc.ts DESC
    LIMIT 50
  `);

  await knex.raw(`
    CREATE VIEW v_tagged_constraints AS
    SELECT c.id,
           c.constraint_text,
           cat.name as category,
           c.priority,
           a.name as author,
           datetime(c.ts, 'unixepoch') as created
    FROM t_constraints c
    LEFT JOIN m_constraint_categories cat ON c.category_id = cat.id
    LEFT JOIN m_agents a ON c.agent_id = a.id
    WHERE c.active = 1
    ORDER BY c.priority DESC, c.ts DESC
  `);

  await knex.raw(`
    CREATE VIEW v_task_board AS
    SELECT t.id,
           t.title,
           ts.name as status,
           t.priority,
           a.name as assigned_to,
           datetime(t.created_ts, 'unixepoch') as created,
           datetime(t.updated_ts, 'unixepoch') as updated
    FROM t_tasks t
    JOIN m_task_statuses ts ON t.status_id = ts.id
    LEFT JOIN m_agents a ON t.assigned_agent_id = a.id
    ORDER BY t.priority DESC, t.created_ts DESC
  `);

  console.log('✅ Multi-project rollback completed');
}
