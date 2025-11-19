/**
 * Migration: Decision Intelligence System v3.9.0
 *
 * Transforms template system into comprehensive Decision Intelligence System:
 * 1. Renames t_decision_templates → t_decision_policies
 * 2. Adds validation_rules, quality_gates, suggest_similar, category columns
 * 3. Creates m_tag_index for fast tag-based suggestions
 * 4. Populates tag index from existing data
 * 5. Adds auto-population trigger (SQLite only, MySQL/PostgreSQL pending)
 * 6. Updates built-in policies with validation rules and quality gates
 * 7. Creates t_task_pruned_files table (missing from bootstrap schema)
 *
 * Satisfies Constraints:
 * - #398: Policy schema changes for Decision Intelligence System
 * - Fixes missing t_task_pruned_files table in fresh installations
 * - Idempotent: Can be run multiple times safely
 * - Cross-DB Compatible: SQLite (full), MySQL/PostgreSQL (partial trigger support)
 */

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  console.log('🔄 Starting Decision Intelligence System migration v3.9.0...');

  const client = knex.client.config.client;
  const isSQLite = client === 'sqlite3' || client === 'better-sqlite3';

  // ============================================================================
  // STEP 1: Rename t_decision_templates → t_decision_policies
  // ============================================================================

  const hasOldTable = await knex.schema.hasTable('t_decision_templates');
  const hasNewTable = await knex.schema.hasTable('t_decision_policies');

  if (hasOldTable && !hasNewTable) {
    console.log('🔄 Renaming t_decision_templates → t_decision_policies...');
    await knex.schema.renameTable('t_decision_templates', 't_decision_policies');
    console.log('✓ Table renamed successfully');
  } else if (hasNewTable) {
    console.log('✓ t_decision_policies already exists, skipping rename');
  } else if (!hasOldTable && !hasNewTable) {
    console.log('⚠️  Neither t_decision_templates nor t_decision_policies exists - will create new table');

    // Create new table if neither exists (fresh install scenario)
    await knex.schema.createTable('t_decision_policies', (table) => {
      table.increments('id').primary();
      table.string('name', 200).notNullable();
      table.integer('project_id').notNullable().references('id').inTable('m_projects').onDelete('CASCADE');
      table.text('description');
      table.text('defaults'); // JSON
      table.text('required_fields'); // JSON
      table.integer('created_by').nullable().references('id').inTable('m_agents').onDelete('SET NULL');
      table.integer('ts').notNullable().defaultTo(knex.raw('(strftime(\'%s\', \'now\'))'));

      // UNIQUE constraint on (name, project_id)
      table.unique(['name', 'project_id']);
    });
    console.log('✓ Created t_decision_policies table');
  }

  // ============================================================================
  // STEP 1.5: Add project_id if migrating from v3.7.x (post-multi-project)
  // ============================================================================

  const hasProjectId = await knex.schema.hasColumn('t_decision_policies', 'project_id');
  const hasCreatedBy = await knex.schema.hasColumn('t_decision_policies', 'created_by');
  const hasTs = await knex.schema.hasColumn('t_decision_policies', 'ts');

  if (!hasProjectId || !hasCreatedBy || !hasTs) {
    console.log('🔄 Adding missing columns to t_decision_policies (v3.7.x → v3.9.0 migration)...');

    await knex.schema.alterTable('t_decision_policies', (table) => {
      if (!hasProjectId) {
        // Note: Foreign key constraints cannot be added to existing tables in SQLite
        // The constraint exists in fresh installs (line 46) but not when migrating
        table.integer('project_id').notNullable().defaultTo(1);
      }
      if (!hasCreatedBy) {
        table.integer('created_by').nullable();
      }
      if (!hasTs) {
        table.integer('ts').notNullable().defaultTo(knex.raw('(strftime(\'%s\', \'now\'))'));
      }
    });

    // Add composite unique constraint if project_id was just added
    if (!hasProjectId) {
      await knex.schema.alterTable('t_decision_policies', (table) => {
        table.unique(['name', 'project_id']);
      });
    }

    const added = [];
    if (!hasProjectId) added.push('project_id');
    if (!hasCreatedBy) added.push('created_by');
    if (!hasTs) added.push('ts');

    console.log(`✓ Added columns: ${added.join(', ')}`);
  } else {
    console.log('✓ All policy table columns already exist, skipping');
  }

  // ============================================================================
  // STEP 2: Add New Columns to t_decision_policies
  // ============================================================================

  const hasValidation = await knex.schema.hasColumn('t_decision_policies', 'validation_rules');
  const hasQualityGates = await knex.schema.hasColumn('t_decision_policies', 'quality_gates');
  const hasSuggestSimilar = await knex.schema.hasColumn('t_decision_policies', 'suggest_similar');
  const hasCategory = await knex.schema.hasColumn('t_decision_policies', 'category');

  if (!hasValidation || !hasQualityGates || !hasSuggestSimilar || !hasCategory) {
    console.log('🔄 Adding new columns to t_decision_policies...');

    await knex.schema.alterTable('t_decision_policies', (table) => {
      if (!hasValidation) {
        table.text('validation_rules'); // JSON: pattern enforcement
      }
      if (!hasQualityGates) {
        table.text('quality_gates'); // JSON: completeness requirements
      }
      if (!hasSuggestSimilar) {
        table.integer('suggest_similar').defaultTo(0); // Trigger suggestions
      }
      if (!hasCategory) {
        table.text('category'); // Group policies
      }
    });

    console.log('✓ Added columns: validation_rules, quality_gates, suggest_similar, category');
  } else {
    console.log('✓ All new columns already exist, skipping');
  }

  // ============================================================================
  // STEP 3: Create Tag Index Table
  // ============================================================================

  const hasTagIndex = await knex.schema.hasTable('m_tag_index');
  if (!hasTagIndex) {
    console.log('🔄 Creating m_tag_index table...');

    await knex.schema.createTable('m_tag_index', (table) => {
      table.text('tag_name').notNullable();
      table.integer('decision_id').notNullable();

      // Composite PRIMARY KEY
      table.primary(['tag_name', 'decision_id']);

      // Note: No foreign key constraint due to t_decisions composite PRIMARY KEY (key_id, project_id)
      // This is a denormalized index table for fast tag-based suggestions
      // Integrity maintained by triggers and cleanup operations

      // Index for fast decision lookup
      table.index('decision_id', 'idx_tag_index_decision');
    });

    console.log('✓ Created m_tag_index table (denormalized index)');
  } else {
    console.log('✓ m_tag_index already exists, skipping');
  }

  // ============================================================================
  // STEP 4: Populate Tag Index from Existing Data
  // ============================================================================

  if (!hasTagIndex) {
    console.log('🔄 Populating m_tag_index from existing tags...');

    // Use INSERT OR IGNORE for SQLite idempotency
    if (isSQLite) {
      await knex.raw(`
        INSERT OR IGNORE INTO m_tag_index (tag_name, decision_id)
        SELECT t.name, dt.decision_key_id
        FROM t_decision_tags dt
        JOIN m_tags t ON dt.tag_id = t.id
      `);
    } else {
      // MySQL/PostgreSQL: Use INSERT IGNORE or ON DUPLICATE KEY
      const dbType = client === 'mysql' || client === 'mysql2' ? 'mysql' : 'postgres';

      if (dbType === 'mysql') {
        await knex.raw(`
          INSERT IGNORE INTO m_tag_index (tag_name, decision_id)
          SELECT t.name, dt.decision_key_id
          FROM t_decision_tags dt
          JOIN m_tags t ON dt.tag_id = t.id
        `);
      } else {
        // PostgreSQL
        await knex.raw(`
          INSERT INTO m_tag_index (tag_name, decision_id)
          SELECT t.name, dt.decision_key_id
          FROM t_decision_tags dt
          JOIN m_tags t ON dt.tag_id = t.id
          ON CONFLICT (tag_name, decision_id) DO NOTHING
        `);
      }
    }

    const count = await knex('m_tag_index').count('* as cnt');
    console.log(`✓ Populated m_tag_index with ${count[0].cnt} tag entries`);
  } else {
    console.log('✓ m_tag_index already populated, skipping');
  }

  // ============================================================================
  // STEP 5: Create Auto-Population Trigger (SQLite Only)
  // ============================================================================

  if (isSQLite) {
    console.log('🔄 Creating tag index auto-population trigger...');

    // Check if trigger already exists
    const triggerExists = await knex.raw(`
      SELECT name FROM sqlite_master
      WHERE type='trigger' AND name='populate_tag_index'
    `);

    if (!triggerExists || triggerExists.length === 0) {
      await knex.raw(`
        CREATE TRIGGER populate_tag_index
        AFTER INSERT ON t_decision_tags
        FOR EACH ROW
        BEGIN
          INSERT OR IGNORE INTO m_tag_index (tag_name, decision_id)
          SELECT t.name, NEW.decision_key_id
          FROM m_tags t WHERE t.id = NEW.tag_id;
        END
      `);
      console.log('✓ Created populate_tag_index trigger');
    } else {
      console.log('✓ populate_tag_index trigger already exists, skipping');
    }
  } else {
    console.log('⚠️  Non-SQLite database detected - trigger creation skipped');
    console.log('   TODO: Add MySQL/PostgreSQL trigger support in future enhancement');
  }

  // ============================================================================
  // STEP 6: Update Built-in Policies with Validation Rules
  // ============================================================================

  console.log('🔄 Updating built-in policies with validation rules...');

  const existingPolicies = await knex('t_decision_policies').select('id', 'name');

  if (existingPolicies.length > 0) {
    // Security Vulnerability Policy
    const securityPolicy = existingPolicies.find((p: any) => p.name === 'security_vulnerability');
    if (securityPolicy) {
      await knex('t_decision_policies')
        .where('name', 'security_vulnerability')
        .update({
          validation_rules: JSON.stringify({
            patterns: { cve_id: '^CVE-\\d{4}-\\d{4,7}$' }
          }),
          quality_gates: JSON.stringify({
            required_fields: ['rationale', 'cve_id', 'severity']
          }),
          suggest_similar: 1,
          category: 'security'
        });
      console.log('  ✓ Updated security_vulnerability policy');
    }

    // Breaking Change Policy
    const breakingPolicy = existingPolicies.find((p: any) => p.name === 'breaking_change');
    if (breakingPolicy) {
      await knex('t_decision_policies')
        .where('name', 'breaking_change')
        .update({
          validation_rules: JSON.stringify({
            patterns: { semver: '^\\d+\\.\\d+\\.\\d+$' }
          }),
          quality_gates: JSON.stringify({
            required_fields: ['rationale', 'migration_guide', 'semver_bump']
          }),
          suggest_similar: 1,
          category: 'compatibility'
        });
      console.log('  ✓ Updated breaking_change policy');
    }

    // Architecture Decision Policy
    const archPolicy = existingPolicies.find((p: any) => p.name === 'architecture_decision');
    if (archPolicy) {
      await knex('t_decision_policies')
        .where('name', 'architecture_decision')
        .update({
          quality_gates: JSON.stringify({
            required_fields: ['rationale', 'alternatives', 'tradeoffs']
          }),
          suggest_similar: 1,
          category: 'architecture'
        });
      console.log('  ✓ Updated architecture_decision policy');
    }

    // Performance Optimization Policy
    const perfPolicy = existingPolicies.find((p: any) => p.name === 'performance_optimization');
    if (perfPolicy) {
      await knex('t_decision_policies')
        .where('name', 'performance_optimization')
        .update({
          quality_gates: JSON.stringify({
            required_fields: ['before_metrics', 'after_metrics', 'improvement_pct']
          }),
          category: 'performance'
        });
      console.log('  ✓ Updated performance_optimization policy');
    }

    // Deprecation Policy
    const deprecationPolicy = existingPolicies.find((p: any) => p.name === 'deprecation');
    if (deprecationPolicy) {
      await knex('t_decision_policies')
        .where('name', 'deprecation')
        .update({
          quality_gates: JSON.stringify({
            required_fields: ['replacement', 'timeline', 'migration_path']
          }),
          category: 'lifecycle'
        });
      console.log('  ✓ Updated deprecation policy');
    }

    console.log(`✓ Updated ${existingPolicies.length} built-in policies`);
  } else {
    console.log('⚠️  No existing policies found - skipping policy updates');
  }

  // ============================================================================
  // STEP 7: Create t_task_pruned_files Table (Missing from Bootstrap Schema)
  // ============================================================================

  const hasPrunedFilesTable = await knex.schema.hasTable('t_task_pruned_files');
  if (!hasPrunedFilesTable) {
    console.log('🔄 Creating t_task_pruned_files table...');

    await knex.schema.createTable('t_task_pruned_files', (table) => {
      table.increments('id').primary();
      table.integer('task_id').notNullable()
        .references('id').inTable('t_tasks').onDelete('CASCADE');
      table.string('file_path', 500).notNullable();
      table.bigInteger('pruned_ts').notNullable()
        .defaultTo(knex.raw("(strftime('%s', 'now'))"));
      table.integer('linked_decision_key_id').nullable()
        .references('id').inTable('m_context_keys').onDelete('SET NULL');
      table.integer('project_id').notNullable()  // ADDED v3.7.0 multi-project support
        .references('id').inTable('m_projects').onDelete('CASCADE');

      table.index('task_id', 'idx_task_pruned_files_task_id');
    });

    console.log('✓ Created t_task_pruned_files table (v3.5.0 auto-pruning feature, v3.7.0 project_id)');
  } else {
    console.log('✓ t_task_pruned_files already exists, skipping');
  }

  console.log('✅ Decision Intelligence System migration v3.9.0 completed successfully');
}

