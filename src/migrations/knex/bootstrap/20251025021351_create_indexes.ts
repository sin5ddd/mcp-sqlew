import type { Knex } from "knex";

/**
 * Helper function to safely create index only if column exists
 * Prevents errors when running on old schemas that don't have certain columns
 */
async function createIndexIfColumnExists(
  knex: Knex,
  tableName: string,
  columns: string | string[],
  indexName: string,
  desc: boolean = false
): Promise<void> {
  try {
    // Check if table exists first
    const tableExists = await knex.schema.hasTable(tableName);
    if (!tableExists) {
      console.log(`⏭️  Skipping ${indexName}: table ${tableName} doesn't exist`);
      return;
    }

    // Get column info for the table
    const columnInfo = await knex(tableName).columnInfo();

    // Check if all required columns exist
    const columnArray = Array.isArray(columns) ? columns : [columns];
    const missingColumns = columnArray.filter(col => !columnInfo[col]);

    if (missingColumns.length > 0) {
      console.log(`⏭️  Skipping ${indexName}: column(s) ${missingColumns.join(', ')} don't exist yet`);
      return;
    }

    // Build index creation SQL
    const columnList = columnArray.join(', ');
    const order = desc ? 'DESC' : '';
    await knex.raw(`CREATE INDEX IF NOT EXISTS ${indexName} ON ${tableName}(${columnList} ${order})`.trim());

  } catch (error) {
    console.log(`⚠️  Error creating index ${indexName}: ${error}`);
    // Don't throw - indexes are performance optimizations, not critical
  }
}

export async function up(knex: Knex): Promise<void> {
  // ============================================================================
  // Indexes for Performance Optimization
  // ============================================================================

  // Decisions indexes
  await createIndexIfColumnExists(knex, 't_decisions', 'ts', 'idx_decisions_ts', true);
  await createIndexIfColumnExists(knex, 't_decisions', 'layer_id', 'idx_decisions_layer');
  await createIndexIfColumnExists(knex, 't_decisions', 'agent_id', 'idx_decisions_agent');
  await createIndexIfColumnExists(knex, 't_decisions', 'status', 'idx_decisions_status');

  // Decisions numeric indexes
  await createIndexIfColumnExists(knex, 't_decisions_numeric', 'ts', 'idx_decisions_numeric_ts', true);
  await createIndexIfColumnExists(knex, 't_decisions_numeric', 'layer_id', 'idx_decisions_numeric_layer');

  // Messages indexes
  await createIndexIfColumnExists(knex, 't_agent_messages', 'ts', 'idx_messages_ts', true);
  await createIndexIfColumnExists(knex, 't_agent_messages', ['to_agent_id', 'read'], 'idx_messages_to_agent');
  await createIndexIfColumnExists(knex, 't_agent_messages', 'priority', 'idx_messages_priority', true);

  // File changes indexes
  await createIndexIfColumnExists(knex, 't_file_changes', 'ts', 'idx_file_changes_ts', true);
  await createIndexIfColumnExists(knex, 't_file_changes', 'file_id', 'idx_file_changes_file');
  await createIndexIfColumnExists(knex, 't_file_changes', 'layer_id', 'idx_file_changes_layer');

  // Constraints indexes
  await createIndexIfColumnExists(knex, 't_constraints', 'active', 'idx_constraints_active');
  await createIndexIfColumnExists(knex, 't_constraints', 'layer_id', 'idx_constraints_layer');
  await createIndexIfColumnExists(knex, 't_constraints', 'priority', 'idx_constraints_priority', true);

  // Activity log indexes - agent_id may not exist in old schemas
  await createIndexIfColumnExists(knex, 't_activity_log', 'ts', 'idx_activity_log_ts', true);
  await createIndexIfColumnExists(knex, 't_activity_log', 'agent_id', 'idx_activity_log_agent');

  // Task indexes - assigned_agent_id may not exist in old schemas
  await createIndexIfColumnExists(knex, 't_tasks', 'status_id', 'idx_tasks_status');
  await createIndexIfColumnExists(knex, 't_tasks', 'priority', 'idx_tasks_priority', true);
  await createIndexIfColumnExists(knex, 't_tasks', 'assigned_agent_id', 'idx_tasks_agent');
  await createIndexIfColumnExists(knex, 't_tasks', 'created_ts', 'idx_tasks_created_ts', true);
  await createIndexIfColumnExists(knex, 't_tasks', 'updated_ts', 'idx_tasks_updated_ts', true);

  console.log('✅ Indexes created successfully');
}


export async function down(knex: Knex): Promise<void> {
  // Drop all indexes
  await knex.raw('DROP INDEX IF EXISTS idx_tasks_updated_ts');
  await knex.raw('DROP INDEX IF EXISTS idx_tasks_created_ts');
  await knex.raw('DROP INDEX IF EXISTS idx_tasks_agent');
  await knex.raw('DROP INDEX IF EXISTS idx_tasks_priority');
  await knex.raw('DROP INDEX IF EXISTS idx_tasks_status');
  await knex.raw('DROP INDEX IF EXISTS idx_activity_log_agent');
  await knex.raw('DROP INDEX IF EXISTS idx_activity_log_ts');
  await knex.raw('DROP INDEX IF EXISTS idx_constraints_priority');
  await knex.raw('DROP INDEX IF EXISTS idx_constraints_layer');
  await knex.raw('DROP INDEX IF EXISTS idx_constraints_active');
  await knex.raw('DROP INDEX IF EXISTS idx_file_changes_layer');
  await knex.raw('DROP INDEX IF EXISTS idx_file_changes_file');
  await knex.raw('DROP INDEX IF EXISTS idx_file_changes_ts');
  await knex.raw('DROP INDEX IF EXISTS idx_messages_priority');
  await knex.raw('DROP INDEX IF EXISTS idx_messages_to_agent');
  await knex.raw('DROP INDEX IF EXISTS idx_messages_ts');
  await knex.raw('DROP INDEX IF EXISTS idx_decisions_numeric_layer');
  await knex.raw('DROP INDEX IF EXISTS idx_decisions_numeric_ts');
  await knex.raw('DROP INDEX IF EXISTS idx_decisions_status');
  await knex.raw('DROP INDEX IF EXISTS idx_decisions_agent');
  await knex.raw('DROP INDEX IF EXISTS idx_decisions_layer');
  await knex.raw('DROP INDEX IF EXISTS idx_decisions_ts');

  console.log('✅ Indexes dropped successfully');
}
