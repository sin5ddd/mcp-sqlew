/**
 * Shared database queries for context/decision operations
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { Knex } from 'knex';
import {
  getOrCreateAgent,
  getOrCreateContextKey,
  getOrCreateTag,
  getOrCreateScope,
  getLayerId
} from '../../../database.js';
import { STRING_TO_STATUS, DEFAULT_VERSION, DEFAULT_STATUS } from '../../../constants.js';
import { logDecisionSet, logDecisionUpdate, recordDecisionHistory } from '../../../utils/activity-logging.js';
import { parseStringArray } from '../../../utils/param-parser.js';
import type { SetDecisionParams, SetDecisionResponse } from '../types.js';

/**
 * Internal helper: Set decision without wrapping in transaction
 * Used by setDecision (with transaction) and setDecisionBatch (manages its own transaction)
 *
 * @param params - Decision parameters
 * @param adapter - Database adapter instance
 * @param projectId - Project ID
 * @param trx - Optional transaction
 * @returns Response with success status and metadata
 */
export async function setDecisionInternal(
  params: SetDecisionParams,
  adapter: DatabaseAdapter,
  projectId: number,
  trx?: Knex.Transaction
): Promise<SetDecisionResponse> {
  const knex = trx || adapter.getKnex();

  // Validate required parameters
  if (!params.key || params.key.trim() === '') {
    throw new Error('Parameter "key" is required and cannot be empty');
  }

  if (params.value === undefined || params.value === null) {
    throw new Error('Parameter "value" is required');
  }

  // Determine if value is numeric
  const isNumeric = typeof params.value === 'number';
  const value = params.value;

  // Set defaults
  const version = params.version || DEFAULT_VERSION;
  const status = params.status ? STRING_TO_STATUS[params.status] : DEFAULT_STATUS;
  const agentName = params.agent || 'system';

  // Validate layer if provided
  let layerId: number | null = null;
  if (params.layer) {
    const validLayers = ['presentation', 'business', 'data', 'infrastructure', 'cross-cutting'];
    if (!validLayers.includes(params.layer)) {
      throw new Error(`Invalid layer. Must be one of: ${validLayers.join(', ')}`);
    }
    layerId = await getLayerId(adapter, params.layer, trx);
    if (layerId === null) {
      throw new Error(`Layer not found in database: ${params.layer}`);
    }
  }

  // Get or create master records
  const agentId = await getOrCreateAgent(adapter, agentName, trx);
  const keyId = await getOrCreateContextKey(adapter, params.key, trx);

  // Current timestamp
  const ts = Math.floor(Date.now() / 1000);

  // Check if decision already exists for activity logging
  const existingDecision = await knex(isNumeric ? 't_decisions_numeric' : 't_decisions')
    .where({ key_id: keyId, project_id: projectId })
    .first();

  // Insert or update decision based on value type
  const tableName = isNumeric ? 't_decisions_numeric' : 't_decisions';
  const decisionData = {
    key_id: keyId,
    project_id: projectId,
    value: isNumeric ? value : String(value),
    agent_id: agentId,
    layer_id: layerId,
    version: version,
    status: status,
    ts: ts
  };

  // Use transaction-aware upsert
  const conflictColumns = ['key_id', 'project_id'];
  const updateColumns = Object.keys(decisionData).filter(
    key => !conflictColumns.includes(key)
  );
  const updateData = updateColumns.reduce((acc, col) => {
    acc[col] = decisionData[col as keyof typeof decisionData];
    return acc;
  }, {} as Record<string, any>);

  await knex(tableName)
    .insert(decisionData)
    .onConflict(conflictColumns)
    .merge(updateData);

  // Activity logging (replaces triggers)
  if (existingDecision) {
    // Update case - log update and record history
    await logDecisionUpdate(knex, {
      key: params.key,
      old_value: String(existingDecision.value),
      new_value: String(value),
      old_version: existingDecision.version,
      new_version: version,
      agent_id: agentId,
      layer_id: layerId || undefined
    });

    await recordDecisionHistory(knex, {
      key_id: keyId,
      version: existingDecision.version,
      value: String(existingDecision.value),
      agent_id: existingDecision.agent_id,
      ts: existingDecision.ts
    });
  } else {
    // New decision case - log set
    await logDecisionSet(knex, {
      key: params.key,
      value: String(value),
      version: version,
      status: status,
      agent_id: agentId,
      layer_id: layerId || undefined
    });
  }

  // Handle m_tags (many-to-many)
  if (params.tags && params.tags.length > 0) {
    const tags = parseStringArray(params.tags);

    // Clear existing tags for this project
    await knex('t_decision_tags')
      .where({ decision_key_id: keyId, project_id: projectId })
      .delete();

    // Insert new tags
    for (const tagName of tags) {
      const tagId = await getOrCreateTag(adapter, projectId, tagName, trx);
      await knex('t_decision_tags').insert({
        decision_key_id: keyId,
        tag_id: tagId,
        project_id: projectId
      });
    }
  }

  // Handle m_scopes (many-to-many)
  if (params.scopes && params.scopes.length > 0) {
    const scopes = parseStringArray(params.scopes);

    // Clear existing scopes for this project
    await knex('t_decision_scopes')
      .where({ decision_key_id: keyId, project_id: projectId })
      .delete();

    // Insert new scopes
    for (const scopeName of scopes) {
      const scopeId = await getOrCreateScope(adapter, projectId, scopeName, trx);
      await knex('t_decision_scopes').insert({
        decision_key_id: keyId,
        scope_id: scopeId,
        project_id: projectId
      });
    }
  }

  return {
    success: true,
    key: params.key,
    key_id: keyId,
    version: version,
    message: `Decision "${params.key}" set successfully`
  };
}
