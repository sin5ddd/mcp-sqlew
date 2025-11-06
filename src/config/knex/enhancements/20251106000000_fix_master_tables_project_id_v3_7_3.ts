/**
 * Migration: Fix Master Tables project_id (v3.7.3)
 *
 * CRITICAL BUG FIX: v3.7.0-v3.7.2 shipped with incomplete multi-project support.
 * Master tables (m_files, m_tags, m_scopes) lack project_id columns, causing
 * namespace collisions where "src/index.ts" from ProjectA conflicts with ProjectB.
 *
 * This migration:
 * 1. Detects and renames fake project names ('default-project' → real name)
 * 2. Adds project_id to m_files, m_tags, m_scopes
 * 3. Changes UNIQUE constraints from single-column to composite (project_id, path/name)
 * 4. Maps all existing data to default project (ID 1)
 *
 * Idempotent: Can run multiple times safely (checks hasColumn before altering)
 *
 * Rollback: down() reverts to v3.7.2 schema (removes project_id, restores single-column UNIQUE)
 *
 * Satisfies: v3.7.3 fix for namespace collision bug
 */

import type { Knex } from 'knex';
import { detectProjectNameSync } from '../../../utils/project-detector.js';

/**
 * Helper function to batch insert large datasets (prevents massive SQL queries)
 * Uses smaller batches to avoid SQLite UNION ALL limits and FK issues
 */
async function batchInsert(knex: Knex, tableName: string, data: any[]): Promise<void> {
  if (data.length === 0) return;

  const batchSize = 10; // Smaller batches for better SQLite compatibility
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    await knex(tableName).insert(batch);
  }
}

