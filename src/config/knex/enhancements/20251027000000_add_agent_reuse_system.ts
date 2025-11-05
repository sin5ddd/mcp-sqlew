import type { Knex } from 'knex';

/**
 * Migration: Add agent reuse system
 *
 * Adds columns to m_agents to support reusing generic agent slots while
 * preserving user-specified agent names.
 *
 * - is_reusable: Whether this agent slot can be reused (generic agents)
 * - in_use: Whether the agent is currently active
 * - last_active_ts: Last activity timestamp for cleanup
 */
export async function up(knex: Knex): Promise<void> {
  // Check if columns already exist
  const hasReusable = await knex.schema.hasColumn('m_agents', 'is_reusable');

  if (!hasReusable) {
    // Add columns for agent reuse system
    await knex.schema.alterTable('m_agents', (table) => {
      table.boolean('is_reusable').defaultTo(false);
      table.boolean('in_use').defaultTo(false);
      table.integer('last_active_ts').defaultTo(0);
    });
    console.log('✓ Added agent reuse columns to m_agents');
  } else {
    console.log('✓ Agent reuse columns already exist, skipping');
  }

  // Create index for finding inactive reusable agents
  const client = knex.client.config.client;

  if (client === 'mysql' || client === 'mysql2' || client === 'pg') {
    // MySQL and PostgreSQL: Check if index exists first
    try {
      await knex.schema.alterTable('m_agents', (table) => {
        table.index(['is_reusable', 'in_use', 'last_active_ts'], 'idx_agents_reusable');
      });
      console.log('✓ Created index idx_agents_reusable');
    } catch (error: any) {
      if (error.message.includes('Duplicate key name') || error.message.includes('already exists')) {
        console.log('✓ Index idx_agents_reusable already exists');
      } else {
        throw error;
      }
    }
  } else {
    // SQLite: Use IF NOT EXISTS
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_agents_reusable ON m_agents(is_reusable, in_use, last_active_ts)');
    console.log('✓ Created index idx_agents_reusable');
  }
}

export async function down(knex: Knex): Promise<void> {
  // Drop index
  await knex.raw('DROP INDEX IF EXISTS idx_agents_reusable');

  // Remove columns
  await knex.schema.alterTable('m_agents', (table) => {
    table.dropColumn('is_reusable');
    table.dropColumn('in_use');
    table.dropColumn('last_active_ts');
  });

  console.log('✓ Removed agent reuse system');
}
