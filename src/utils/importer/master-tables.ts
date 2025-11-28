/**
 * Master Table Import with Smart Merge
 *
 * Handles importing master tables with intelligent ID remapping:
 * - Project-scoped tables (m_files, m_tags, m_scopes): Smart merge on UNIQUE (project_id, name/path)
 * - Global tables (m_context_keys, etc.): Always create new IDs
 *
 * Note: Agent system removed in v4.0 - no agent imports
 *
 * Architectural Decision: Decision #253 - Smart merge for project-scoped master tables
 */

import type { Knex } from 'knex';
import type { ImportContext, IdMapping } from '../../types.js';

/**
 * Import master tables and build ID mappings
 *
 * @param ctx - Import context with target project ID
 * @returns Updated context with ID mappings populated
 */
export async function importMasterTables(ctx: ImportContext): Promise<ImportContext> {
  console.error('  Importing master tables...');

  // Import order: no dependencies between master tables
  // Note: importAgents removed in v4.0 (agent system deleted)
  await importFiles(ctx);
  await importContextKeys(ctx);
  await importTags(ctx);
  await importScopes(ctx);
  await importConstraintCategories(ctx);
  await importLayers(ctx);
  await importTaskStatuses(ctx);

  console.error(`  ✓ Master tables imported (${getTotalMappings(ctx)} ID mappings created)`);
  return ctx;
}

// Note: importAgents function removed in v4.0 (agent system deleted)

/**
 * Import v4_files (project-scoped, smart merge)
 */
async function importFiles(ctx: ImportContext): Promise<void> {
  const files = ctx.jsonData.master_tables.files || [];
  let created = 0;
  let reused = 0;

  for (const file of files) {
    // Check if file already exists in target project
    const existing = await ctx.knex('v4_files')
      .where({
        project_id: ctx.projectId,
        path: file.path
      })
      .first();

    if (existing) {
      // Reuse existing ID
      ctx.mappings.files.set(file.id, existing.id);
      reused++;
    } else {
      // Create new file entry
      const [newId] = await ctx.knex('v4_files').insert({
        project_id: ctx.projectId,
        path: file.path
      });

      ctx.mappings.files.set(file.id, newId);
      created++;
    }
  }

  ctx.stats.master_tables.files_created = created;
  ctx.stats.master_tables.files_reused = reused;
}

/**
 * Import v4_context_keys (global, always create new)
 *
 * CRITICAL: context_keys.id IS the decision ID (v4_decisions.key_id PRIMARY KEY)
 * Never reuse context_keys even if key string matches
 *
 * Architectural Decision: Decision #251 - Context key isolation
 */
async function importContextKeys(ctx: ImportContext): Promise<void> {
  const keys = ctx.jsonData.master_tables.context_keys || [];

  for (const key of keys) {
    // Always create new context key (even if key string matches)
    const [newId] = await ctx.knex('v4_context_keys').insert({
      key_name: key.key
    });

    ctx.mappings.context_keys.set(key.id, newId);
  }

  ctx.stats.master_tables.context_keys_created = keys.length;
}

/**
 * Import v4_tags (project-scoped, smart merge)
 */
async function importTags(ctx: ImportContext): Promise<void> {
  const tags = ctx.jsonData.master_tables.tags || [];
  let created = 0;
  let reused = 0;

  for (const tag of tags) {
    // Check if tag already exists in target project
    const existing = await ctx.knex('v4_tags')
      .where({
        project_id: ctx.projectId,
        name: tag.name
      })
      .first();

    if (existing) {
      // Reuse existing ID
      ctx.mappings.tags.set(tag.id, existing.id);
      reused++;
    } else {
      // Create new tag entry
      const [newId] = await ctx.knex('v4_tags').insert({
        project_id: ctx.projectId,
        name: tag.name
      });

      ctx.mappings.tags.set(tag.id, newId);
      created++;
    }
  }

  ctx.stats.master_tables.tags_created = created;
  ctx.stats.master_tables.tags_reused = reused;
}

/**
 * Import v4_scopes (project-scoped, smart merge)
 */
async function importScopes(ctx: ImportContext): Promise<void> {
  const scopes = ctx.jsonData.master_tables.scopes || [];
  let created = 0;
  let reused = 0;

  for (const scope of scopes) {
    // Check if scope already exists in target project
    const existing = await ctx.knex('v4_scopes')
      .where({
        project_id: ctx.projectId,
        name: scope.name
      })
      .first();

    if (existing) {
      // Reuse existing ID
      ctx.mappings.scopes.set(scope.id, existing.id);
      reused++;
    } else {
      // Create new scope entry
      const [newId] = await ctx.knex('v4_scopes').insert({
        project_id: ctx.projectId,
        name: scope.name
      });

      ctx.mappings.scopes.set(scope.id, newId);
      created++;
    }
  }

  ctx.stats.master_tables.scopes_created = created;
  ctx.stats.master_tables.scopes_reused = reused;
}

/**
 * Import v4_constraint_categories (global, create or reuse by name)
 */
async function importConstraintCategories(ctx: ImportContext): Promise<void> {
  const categories = ctx.jsonData.master_tables.constraint_categories || [];

  for (const category of categories) {
    // Check if category exists by name (global lookup)
    const existing = await ctx.knex('v4_constraint_categories')
      .where({ name: category.name })
      .first();

    if (existing) {
      // Reuse existing global category
      ctx.mappings.constraint_categories.set(category.id, existing.id);
    } else {
      // Create new category
      const [newId] = await ctx.knex('v4_constraint_categories').insert({
        name: category.name
      });

      ctx.mappings.constraint_categories.set(category.id, newId);
    }
  }
}

/**
 * Import v4_layers (global, create or reuse by name)
 */
async function importLayers(ctx: ImportContext): Promise<void> {
  const layers = ctx.jsonData.master_tables.layers || [];

  for (const layer of layers) {
    // Check if layer exists by name (global lookup)
    const existing = await ctx.knex('v4_layers')
      .where({ name: layer.name })
      .first();

    if (existing) {
      // Reuse existing global layer
      ctx.mappings.layers.set(layer.id, existing.id);
    } else {
      // Create new layer
      const [newId] = await ctx.knex('v4_layers').insert({
        name: layer.name
      });

      ctx.mappings.layers.set(layer.id, newId);
    }
  }
}

/**
 * Import v4_task_statuses (global, create or reuse by name)
 */
async function importTaskStatuses(ctx: ImportContext): Promise<void> {
  const statuses = ctx.jsonData.master_tables.task_statuses || [];

  for (const status of statuses) {
    // Check if status exists by name (global lookup)
    const existing = await ctx.knex('v4_task_statuses')
      .where({ name: status.name })
      .first();

    if (existing) {
      // Reuse existing global status
      ctx.mappings.task_statuses.set(status.id, existing.id);
    } else {
      // Create new status
      const [newId] = await ctx.knex('v4_task_statuses').insert({
        name: status.name
      });

      ctx.mappings.task_statuses.set(status.id, newId);
    }
  }
}

/**
 * Get total number of ID mappings created
 * Note: agents removed in v4.0
 */
function getTotalMappings(ctx: ImportContext): number {
  return (
    ctx.mappings.files.size +
    ctx.mappings.context_keys.size +
    ctx.mappings.tags.size +
    ctx.mappings.scopes.size +
    ctx.mappings.constraint_categories.size +
    ctx.mappings.layers.size +
    ctx.mappings.task_statuses.size
  );
}