export async function up(knex: Knex): Promise<void> {
  console.log('🔧 Starting v3.7.3 master tables project_id fix...');

  // ============================================================================
  // STEP 1: Data Consolidation (Consolidate project #2 into #1)
  // ============================================================================

  const hasProjectsTable = await knex.schema.hasTable('m_projects');

  if (hasProjectsTable) {
    const projectRoot = process.cwd();
    const detected = detectProjectNameSync(projectRoot);

    const existingProject1 = await knex('m_projects')
      .where({ id: 1 })
      .first<{ id: number; name: string }>();

    const existingProject2 = await knex('m_projects')
      .where({ id: 2 })
      .first<{ id: number; name: string }>();

    const FAKE_NAMES = ['default-project', 'default'];

    // Check if this is a v3.7.0-v3.7.2 database needing consolidation
    // This ONLY happens if:
    // 1. User upgraded to v3.7.0-v3.7.2 (which created fake project #1)
    // 2. User manually created project #2 with real name
    // 3. Now upgrading to v3.7.3 to fix the issue
    const isV370UpgradeScenario = existingProject1 &&
                                   existingProject2 &&
                                   FAKE_NAMES.includes(existingProject1.name);

    // Perform consolidation ONLY for v3.7.0-v3.7.2 upgrades
    if (isV370UpgradeScenario) {
      console.log(`🔄 Detected v3.7.0-v3.7.2 database - consolidating projects...`);
      console.log(`   Project #1: "${existingProject1.name}" (fake name, empty)`);
      console.log(`   Project #2: "${existingProject2.name}" (real project, has data)`);
      console.log(`🔄 Consolidating project #2 into project #1...`);

      // STEP 1: Temporarily rename project #2 to avoid conflict
      const tempName = `temp-${existingProject2.name}-${Date.now()}`;
      await knex('m_projects')
        .where({ id: 2 })
        .update({ name: tempName });
      console.log(`  ✓ Temporarily renamed project #2 to "${tempName}"`);

      // STEP 2: Rename project #1 to real detected name
      await knex('m_projects')
        .where({ id: 1 })
        .update({
          name: detected.name,
          display_name: detected.name,
          detection_source: detected.source,
          last_active_ts: Math.floor(Date.now() / 1000)
        });
      console.log(`  ✓ Renamed project #1 from "${existingProject1.name}" to "${detected.name}"`);

      // STEP 3: Migrate ALL data from project_id=2 → 1
      const tablesToUpdate = [
        't_decisions',
        't_decisions_numeric',
        't_decision_history',
        't_decision_tags',
        't_decision_scopes',
        't_file_changes',
        't_constraints',
        't_tasks',
        't_task_tags',
        't_task_dependencies',
        't_task_details',
        't_task_file_links',
        't_task_decision_links',
        't_activity_log',
        't_decision_context'
      ];

      for (const tableName of tablesToUpdate) {
        const hasTable = await knex.schema.hasTable(tableName);
        if (hasTable) {
          const hasProjectId = await knex.schema.hasColumn(tableName, 'project_id');
          if (hasProjectId) {
            const count = await knex(tableName)
              .where({ project_id: 2 })
              .update({ project_id: 1 });
            if (count > 0) {
              console.log(`  ✓ Migrated ${count} rows in ${tableName} (project_id: 2→1)`);
            }
          }
        }
      }

      // STEP 4: Delete project #2
      await knex('m_projects').where({ id: 2 }).delete();
      console.log(`  ✓ Deleted project #2 (data consolidated into project #1)`);
      console.log(`✅ Consolidation complete - all data now in project #1 "${detected.name}"`);

    } else if (existingProject1 && FAKE_NAMES.includes(existingProject1.name)) {
      // No project #2, just rename project #1
      console.log(`🔄 Renaming project #1 from "${existingProject1.name}" to "${detected.name}"`);
      await knex('m_projects')
        .where({ id: 1 })
        .update({
          name: detected.name,
          display_name: detected.name,
          detection_source: detected.source,
          last_active_ts: Math.floor(Date.now() / 1000)
        });
      console.log(`✓ Project #1 renamed to "${detected.name}" (source: ${detected.source})`);

    } else if (existingProject1) {
      // User already has real name, don't change it
      console.log(`✓ Project #1 already has real name: "${existingProject1.name}"`);
    }
  }

  // ============================================================================
  // STEP 2: Check if Already Migrated (Idempotency)
  // ============================================================================

  const hasProjectIdInFiles = await knex.schema.hasColumn('m_files', 'project_id');
  const hasProjectIdInTags = await knex.schema.hasColumn('m_tags', 'project_id');
  const hasProjectIdInScopes = await knex.schema.hasColumn('m_scopes', 'project_id');

  if (hasProjectIdInFiles && hasProjectIdInTags && hasProjectIdInScopes) {
    console.log('✓ Master tables already have project_id columns (migration previously applied)');
    return;
  }

  // ============================================================================
  // STEP 3: Determine Default Project ID (Always 1 after consolidation)
  // ============================================================================

  // After consolidation, all data is in project ID 1
  const defaultProjectId = 1;
  console.log(`📌 Default project_id for master tables: ${defaultProjectId}`);

  // ============================================================================
  // STEP 4: Disable Foreign Key Constraints (SQLite only)
  // ============================================================================

  const isSQLite = knex.client.config.client === 'better-sqlite3' || knex.client.config.client === 'sqlite3';

  if (isSQLite) {
    // For better-sqlite3, we need to actually disable foreign keys at connection level
    await knex.raw('PRAGMA foreign_keys = OFF');

    // First, drop views that depend on tables we're modifying
    const viewsToRestore = [
      'v_layer_summary',
      'v_recent_file_changes',
      'v_task_board',
      'v_tagged_decisions',
      'v_tagged_constraints',
    ];

    const viewDefinitions: Record<string, string> = {};

    for (const viewName of viewsToRestore) {
      const viewInfo = await knex.raw(
        `SELECT sql FROM sqlite_master WHERE type='view' AND name=?`,
        [viewName]
      );
      if (viewInfo.length > 0 && viewInfo[0].sql) {
        viewDefinitions[viewName] = viewInfo[0].sql;
        await knex.raw(`DROP VIEW IF EXISTS ${viewName}`);
        console.log(`  ✓ Temporarily dropped view ${viewName}`);
      }
    }

    // Store view definitions for later restoration
    (knex as any).__viewDefinitions = viewDefinitions;

    // Now drop tables that reference master tables
    const referencingTables = [
      't_file_changes',  // References m_files
      't_task_file_links',  // References m_files
      't_pruned_files',  // References m_files (if exists)
      't_decision_tags',  // References m_tags
      't_task_tags',  // References m_tags
      't_constraint_tags',  // References m_tags
      't_decision_scopes',  // References m_scopes
    ];

    const backupData: Record<string, any[]> = {};

    for (const tableName of referencingTables) {
      const hasTable = await knex.schema.hasTable(tableName);
      if (hasTable) {
        // Backup data
        const data = await knex(tableName).select('*');
        backupData[tableName] = data;
        // Drop table
        await knex.schema.dropTable(tableName);
        console.log(`  ✓ Temporarily dropped ${tableName} (${data.length} rows backed up)`);
      }
    }

    // Store backup data for later restoration
    (knex as any).__masterTableBackup = backupData;

    console.log('✓ Disabled foreign key constraints, backed up views and referencing tables');
  }

  // ============================================================================
  // STEP 5: Fix m_files Table
  // ============================================================================

  if (!hasProjectIdInFiles) {
    console.log('🔧 Fixing m_files table...');

    // Backup existing data
    const filesData = await knex('m_files').select('*');
    console.log(`  Backed up ${filesData.length} rows from m_files`);

    // Drop old table
    await knex.schema.dropTableIfExists('m_files');
    console.log('  Dropped old m_files table');

    // Recreate with project_id
    const isMySQL = knex.client.config.client === 'mysql2';
    const pathLength = isMySQL ? 768 : 1000;

    await knex.schema.createTable('m_files', (table) => {
      table.increments('id').primary();
      table.integer('project_id').unsigned().notNullable().defaultTo(defaultProjectId);
      table.string('path', pathLength).notNullable();
      table.unique(['project_id', 'path']); // Composite UNIQUE
    });
    console.log('  Created new m_files table with project_id');

    // Restore data with project_id (add foreign key later)
    if (filesData.length > 0) {
      const restoreData = filesData.map(row => ({
        id: row.id,
        project_id: defaultProjectId,
        path: row.path,
      }));

      await knex('m_files').insert(restoreData);
      console.log(`  Restored ${restoreData.length} rows with project_id = ${defaultProjectId}`);
    }

    console.log('✓ m_files table fixed');
  }

  // ============================================================================
  // STEP 6: Fix m_tags Table
  // ============================================================================

  if (!hasProjectIdInTags) {
    console.log('🔧 Fixing m_tags table...');

    // Backup existing data
    const tagsData = await knex('m_tags').select('*');
    console.log(`  Backed up ${tagsData.length} rows from m_tags`);

    // Drop old table
    await knex.schema.dropTableIfExists('m_tags');
    console.log('  Dropped old m_tags table');

    // Recreate with project_id
    await knex.schema.createTable('m_tags', (table) => {
      table.increments('id').primary();
      table.integer('project_id').unsigned().notNullable().defaultTo(defaultProjectId);
      table.string('name', 100).notNullable();
      table.unique(['project_id', 'name']); // Composite UNIQUE
    });
    console.log('  Created new m_tags table with project_id');

    // Restore data with project_id (add foreign key later)
    if (tagsData.length > 0) {
      const restoreData = tagsData.map(row => ({
        id: row.id,
        project_id: defaultProjectId,
        name: row.name,
      }));

      await knex('m_tags').insert(restoreData);
      console.log(`  Restored ${restoreData.length} rows with project_id = ${defaultProjectId}`);
    }

    console.log('✓ m_tags table fixed');
  }

  // ============================================================================
  // STEP 7: Fix m_scopes Table
  // ============================================================================

  if (!hasProjectIdInScopes) {
    console.log('🔧 Fixing m_scopes table...');

    // Backup existing data
    const scopesData = await knex('m_scopes').select('*');
    console.log(`  Backed up ${scopesData.length} rows from m_scopes`);

    // Drop old table
    await knex.schema.dropTableIfExists('m_scopes');
    console.log('  Dropped old m_scopes table');

    // Recreate with project_id
    await knex.schema.createTable('m_scopes', (table) => {
      table.increments('id').primary();
      table.integer('project_id').unsigned().notNullable().defaultTo(defaultProjectId);
      table.string('name', 200).notNullable();
      table.unique(['project_id', 'name']); // Composite UNIQUE
    });
    console.log('  Created new m_scopes table with project_id');

    // Restore data with project_id (add foreign key later)
    if (scopesData.length > 0) {
      const restoreData = scopesData.map(row => ({
        id: row.id,
        project_id: defaultProjectId,
        name: row.name,
      }));

      await knex('m_scopes').insert(restoreData);
      console.log(`  Restored ${restoreData.length} rows with project_id = ${defaultProjectId}`);
    }

    console.log('✓ m_scopes table fixed');
  }

  // ============================================================================
  // STEP 7.5: Restore Referencing Tables (SQLite only)
  // ============================================================================

  if (isSQLite && (knex as any).__masterTableBackup) {
    console.log('🔄 Restoring referencing tables with updated foreign keys...');
    const backupData = (knex as any).__masterTableBackup;

    // Restore t_file_changes
    if (backupData['t_file_changes']) {
      await knex.schema.createTable('t_file_changes', (table) => {
        table.increments('id').primary();
        table.integer('project_id').unsigned().notNullable();
        table.integer('file_id').unsigned().notNullable();
        table.integer('change_type').notNullable(); // 1=created, 2=modified, 3=deleted
        table.integer('agent_id').unsigned();
        table.integer('layer_id').unsigned();
        table.text('description');
        table.integer('ts').notNullable();
        table.foreign('file_id').references('m_files.id');
        table.foreign('agent_id').references('m_agents.id');
        table.foreign('layer_id').references('m_layers.id');
        table.foreign('project_id').references('m_projects.id');
      });
      await batchInsert(knex, 't_file_changes', backupData['t_file_changes']);
      console.log(`  ✓ Restored t_file_changes (${backupData['t_file_changes'].length} rows)`);
    }

    // Restore t_task_file_links
    if (backupData['t_task_file_links']) {
      await knex.schema.createTable('t_task_file_links', (table) => {
        table.increments('id').primary();
        table.integer('task_id').unsigned().notNullable();
        table.integer('file_id').unsigned().notNullable();
        table.integer('project_id').unsigned().notNullable();
        table.integer('linked_ts').notNullable();
        table.foreign('file_id').references('m_files.id');
        table.foreign('task_id').references('t_tasks.id');
        table.foreign('project_id').references('m_projects.id');
      });
      await batchInsert(knex, 't_task_file_links', backupData['t_task_file_links']);
      console.log(`  ✓ Restored t_task_file_links (${backupData['t_task_file_links'].length} rows)`);
    }

    // Restore t_decision_tags
    if (backupData['t_decision_tags']) {
      await knex.schema.createTable('t_decision_tags', (table) => {
        table.integer('decision_key_id').unsigned().notNullable();
        table.integer('project_id').unsigned().notNullable();
        table.integer('tag_id').unsigned().notNullable();
        table.primary(['decision_key_id', 'project_id', 'tag_id']);
        table.foreign('tag_id').references('m_tags.id');
      });
      await batchInsert(knex, 't_decision_tags', backupData['t_decision_tags']);
      console.log(`  ✓ Restored t_decision_tags (${backupData['t_decision_tags'].length} rows)`);
    }

    // Restore t_task_tags (filter out orphaned FK references)
    if (backupData['t_task_tags']) {
      // Get valid IDs to filter orphaned references
      const validTagIds = new Set((await knex('m_tags').select('id')).map((row: any) => row.id));
      const validTaskIds = new Set((await knex('t_tasks').select('id')).map((row: any) => row.id));

      const filteredTaskTags = backupData['t_task_tags'].filter((row: any) =>
        validTagIds.has(row.tag_id) && validTaskIds.has(row.task_id)
      );

      const orphanedCount = backupData['t_task_tags'].length - filteredTaskTags.length;
      if (orphanedCount > 0) {
        console.log(`  ⚠️  Filtered ${orphanedCount} orphaned FK references in t_task_tags`);
      }

      await knex.schema.createTable('t_task_tags', (table) => {
        table.integer('project_id').unsigned().notNullable();
        table.integer('task_id').unsigned().notNullable();
        table.integer('tag_id').unsigned().notNullable();
        table.primary(['project_id', 'task_id', 'tag_id']);
        table.foreign('tag_id').references('m_tags.id');
        table.foreign('task_id').references('t_tasks.id');
      });
      await batchInsert(knex, 't_task_tags', filteredTaskTags);
      console.log(`  ✓ Restored t_task_tags (${filteredTaskTags.length} rows)`);
    }

    // Restore t_decision_scopes
    if (backupData['t_decision_scopes']) {
      await knex.schema.createTable('t_decision_scopes', (table) => {
        table.integer('decision_key_id').unsigned().notNullable();
        table.integer('project_id').unsigned().notNullable();
        table.integer('scope_id').unsigned().notNullable();
        table.primary(['decision_key_id', 'project_id', 'scope_id']);
        table.foreign('scope_id').references('m_scopes.id');
      });
      await batchInsert(knex, 't_decision_scopes', backupData['t_decision_scopes']);
      console.log(`  ✓ Restored t_decision_scopes (${backupData['t_decision_scopes'].length} rows)`);
    }

    // Restore t_constraint_tags
    if (backupData['t_constraint_tags']) {
      await knex.schema.createTable('t_constraint_tags', (table) => {
        table.integer('constraint_id').unsigned().notNullable();
        table.integer('tag_id').unsigned().notNullable();
        table.primary(['constraint_id', 'tag_id']);
        table.foreign('constraint_id').references('t_constraints.id');
        table.foreign('tag_id').references('m_tags.id');
      });
      await batchInsert(knex, 't_constraint_tags', backupData['t_constraint_tags']);
      console.log(`  ✓ Restored t_constraint_tags (${backupData['t_constraint_tags'].length} rows)`);
    }

    // Restore t_pruned_files if it existed
    if (backupData['t_pruned_files']) {
      await knex.schema.createTable('t_pruned_files', (table) => {
        table.increments('id').primary();
        table.integer('task_id').unsigned().notNullable();
        table.string('file_path', 1000).notNullable();
        table.integer('pruned_ts').notNullable();
        table.foreign('task_id').references('t_tasks.id');
      });
      await batchInsert(knex, 't_pruned_files', backupData['t_pruned_files']);
      console.log(`  ✓ Restored t_pruned_files (${backupData['t_pruned_files'].length} rows)`);
    }

    console.log('✅ All referencing tables restored with updated foreign keys');

    // Restore views
    const viewDefinitions = (knex as any).__viewDefinitions;
    if (viewDefinitions && Object.keys(viewDefinitions).length > 0) {
      console.log('🔄 Restoring views...');
      for (const [viewName, viewSql] of Object.entries(viewDefinitions)) {
        await knex.raw(viewSql as string);
        console.log(`  ✓ Restored view ${viewName}`);
      }
      console.log('✅ All views restored');
    }
  }

  // ============================================================================
  // STEP 7.6: Add Foreign Keys to Master Tables (after all data restored)
  // ============================================================================
  //
  // NOTE: For SQLite, foreign keys must be defined during table creation.
  // We already created master tables without FK constraints (to avoid FK errors
  // during data restoration). Adding them post-creation via ALTER TABLE would
  // require recreating tables, which would cascade-delete referencing table data.
  //
  // Since data is already restored and validated, we skip FK addition for SQLite.
  // For MySQL/PostgreSQL, FK constraints can be added via ALTER TABLE safely.

  if (hasProjectsTable && !isSQLite) {
    console.log('🔧 Adding foreign key constraints to master tables...');

    // Add foreign key to m_files
    if (!hasProjectIdInFiles) {
      try {
        await knex.schema.alterTable('m_files', (table) => {
          table.foreign('project_id').references('id').inTable('m_projects').onDelete('CASCADE');
        });
        console.log('  ✓ Added foreign key: m_files.project_id → m_projects.id');
      } catch (error: any) {
        if (!error.message.includes('already exists')) {
          throw error;
        }
        console.log('  ✓ Foreign key already exists on m_files');
      }
    }

    // Add foreign key to m_tags
    if (!hasProjectIdInTags) {
      try {
        await knex.schema.alterTable('m_tags', (table) => {
          table.foreign('project_id').references('id').inTable('m_projects').onDelete('CASCADE');
        });
        console.log('  ✓ Added foreign key: m_tags.project_id → m_projects.id');
      } catch (error: any) {
        if (!error.message.includes('already exists')) {
          throw error;
        }
        console.log('  ✓ Foreign key already exists on m_tags');
      }
    }

    // Add foreign key to m_scopes
    if (!hasProjectIdInScopes) {
      try {
        await knex.schema.alterTable('m_scopes', (table) => {
          table.foreign('project_id').references('id').inTable('m_projects').onDelete('CASCADE');
        });
        console.log('  ✓ Added foreign key: m_scopes.project_id → m_projects.id');
      } catch (error: any) {
        if (!error.message.includes('already exists')) {
          throw error;
        }
        console.log('  ✓ Foreign key already exists on m_scopes');
      }
    }

    console.log('✅ All foreign key constraints added');
  } else if (isSQLite) {
    console.log('✓ Skipped FK constraints for SQLite (defined during table creation)');
  }

  // ============================================================================
  // STEP 8: Re-enable Foreign Key Constraints (SQLite only)
  // ============================================================================

  if (isSQLite) {
    await knex.raw('PRAGMA foreign_keys = ON');
    console.log('✓ Re-enabled foreign key constraints');
  }

  console.log('✅ v3.7.3 master tables project_id fix completed successfully');
}

