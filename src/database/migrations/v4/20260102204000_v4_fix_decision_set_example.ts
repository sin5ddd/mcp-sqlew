/**
 * Migration: Fix decision.set example that incorrectly shows rationale/alternatives/tradeoffs
 *
 * The original example in 20251225000000_v4_seed_missing_help_data.ts incorrectly shows
 * rationale, alternatives, and tradeoffs as parameters for decision.set action.
 * These are actually parameters for add_decision_context action.
 *
 * This migration updates the example to show the correct 2-step workflow.
 *
 * @since v4.2.1
 */

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Find the incorrect example
  const example = await knex('v4_help_action_examples')
    .where('title', 'Decision with context')
    .whereRaw("code LIKE '%rationale%'")
    .first();

  if (!example) {
    // Example not found or already fixed
    return;
  }

  // Correct example: show 2-step workflow
  const correctCode = JSON.stringify({
    action: 'set',
    key: 'database/orm',
    value: 'Prisma',
    tags: ['database', 'orm'],
    layer: 'data'
  }, null, 2);

  const contextNote = `

// To add context (rationale, alternatives, tradeoffs), use add_decision_context:
${JSON.stringify({
    action: 'add_decision_context',
    key: 'database/orm',
    rationale: 'Type safety and migration support',
    alternatives: 'TypeORM, Knex, raw SQL',
    tradeoffs: 'Learning curve, but better DX'
  }, null, 2)}`;

  await knex('v4_help_action_examples')
    .where('id', example.id)
    .update({
      title: 'Decision with context (2-step)',
      code: correctCode + contextNote,
      explanation: 'First create decision with set, then add context with add_decision_context action'
    });
}

export async function down(knex: Knex): Promise<void> {
  // Revert to original (incorrect) example
  const example = await knex('v4_help_action_examples')
    .where('title', 'Decision with context (2-step)')
    .first();

  if (!example) {
    return;
  }

  const originalCode = JSON.stringify({
    action: 'set',
    key: 'database/orm',
    value: 'Prisma',
    tags: ['database', 'orm'],
    layer: 'data',
    rationale: 'Type safety and migration support',
    alternatives: 'TypeORM, Knex, raw SQL',
    tradeoffs: 'Learning curve, but better DX'
  }, null, 2);

  await knex('v4_help_action_examples')
    .where('id', example.id)
    .update({
      title: 'Decision with context',
      code: originalCode,
      explanation: 'Store a decision with full context (rationale, alternatives, tradeoffs)'
    });
}
