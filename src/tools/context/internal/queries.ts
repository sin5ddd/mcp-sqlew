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
import { incrementSemver, isValidSemver } from '../../../utils/semver.js';
import { validateAgainstPolicies } from '../../../utils/policy-validator.js';
import { handleSuggestAction } from '../../suggest.js';
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
  const status = params.status ? STRING_TO_STATUS[params.status] : DEFAULT_STATUS;
  const agentName = params.agent || 'system';

  // Validate layer if provided
  let layerId: number | null = null;
  if (params.layer) {
    const validLayers = ['presentation', 'business', 'data', 'infrastructure', 'cross-cutting', 'documentation'];
    if (!validLayers.includes(params.layer)) {
      throw new Error(`Invalid layer. Must be one of: ${validLayers.join(', ')}`);
    }
    layerId = await getLayerId(adapter, params.layer, trx);
    if (layerId === null) {
      throw new Error(`Layer not found in database: ${params.layer}`);
    }
  }

  // Scope validation warning (v3.8.0)
  if (!params.scopes || params.scopes.length === 0) {
    console.warn(`⚠️  Decision "${params.key}" has no scope specified. Defaulting to GLOBAL scope.`);
    console.warn(`   💡 Consider using scopes for better organization:`);
    console.warn(`      - "FEATURE:<name>" for feature-specific decisions`);
    console.warn(`      - "COMPONENT:<name>" for component-level decisions`);
    console.warn(`      - "MODULE:<name>" for module-scoped decisions`);
    console.warn(`      - "GLOBAL" for project-wide decisions (current default)`);
  }

  // Get or create master records
  const agentId = await getOrCreateAgent(adapter, agentName, trx);
  const keyId = await getOrCreateContextKey(adapter, params.key, trx);

  // Current timestamp
  const ts = Math.floor(Date.now() / 1000);

  // Check if decision already exists for activity logging and version management
  const existingDecision = await knex(isNumeric ? 't_decisions_numeric' : 't_decisions')
    .where({ key_id: keyId, project_id: projectId })
    .first();

  // Auto-versioning logic (Task 409)
  let version: string;
  let versionAction: 'initial' | 'explicit' | 'auto_increment_major' | 'auto_increment_minor' | 'auto_increment_patch';

  if (existingDecision) {
    // Update existing decision

    if (params.version) {
      // Explicit version provided - validate and use it
      if (!isValidSemver(params.version)) {
        throw new Error(`Invalid semver format: ${params.version}. Expected MAJOR.MINOR.PATCH (e.g., "1.2.3")`);
      }
      version = params.version;
      versionAction = 'explicit';
    } else if (params.auto_increment) {
      // Auto-increment with specified level
      if (!['major', 'minor', 'patch'].includes(params.auto_increment)) {
        throw new Error(`Invalid auto_increment level: ${params.auto_increment}. Expected: major, minor, or patch`);
      }
      version = incrementSemver(existingDecision.version, params.auto_increment);
      versionAction = `auto_increment_${params.auto_increment}` as 'auto_increment_major' | 'auto_increment_minor' | 'auto_increment_patch';
    } else {
      // Default: auto-increment patch version
      version = incrementSemver(existingDecision.version, 'patch');
      versionAction = 'auto_increment_patch';
    }
  } else {
    // New decision
    if (params.version) {
      if (!isValidSemver(params.version)) {
        throw new Error(`Invalid semver format: ${params.version}. Expected MAJOR.MINOR.PATCH (e.g., "1.2.3")`);
      }
      version = params.version;
    } else {
      version = DEFAULT_VERSION;
    }
    versionAction = 'initial';
  }

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

  // Build response object
  const response: SetDecisionResponse = {
    success: true,
    key: params.key,
    key_id: keyId,
    version: version,
    version_action: versionAction,
    message: existingDecision
      ? `Decision "${params.key}" updated to version ${version}`
      : `Decision "${params.key}" created at version ${version}`
  };

  // Task 407: Policy validation and auto-trigger suggestions
  try {
    // Validate decision against policies
    const validationResult = await validateAgainstPolicies(
      adapter,
      params.key,
      value,
      {
        rationale: (params as any).rationale,
        alternatives: (params as any).alternatives,
        tradeoffs: (params as any).tradeoffs,
        ...params
      }
    );

    // Add policy validation result to response
    if (validationResult.matchedPolicy) {
      response.policy_validation = {
        matched_policy: validationResult.matchedPolicy.name,
        violations: validationResult.violations
      };
    }

    // Auto-trigger suggestions if policy has suggest_similar=1
    if (validationResult.matchedPolicy && validationResult.valid) {
      // Query policy to check suggest_similar flag
      const policy = await knex('t_decision_policies')
        .where({ id: validationResult.matchedPolicy.id })
        .select('suggest_similar')
        .first();

      if (policy && policy.suggest_similar === 1) {
        try {
          // Auto-trigger suggestions with higher threshold
          const tags = params.tags ? parseStringArray(params.tags) : [];
          const suggestions = await handleSuggestAction({
            action: 'by_context',
            key: params.key,
            tags,
            layer: params.layer,
            limit: 3,
            min_score: 50
          });

          // Add suggestions to response if any found
          if (suggestions.count > 0) {
            response.suggestions = {
              triggered_by: validationResult.matchedPolicy.name,
              reason: 'Policy has suggest_similar enabled',
              suggestions: suggestions.suggestions
            };
          }
        } catch (suggestError) {
          // Non-critical - log but don't fail the decision.set operation
          console.warn('[Auto-trigger] Suggestion failed:', suggestError);
        }
      }
    }
  } catch (validationError) {
    // Non-critical - log but don't fail the decision.set operation
    console.warn('[Policy Validation] Validation failed:', validationError);
  }

  return response;
}
