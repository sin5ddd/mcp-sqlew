import type { Knex } from "knex";

/**
 * Stub migration - this was created to resolve Knex corruption error
 * The actual changes were likely applied manually or in a different migration
 */

export async function up(knex: Knex): Promise<void> {
  // No-op: changes already applied
  console.log('Stub migration: no changes needed');
}

export async function down(knex: Knex): Promise<void> {
  // No-op
}
