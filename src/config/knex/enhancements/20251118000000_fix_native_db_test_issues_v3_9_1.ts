import type { Knex } from "knex";

/**
 * v3.9.1 Hotfix - Native Database Test Issues
 *
 * Fixes:
 * 1. MySQL/MariaDB: m_files composite UNIQUE index exceeds 3072 bytes
 *    - Reduce path length from 768 to 767 chars (767 * 4 + 4 = 3072 bytes exactly)
 * 2. All databases: v_unread_messages_by_priority references dropped t_agent_messages table
 *    - Drop the view if it exists (table removed in v3.6.5)
 *
 * Context: Native database tests (fresh installations) fail because:
 * - Bootstrap migration creates v_unread_messages_by_priority
 * - Enhancement migration 20251028000000 drops t_agent_messages table
 * - View becomes orphaned and causes errors
 *
 * This migration MUST run before bootstrap migrations for fresh installations.
 */

export async function up(knex: Knex): Promise<void> {
  const client = knex.client.config.client;
  const isMySQL = client === 'mysql2' || client === 'mysql';
  const isSQLite = client === 'better-sqlite3' || client === 'sqlite3';

  console.log(`\n🔧 [v3.9.1 Hotfix] Fixing native database test issues for ${client}...`);

  // ========================================================================
  // Fix 1: m_files UNIQUE index length (MySQL/MariaDB only)
  // ========================================================================
  if (isMySQL) {
    const hasTable = await knex.schema.hasTable('m_files');

    if (hasTable) {
      // Check if path column is > 767 characters
      const columns = await knex('information_schema.COLUMNS')
        .select('CHARACTER_MAXIMUM_LENGTH as max_length')
        .where({
          TABLE_SCHEMA: knex.client.database(),
          TABLE_NAME: 'm_files',
          COLUMN_NAME: 'path'
        })
        .first();

      if (columns && columns.max_length > 767) {
        console.log(`  ⚠️  m_files.path is ${columns.max_length} chars (MySQL limit: 767 for UNIQUE index)`);

        // Drop existing UNIQUE constraint if it exists
        try {
          await knex.schema.alterTable('m_files', (table) => {
            table.dropUnique(['project_id', 'path']);
          });
          console.log('  ✓ Dropped existing UNIQUE constraint on (project_id, path)');
        } catch (error: any) {
          if (!error.message.includes('check that column/key exists')) {
            console.log(`  ⓘ No existing UNIQUE constraint to drop (${error.message})`);
          }
        }

        // Modify column to 767 characters
        await knex.schema.alterTable('m_files', (table) => {
          table.string('path', 767).notNullable().alter();
        });
        console.log('  ✓ Reduced path column to 767 characters');

        // Re-create UNIQUE constraint
        await knex.schema.alterTable('m_files', (table) => {
          table.unique(['project_id', 'path']);
        });
        console.log('  ✓ Re-created UNIQUE constraint on (project_id, path)');
      } else {
        console.log('  ✓ m_files.path length is within MySQL limits');
      }
    } else {
      console.log('  ⓘ m_files table does not exist yet (will be created with correct length)');
    }
  }

  // ========================================================================
  // Fix 2: Drop orphaned v_unread_messages_by_priority view
  // ========================================================================
  // This view references t_agent_messages which was dropped in v3.6.5
  // The view should have been dropped in 20251031000000_drop_orphaned_message_view.ts,
  // but for fresh installations the order is: bootstrap creates view → enhancement drops table → orphaned view

  try {
    await knex.raw('DROP VIEW IF EXISTS v_unread_messages_by_priority');
    console.log('  ✓ Dropped v_unread_messages_by_priority view (references dropped t_agent_messages)');
  } catch (error: any) {
    console.log(`  ⓘ Could not drop view: ${error.message}`);
  }

  console.log('✅ [v3.9.1 Hotfix] Native database test fixes applied successfully\n');
}

export async function down(knex: Knex): Promise<void> {
  const client = knex.client.config.client;
  const isMySQL = client === 'mysql2' || client === 'mysql';

  console.log(`\n🔄 [v3.9.1 Hotfix] Reverting native database test fixes for ${client}...`);

  // Revert Fix 1: Restore path length to 768 (MySQL only)
  if (isMySQL) {
    const hasTable = await knex.schema.hasTable('m_files');

    if (hasTable) {
      // Drop UNIQUE constraint
      try {
        await knex.schema.alterTable('m_files', (table) => {
          table.dropUnique(['project_id', 'path']);
        });
        console.log('  ✓ Dropped UNIQUE constraint on (project_id, path)');
      } catch (error: any) {
        console.log(`  ⓘ No UNIQUE constraint to drop (${error.message})`);
      }

      // Restore column to 768 characters
      await knex.schema.alterTable('m_files', (table) => {
        table.string('path', 768).notNullable().alter();
      });
      console.log('  ✓ Restored path column to 768 characters');

      // Re-create UNIQUE constraint
      await knex.schema.alterTable('m_files', (table) => {
        table.unique(['project_id', 'path']);
      });
      console.log('  ✓ Re-created UNIQUE constraint on (project_id, path)');
    }
  }

  // Fix 2: Cannot restore view because t_agent_messages table no longer exists
  console.log('  ⓘ Cannot restore v_unread_messages_by_priority (t_agent_messages table removed in v3.6.5)');

  console.log('✅ [v3.9.1 Hotfix] Rollback completed\n');
}