export async function down(knex: Knex): Promise<void> {
  console.log('🔄 Rolling back Decision Intelligence System migration v3.9.0...');

  const client = knex.client.config.client;
  const isSQLite = client === 'sqlite3' || client === 'better-sqlite3';

  // Drop t_task_pruned_files table
  await knex.schema.dropTableIfExists('t_task_pruned_files');
  console.log('✓ Dropped t_task_pruned_files table');

  // Drop trigger (SQLite only)
  if (isSQLite) {
    await knex.raw('DROP TRIGGER IF EXISTS populate_tag_index');
    console.log('✓ Dropped populate_tag_index trigger');
  }

  // Drop tag index table
  await knex.schema.dropTableIfExists('m_tag_index');
  console.log('✓ Dropped m_tag_index table');

  // Remove new columns from t_decision_policies
  const hasNewTable = await knex.schema.hasTable('t_decision_policies');
  if (hasNewTable) {
    console.log('🔄 Removing new columns from t_decision_policies...');

    // Check columns individually before dropping
    const hasValidationRules = await knex.schema.hasColumn('t_decision_policies', 'validation_rules');
    const hasQualityGatesCol = await knex.schema.hasColumn('t_decision_policies', 'quality_gates');
    const hasSuggestSimilarCol = await knex.schema.hasColumn('t_decision_policies', 'suggest_similar');
    const hasCategoryCol = await knex.schema.hasColumn('t_decision_policies', 'category');

    if (hasValidationRules || hasQualityGatesCol || hasSuggestSimilarCol || hasCategoryCol) {
      await knex.schema.alterTable('t_decision_policies', (table) => {
        if (hasValidationRules) table.dropColumn('validation_rules');
        if (hasQualityGatesCol) table.dropColumn('quality_gates');
        if (hasSuggestSimilarCol) table.dropColumn('suggest_similar');
        if (hasCategoryCol) table.dropColumn('category');
      });
    }

    console.log('✓ Removed new columns');

    // Rename back to t_decision_templates
    const hasOldTable = await knex.schema.hasTable('t_decision_templates');
    if (!hasOldTable) {
      await knex.schema.renameTable('t_decision_policies', 't_decision_templates');
      console.log('✓ Renamed t_decision_policies → t_decision_templates');
    } else {
      console.log('⚠️  t_decision_templates already exists, skipping rename');
    }
  }

  console.log('✅ Decision Intelligence System rollback completed');
}
