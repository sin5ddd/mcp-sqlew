import type { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {
  // ============================================================================
  // Indexes for Performance Optimization
  // ============================================================================

  // Decisions indexes
  await knex.raw('CREATE INDEX idx_decisions_ts ON t_decisions(ts DESC)');
  await knex.raw('CREATE INDEX idx_decisions_layer ON t_decisions(layer_id)');
  await knex.raw('CREATE INDEX idx_decisions_agent ON t_decisions(agent_id)');
  await knex.raw('CREATE INDEX idx_decisions_status ON t_decisions(status)');

  // Decisions numeric indexes
  await knex.raw('CREATE INDEX idx_decisions_numeric_ts ON t_decisions_numeric(ts DESC)');
  await knex.raw('CREATE INDEX idx_decisions_numeric_layer ON t_decisions_numeric(layer_id)');

  // Messages indexes
  await knex.raw('CREATE INDEX idx_messages_ts ON t_agent_messages(ts DESC)');
  await knex.raw('CREATE INDEX idx_messages_to_agent ON t_agent_messages(to_agent_id, read)');
  await knex.raw('CREATE INDEX idx_messages_priority ON t_agent_messages(priority DESC)');

  // File changes indexes
  await knex.raw('CREATE INDEX idx_file_changes_ts ON t_file_changes(ts DESC)');
  await knex.raw('CREATE INDEX idx_file_changes_file ON t_file_changes(file_id)');
  await knex.raw('CREATE INDEX idx_file_changes_layer ON t_file_changes(layer_id)');

  // Constraints indexes
  await knex.raw('CREATE INDEX idx_constraints_active ON t_constraints(active)');
  await knex.raw('CREATE INDEX idx_constraints_layer ON t_constraints(layer_id)');
  await knex.raw('CREATE INDEX idx_constraints_priority ON t_constraints(priority DESC)');

  // Activity log indexes
  await knex.raw('CREATE INDEX idx_activity_log_ts ON t_activity_log(ts DESC)');
  await knex.raw('CREATE INDEX idx_activity_log_agent ON t_activity_log(agent_id)');

  // Task indexes
  await knex.raw('CREATE INDEX idx_tasks_status ON t_tasks(status_id)');
  await knex.raw('CREATE INDEX idx_tasks_priority ON t_tasks(priority DESC)');
  await knex.raw('CREATE INDEX idx_tasks_agent ON t_tasks(assigned_agent_id)');
  await knex.raw('CREATE INDEX idx_tasks_created_ts ON t_tasks(created_ts DESC)');
  await knex.raw('CREATE INDEX idx_tasks_updated_ts ON t_tasks(updated_ts DESC)');

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

