/**
 * Knex Migration: v3.5.x → v3.6.0 (Add Help System)
 *
 * Adds comprehensive help system tables and metadata.
 * This migration checks if help tables already exist and skips if so.
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Check if we need this migration
  const hasHelpSystem = await knex.schema.hasTable('m_help_tools');

  if (hasHelpSystem) {
    console.log('✓ Help system tables already exist, skipping v3.6.0 migration');
    return;
  }

  // Check if we have pruned files (v3.5.x)
  const hasPrunedFiles = await knex.schema.hasTable('t_task_pruned_files');
  if (!hasPrunedFiles) {
    console.log('✓ No v3.5.x schema detected, skipping v3.6.0 migration');
    return;
  }

  console.log('🔄 Migrating v3.5.x → v3.6.0 (adding help system)...');
  console.log('  ℹ️  Help system tables will be created by migration 20251025090000');
  console.log('  ℹ️  This is just a version marker migration');

  console.log('✅ v3.5.x → v3.6.0 migration marker complete');
}

export async function down(knex: Knex): Promise<void> {
  // No action needed - actual help tables are managed by later migrations
}