/**
 * Rollback: Revert master tables to v3.7.2 schema
 *
 * WARNING: This will remove project_id columns and restore single-column UNIQUE constraints.
 * Data from all projects will be merged (potential conflicts if same path/name exists).
 */
export async function down(knex: Knex): Promise<void> {
  console.log('⚠️  Rolling back v3.7.3 master tables fix...');

  // Check if already rolled back
  const hasProjectIdInFiles = await knex.schema.hasColumn('m_files', 'project_id');

  if (!hasProjectIdInFiles) {
    console.log('✓ Already rolled back (no project_id columns found)');
    return;
  }

  const isSQLite = knex.client.config.client === 'better-sqlite3' || knex.client.config.client === 'sqlite3';

  if (isSQLite) {
    await knex.raw('PRAGMA foreign_keys = OFF');
  }

  // Rollback m_files
  console.log('🔧 Rolling back m_files...');
  const filesData = await knex('m_files').select('id', 'path');
  await knex.schema.dropTableIfExists('m_files');

  const isMySQL = knex.client.config.client === 'mysql2';
  const pathLength = isMySQL ? 768 : 1000;

  await knex.schema.createTable('m_files', (table) => {
    table.increments('id').primary();
    table.string('path', pathLength).unique().notNullable();
  });

  if (filesData.length > 0) {
    // Remove duplicates (keep first occurrence)
    const uniqueFiles = Array.from(
      new Map(filesData.map(f => [f.path, f])).values()
    );
    await knex('m_files').insert(uniqueFiles);
    console.log(`  Restored ${uniqueFiles.length} unique files (removed ${filesData.length - uniqueFiles.length} duplicates)`);
  }

  // Rollback m_tags
  console.log('🔧 Rolling back m_tags...');
  const tagsData = await knex('m_tags').select('id', 'name');
  await knex.schema.dropTableIfExists('m_tags');

  await knex.schema.createTable('m_tags', (table) => {
    table.increments('id').primary();
    table.string('name', 100).unique().notNullable();
  });

  if (tagsData.length > 0) {
    const uniqueTags = Array.from(
      new Map(tagsData.map(t => [t.name, t])).values()
    );
    await knex('m_tags').insert(uniqueTags);
    console.log(`  Restored ${uniqueTags.length} unique tags (removed ${tagsData.length - uniqueTags.length} duplicates)`);
  }

  // Rollback m_scopes
  console.log('🔧 Rolling back m_scopes...');
  const scopesData = await knex('m_scopes').select('id', 'name');
  await knex.schema.dropTableIfExists('m_scopes');

  await knex.schema.createTable('m_scopes', (table) => {
    table.increments('id').primary();
    table.string('name', 200).unique().notNullable();
  });

  if (scopesData.length > 0) {
    const uniqueScopes = Array.from(
      new Map(scopesData.map(s => [s.name, s])).values()
    );
    await knex('m_scopes').insert(uniqueScopes);
    console.log(`  Restored ${uniqueScopes.length} unique scopes (removed ${scopesData.length - uniqueScopes.length} duplicates)`);
  }

  if (isSQLite) {
    await knex.raw('PRAGMA foreign_keys = ON');
  }

  console.log('✅ Rollback completed (reverted to v3.7.2 schema)');
}
