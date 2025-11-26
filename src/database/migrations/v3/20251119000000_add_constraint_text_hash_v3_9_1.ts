/**
 * Migration: Add constraint_text_hash for UNIQUE constraint (v3.9.1)
 *
 * This migration adds a SHA256 hash column to t_constraints to enable
 * UNIQUE constraint enforcement on (constraint_text_hash, project_id).
 *
 * Problem: MySQL/MariaDB cannot create indexes on TEXT columns or
 * VARCHAR columns exceeding 768 bytes (utf8mb4).
 *
 * Solution: Store SHA256 hash of constraint_text in a fixed-size column
 * and enforce uniqueness on the hash + project_id combination.
 *
 * Cross-Database Compatibility:
 * - SQLite: Using hex() + custom SHA256 implementation or Application-level hash
 * - MySQL/MariaDB: SHA2() function
 * - PostgreSQL: encode(digest(), 'hex') from pgcrypto or Application-level
 *
 * For simplicity and cross-database compatibility, this migration uses
 * application-level hashing via Node.js crypto module during data operations.
 * The hash is computed by the application before insert/update.
 */

import type { Knex } from "knex";
import { UniversalKnex } from "../../utils/universal-knex.js";

export async function up(knex: Knex): Promise<void> {
  const db = new UniversalKnex(knex);

  // Check if column already exists
  const hasColumn = await knex.schema.hasColumn('t_constraints', 'constraint_text_hash');
  if (hasColumn) {
    console.log('  ✓ constraint_text_hash column already exists, skipping');
    return;
  }

  // Add the hash column
  await knex.schema.alterTable('t_constraints', (table) => {
    // SHA256 produces 64 hex characters
    table.string('constraint_text_hash', 64).nullable();
  });

  console.log('  ✓ Added constraint_text_hash column');

  // Populate existing records with hash values
  // Using application-level hashing for cross-database compatibility
  const crypto = await import('crypto');

  const constraints = await knex('t_constraints').select('id', 'constraint_text');

  for (const constraint of constraints) {
    const hash = crypto
      .createHash('sha256')
      .update(constraint.constraint_text)
      .digest('hex');

    await knex('t_constraints')
      .where({ id: constraint.id })
      .update({ constraint_text_hash: hash });
  }

  console.log(`  ✓ Populated ${constraints.length} existing constraints with hash values`);

  // Make the column NOT NULL after populating
  // Note: Some databases handle this differently, so we use raw SQL
  const client = knex.client.config.client;
  const isSQLite = client === 'sqlite3' || client === 'better-sqlite3';

  if (!isSQLite) {
    // For MySQL/PostgreSQL, alter column to NOT NULL
    await knex.schema.alterTable('t_constraints', (table) => {
      table.string('constraint_text_hash', 64).notNullable().alter();
    });
    console.log('  ✓ Set constraint_text_hash to NOT NULL');
  } else {
    // SQLite doesn't support ALTER COLUMN, but new inserts will be validated by app
    console.log('  ⚠  SQLite: constraint_text_hash remains nullable (enforced by app)');
  }

  // Create UNIQUE index on (constraint_text_hash, project_id)
  await db.createIndexSafe(
    't_constraints',
    ['constraint_text_hash', 'project_id'],
    'idx_constraints_text_hash_project',
    { unique: true }
  );

  console.log('  ✓ Created UNIQUE index on (constraint_text_hash, project_id)');
}

export async function down(knex: Knex): Promise<void> {
  const db = new UniversalKnex(knex);
  const client = knex.client.config.client;
  const isSQLite = client === 'sqlite3' || client === 'better-sqlite3';

  // Drop the index first
  if (isSQLite) {
    await knex.raw('DROP INDEX IF EXISTS idx_constraints_text_hash_project');
  } else {
    try {
      await knex.schema.alterTable('t_constraints', (table) => {
        table.dropIndex(['constraint_text_hash', 'project_id'], 'idx_constraints_text_hash_project');
      });
    } catch (error: any) {
      if (!error.message.includes('does not exist') && !error.message.includes("doesn't exist")) {
        throw error;
      }
    }
  }

  console.log('  ✓ Dropped UNIQUE index');

  // Drop the column
  const hasColumn = await knex.schema.hasColumn('t_constraints', 'constraint_text_hash');
  if (hasColumn) {
    await knex.schema.alterTable('t_constraints', (table) => {
      table.dropColumn('constraint_text_hash');
    });
    console.log('  ✓ Dropped constraint_text_hash column');
  }
}
