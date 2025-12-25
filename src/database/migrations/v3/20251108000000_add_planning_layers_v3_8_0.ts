/**
 * Converted from: src/config/knex/enhancements/20251108000000_add_planning_layers_v3_8_0.ts
 * Changes: None (data seeding with PostgreSQL-specific sequence handling - no wrapper benefit)
 * Line count: 85 → 85 lines (0% reduction)
 */

import type { Knex } from "knex";

/**
 * Migration: Add Planning Layers (v3.8.0)
 *
 * Expands layer taxonomy from 5 to 9 layers by adding 4 planning-focused layers:
 * - planning: Research, surveys, investigation (file_actions optional)
 * - documentation: README, CHANGELOG, docs/ (file_actions REQUIRED - docs = files!)
 * - coordination: Multi-agent orchestration (file_actions optional)
 * - review: Code review, verification (file_actions optional)
 *
 * This enables layer-based file_actions validation:
 * - 6 file-required layers: presentation, business, data, infrastructure, cross-cutting, documentation
 * - 3 file-optional layers: planning, coordination, review
 *
 * Idempotent: Checks for existing layers before inserting
 *
 * Related: v3.8.0 File Actions & Layer Expansion Plan
 */

export async function up(knex: Knex): Promise<void> {
  console.error('🔧 Adding v3.8.0 planning layers...');

  // Check if any of the new layers already exist
  const newLayerNames = ['planning', 'documentation', 'coordination', 'review'];
  const existingLayers = await knex('m_layers')
    .whereIn('name', newLayerNames)
    .select('name');

  if (existingLayers.length > 0) {
    console.error(`✓ Planning layers already exist (${existingLayers.map(l => l.name).join(', ')}), skipping`);
    return;
  }

  // Insert the 4 new layers
  // Note: Explicit IDs (6-9) required for PostgreSQL compatibility
  // PostgreSQL sequences don't auto-increment when explicit IDs are used in bootstrap (IDs 1-5)
  const client = knex.client.config.client;
  const isPostgreSQL = client === 'pg' || client === 'postgresql';

  if (isPostgreSQL) {
    // PostgreSQL: Use explicit IDs and update sequence
    await knex('m_layers').insert([
      { id: 6, name: 'planning' },
      { id: 7, name: 'documentation' },
      { id: 8, name: 'coordination' },
      { id: 9, name: 'review' }
    ]);
    // Update sequence to 9 so future auto-increment starts at 10
    await knex.raw("SELECT setval('m_layers_id_seq', 9, true)");
  } else {
    // SQLite/MySQL: Let auto-increment handle IDs
    await knex('m_layers').insert([
      { name: 'planning' },
      { name: 'documentation' },
      { name: 'coordination' },
      { name: 'review' }
    ]);
  }

  console.error('✅ Added 4 planning layers: planning, documentation, coordination, review');
}

export async function down(knex: Knex): Promise<void> {
  console.error('🔄 Removing v3.8.0 planning layers...');

  // Check if layers exist before removing
  const layersToRemove = ['planning', 'documentation', 'coordination', 'review'];
  const existingLayers = await knex('m_layers')
    .whereIn('name', layersToRemove)
    .select('name');

  if (existingLayers.length === 0) {
    console.error('✓ Planning layers already removed, skipping');
    return;
  }

  // Remove the 4 planning layers
  await knex('m_layers')
    .whereIn('name', layersToRemove)
    .delete();

  console.error('✅ Removed planning layers');
}
