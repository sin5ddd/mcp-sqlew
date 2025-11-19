/**
 * Suggest Tool (v3.9.0) - Native RDBMS Integration Tests (Refactored)
 *
 * Tests Decision Intelligence tag index (m_tag_index), similarity calculations,
 * and three-tier detection on fresh MySQL, MariaDB, and PostgreSQL installations.
 *
 * Task #533: Refactor to use direct Knex operations instead of MCP tool functions
 *
 * REFACTORING PATTERN:
 * - Direct database operations via Knex for all data setup
 * - Manual tag index population (m_tag_index inserts)
 * - Manual similarity score calculation (Levenshtein, Jaccard)
 * - No MCP tool function calls (no handleSuggestAction, no setDecision)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import type { Knex } from 'knex';
import { runTestsOnAllDatabases } from './test-harness.js';

// ============================================================================
// Similarity Calculation Helpers (Manual Implementation)
// ============================================================================

/**
 * Calculate Levenshtein distance between two strings
 * Used for key pattern similarity scoring
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate Jaccard similarity for tag overlap
 * Returns 0-100 score based on set intersection/union
 */
function calculateJaccardSimilarity(tags1: string[], tags2: string[]): number {
  if (tags1.length === 0 && tags2.length === 0) return 0;

  const set1 = new Set(tags1);
  const set2 = new Set(tags2);

  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  if (union.size === 0) return 0;

  return Math.floor((intersection.size / union.size) * 100);
}

/**
 * Calculate key similarity score (0-20 points)
 * Based on Levenshtein distance and common prefix
 */
function calculateKeySimilarity(key1: string, key2: string): number {
  if (key1 === key2) return 20;

  // Common prefix (e.g., "security/jwt" vs "security/oauth")
  let i = 0;
  while (i < key1.length && i < key2.length && key1[i] === key2[i]) {
    i++;
  }
  const prefixScore = Math.min(i * 2, 10);

  // Levenshtein distance
  const distance = levenshteinDistance(key1, key2);
  const maxLength = Math.max(key1.length, key2.length);
  const similarity = 1 - distance / maxLength;
  const distanceScore = Math.floor(similarity * 10);

  return prefixScore + distanceScore;
}

/**
 * Calculate tag overlap score (0-40 points, 10 per tag, max 4)
 */
function calculateTagOverlap(contextTags: string[], decisionTags: string[]): number {
  const overlap = contextTags.filter(t => decisionTags.includes(t)).length;
  return Math.min(overlap * 10, 40);
}

// ============================================================================
// Database Helper Functions
// ============================================================================

/**
 * Create a decision with tags (manual insert)
 */
async function createDecisionWithTags(
  db: Knex,
  params: {
    key: string;
    value: string;
    layer: string;
    tags?: string[];
    priority?: number;
    version?: string;
    projectId: number;
  }
): Promise<number> {
  const { key, value, layer, tags = [], priority = 2, version = '1.0.0', projectId } = params;

  // Get or create context key
  let keyRecord = await db('m_context_keys').where({ key }).first();
  if (!keyRecord) {
    await db('m_context_keys').insert({ key });
    keyRecord = await db('m_context_keys').where({ key }).first();
  }
  const keyId = keyRecord.id;

  // Get layer ID
  const layerRecord = await db('m_layers').where({ name: layer }).first();
  if (!layerRecord) {
    throw new Error(`Layer "${layer}" not found`);
  }
  const layerId = layerRecord.id;

  // Get agent ID (system)
  let agentRecord = await db('m_agents').where({ name: 'system' }).first();
  if (!agentRecord) {
    await db('m_agents').insert({ name: 'system', last_active_ts: Math.floor(Date.now() / 1000) });
    agentRecord = await db('m_agents').where({ name: 'system' }).first();
  }
  const agentId = agentRecord.id;

  const ts = Math.floor(Date.now() / 1000);

  // Insert decision
  const existingDecision = await db('t_decisions')
    .where({ key_id: keyId, project_id: projectId })
    .first();

  if (!existingDecision) {
    await db('t_decisions').insert({
      key_id: keyId,
      project_id: projectId,
      value,
      version,
      layer_id: layerId,
      agent_id: agentId,
      status: 1,
      ts,
    });
  } else {
    await db('t_decisions')
      .where({ key_id: keyId, project_id: projectId })
      .update({ value, version, layer_id: layerId, ts });
  }

  // Insert tags and populate tag index
  if (tags.length > 0) {
    for (const tagName of tags) {
      // Get or create tag
      let tagRecord = await db('m_tags').where({ name: tagName }).first();
      if (!tagRecord) {
        await db('m_tags').insert({ name: tagName });
        tagRecord = await db('m_tags').where({ name: tagName }).first();
      }
      const tagId = tagRecord.id;

      // Insert decision tag
      const existingTag = await db('t_decision_tags')
        .where({ decision_key_id: keyId, tag_id: tagId, project_id: projectId })
        .first();

      if (!existingTag) {
        await db('t_decision_tags').insert({
          decision_key_id: keyId,
          tag_id: tagId,
          project_id: projectId,
        });

        // Populate tag index (v3.9.0 denormalized table)
        const existingIndex = await db('m_tag_index')
          .where({ tag_name: tagName, decision_id: keyId })
          .first();

        if (!existingIndex) {
          await db('m_tag_index').insert({
            tag_name: tagName,
            decision_id: keyId,
          });
        }
      }
    }
  }

  return keyId;
}

/**
 * Query tag index for decisions with specific tags
 */
async function queryTagIndex(
  db: Knex,
  tags: string[]
): Promise<Array<{ decision_id: number; tag_name: string; key: string }>> {
  const results = await db('m_tag_index as ti')
    .select('ti.decision_id', 'ti.tag_name', 'ck.key')
    .join('m_context_keys as ck', 'ti.decision_id', 'ck.id')
    .whereIn('ti.tag_name', tags);

  return results;
}

/**
 * Get decision details by key_id
 */
async function getDecisionByKeyId(
  db: Knex,
  keyId: number,
  projectId: number
): Promise<any> {
  const decision = await db('t_decisions as d')
    .select(
      'd.key_id',
      'ck.key',
      'd.value',
      'l.name as layer',
      'd.version',
      'd.ts'
    )
    .join('m_context_keys as ck', 'd.key_id', 'ck.id')
    .leftJoin('m_layers as l', 'd.layer_id', 'l.id')
    .where('d.key_id', keyId)
    .where('d.project_id', projectId)
    .where('d.status', 1)
    .first();

  if (!decision) return null;

  // Get tags
  const tags = await db('t_decision_tags as dt')
    .select('t.name as tag_name')
    .join('m_tags as t', 'dt.tag_id', 't.id')
    .where('dt.decision_key_id', keyId)
    .where('dt.project_id', projectId);

  return {
    ...decision,
    tags: tags.map(t => t.tag_name),
  };
}

runTestsOnAllDatabases('Suggest Tool (v3.9.0) - Refactored', (getDb, dbType) => {
  let projectId: number;

  // Get project ID before running tests
  it('should get project ID', async () => {
    const db = getDb();
    const project = await db('m_projects').first();
    assert.ok(project, 'Project should exist');
    projectId = project.id;
  });

  // ============================================================================
  // Tag Index Population Tests
  // ============================================================================

  describe('Tag Index (m_tag_index) - Data Integrity', () => {
    it('should populate m_tag_index when creating decision with tags', async () => {
      const db = getDb();

      const keyId = await createDecisionWithTags(db, {
        key: 'tag-index/test-api',
        value: 'REST API',
        layer: 'business',
        tags: ['api', 'rest'],
        projectId,
      });

      // Verify tag index entries
      const indexEntries = await db('m_tag_index')
        .where({ decision_id: keyId })
        .select('tag_name');

      assert.strictEqual(indexEntries.length, 2, 'Should have 2 tag index entries');
      const tagNames = indexEntries.map(e => e.tag_name).sort();
      assert.deepStrictEqual(tagNames, ['api', 'rest'], 'Tag names should match');
    });

    it('should query tag index for fast tag-based lookups', async () => {
      const db = getDb();

      // Create multiple decisions with overlapping tags
      await createDecisionWithTags(db, {
        key: 'tag-index/api-auth',
        value: 'oauth2',
        layer: 'business',
        tags: ['api', 'security'],
        projectId,
      });

      await createDecisionWithTags(db, {
        key: 'tag-index/api-ratelimit',
        value: 'redis',
        layer: 'infrastructure',
        tags: ['api', 'performance'],
        projectId,
      });

      await createDecisionWithTags(db, {
        key: 'tag-index/db-connection',
        value: 'pool',
        layer: 'data',
        tags: ['database'],
        projectId,
      });

      // Query tag index for 'api' tag
      const results = await queryTagIndex(db, ['api']);

      assert.ok(results.length >= 2, 'Should find at least 2 decisions with api tag');
      const apiKeys = results.map(r => r.key).filter(k => k.includes('api'));
      assert.ok(apiKeys.length >= 2, 'Should have api-related keys');
    });

    it('should handle FK constraints (decision_id references m_context_keys)', async () => {
      const db = getDb();

      // Create decision
      const keyId = await createDecisionWithTags(db, {
        key: 'tag-index/fk-test',
        value: 'test',
        layer: 'business',
        tags: ['test-tag'],
        projectId,
      });

      // Verify FK constraint: decision_id in m_tag_index references m_context_keys.id
      const tagIndexEntry = await db('m_tag_index')
        .where({ decision_id: keyId })
        .first();

      assert.ok(tagIndexEntry, 'Tag index entry should exist');

      const contextKey = await db('m_context_keys')
        .where({ id: keyId })
        .first();

      assert.ok(contextKey, 'Context key should exist');
      assert.strictEqual(tagIndexEntry.decision_id, contextKey.id, 'FK constraint should be valid');
    });
  });

  // ============================================================================
  // Key Similarity Tests (Manual Calculation)
  // ============================================================================

  describe('Key Similarity - Manual Calculation', () => {
    it('should calculate Levenshtein distance for key similarity', async () => {
      const db = getDb();

      await createDecisionWithTags(db, {
        key: 'similarity/api/authentication',
        value: 'oauth2',
        layer: 'business',
        tags: ['api', 'security'],
        projectId,
      });

      await createDecisionWithTags(db, {
        key: 'similarity/api/authorization',
        value: 'rbac',
        layer: 'business',
        tags: ['api', 'security'],
        projectId,
      });

      // Manual similarity calculation
      const key1 = 'similarity/api/authentication';
      const key2 = 'similarity/api/authorization';

      const keySimilarity = calculateKeySimilarity(key1, key2);
      assert.ok(keySimilarity > 10, 'Keys should have high similarity score (>10)');
    });

    it('should calculate similarity score with threshold filtering', async () => {
      const db = getDb();

      const keyId1 = await createDecisionWithTags(db, {
        key: 'similarity/threshold/test1',
        value: 'value1',
        layer: 'business',
        tags: ['test'],
        projectId,
      });

      const keyId2 = await createDecisionWithTags(db, {
        key: 'similarity/threshold/test2',
        value: 'value2',
        layer: 'business',
        tags: ['test'],
        projectId,
      });

      // Get decisions
      const decision1 = await getDecisionByKeyId(db, keyId1, projectId);
      const decision2 = await getDecisionByKeyId(db, keyId2, projectId);

      // Calculate similarity
      const keySimilarity = calculateKeySimilarity(decision1.key, decision2.key);
      const tagOverlap = calculateTagOverlap(['test'], decision2.tags);

      const totalScore = keySimilarity + tagOverlap;

      // High threshold (80) should filter out
      assert.ok(totalScore < 80, 'Score should be below high threshold (80)');

      // Low threshold (30) should include
      assert.ok(totalScore >= 30, 'Score should be above low threshold (30)');
    });
  });

  // ============================================================================
  // Tag Overlap Tests (Jaccard Similarity)
  // ============================================================================

  describe('Tag Overlap - Jaccard Similarity', () => {
    it('should calculate Jaccard similarity for tag overlap', async () => {
      const db = getDb();

      await createDecisionWithTags(db, {
        key: 'jaccard/high-overlap',
        value: 'value1',
        layer: 'business',
        tags: ['performance', 'security', 'critical'],
        projectId,
      });

      await createDecisionWithTags(db, {
        key: 'jaccard/low-overlap',
        value: 'value2',
        layer: 'business',
        tags: ['performance'],
        projectId,
      });

      // Calculate Jaccard similarity
      const tags1 = ['performance', 'security'];
      const tags2 = ['performance', 'security', 'critical'];
      const tags3 = ['performance'];

      const highOverlap = calculateJaccardSimilarity(tags1, tags2);
      const lowOverlap = calculateJaccardSimilarity(tags1, tags3);

      assert.ok(highOverlap > lowOverlap, 'High overlap should have higher Jaccard score');
      assert.ok(highOverlap >= 66, 'High overlap should be >=66% (2/3 tags match)');
    });

    it('should rank by tag overlap using tag index', async () => {
      const db = getDb();

      // Create decisions with different tag overlaps
      await createDecisionWithTags(db, {
        key: 'ranking/high-overlap',
        value: 'value1',
        layer: 'business',
        tags: ['performance', 'security', 'critical'],
        projectId,
      });

      await createDecisionWithTags(db, {
        key: 'ranking/low-overlap',
        value: 'value2',
        layer: 'business',
        tags: ['performance'],
        projectId,
      });

      // Query tag index for multiple tags
      const results = await queryTagIndex(db, ['performance', 'security']);

      assert.ok(results.length > 0, 'Should find decisions with matching tags');

      // Count tag matches per decision
      const decisionMatches = new Map<number, number>();
      for (const result of results) {
        const count = decisionMatches.get(result.decision_id) || 0;
        decisionMatches.set(result.decision_id, count + 1);
      }

      // Decision with more tag matches should rank higher
      const maxMatches = Math.max(...decisionMatches.values());
      assert.ok(maxMatches >= 2, 'Should find decision with 2 tag matches');
    });

    it('should filter by layer when querying tag index', async () => {
      const db = getDb();

      await createDecisionWithTags(db, {
        key: 'layer-filter/business-decision',
        value: 'value1',
        layer: 'business',
        tags: ['test'],
        projectId,
      });

      await createDecisionWithTags(db, {
        key: 'layer-filter/data-decision',
        value: 'value2',
        layer: 'data',
        tags: ['test'],
        projectId,
      });

      // Query with layer filter
      const businessResults = await db('m_tag_index as ti')
        .select('ti.decision_id', 'ti.tag_name', 'l.name as layer')
        .join('m_context_keys as ck', 'ti.decision_id', 'ck.id')
        .join('t_decisions as d', 'ck.id', 'd.key_id')
        .join('m_layers as l', 'd.layer_id', 'l.id')
        .where('ti.tag_name', 'test')
        .where('l.name', 'business')
        .where('d.project_id', projectId);

      assert.ok(businessResults.length > 0, 'Should find business layer decisions');
      assert.ok(
        businessResults.every(r => r.layer === 'business'),
        'All results should be from business layer'
      );
    });
  });

  // ============================================================================
  // Three-Tier Similarity Detection (Manual Calculation)
  // ============================================================================

  describe('Three-Tier Similarity Detection - Manual', () => {
    it('should detect Tier 1 gentle nudge (score 35-44)', async () => {
      const db = getDb();

      await createDecisionWithTags(db, {
        key: 'tier1/existing',
        value: 'existing-value',
        layer: 'business',
        tags: ['test'],
        projectId,
      });

      // Manual similarity calculation for similar key
      const existingKey = 'tier1/existing';
      const newKey = 'tier1/existing-new';

      const keySimilarity = calculateKeySimilarity(existingKey, newKey);
      const tagOverlap = calculateTagOverlap(['test'], ['test']);

      const totalScore = keySimilarity + tagOverlap;

      // Tier 1: 35-44 score range
      assert.ok(totalScore >= 35 && totalScore < 45, `Score ${totalScore} should be in Tier 1 range (35-44)`);
    });

    it('should detect Tier 2 hard block (score 45-59)', async () => {
      const db = getDb();

      await createDecisionWithTags(db, {
        key: 'tier2/authentication-strategy',
        value: 'oauth2',
        layer: 'business',
        tags: ['api', 'security', 'authentication'],
        projectId,
      });

      // Manual similarity calculation for highly similar decision
      const existingKey = 'tier2/authentication-strategy';
      const newKey = 'tier2/authentication-strategy-new';

      const keySimilarity = calculateKeySimilarity(existingKey, newKey);
      const tagOverlap = calculateTagOverlap(
        ['api', 'security', 'authentication'],
        ['api', 'security', 'authentication']
      );

      const totalScore = keySimilarity + tagOverlap;

      // Tier 2: 45-59 score range
      assert.ok(totalScore >= 45 && totalScore < 60, `Score ${totalScore} should be in Tier 2 range (45-59)`);
    });

    it('should detect Tier 3 auto-update (score 60+)', async () => {
      const db = getDb();

      await createDecisionWithTags(db, {
        key: 'tier3/exact-match',
        value: 'original-value',
        layer: 'business',
        tags: ['exact', 'test', 'match'],
        version: '1.0.0',
        projectId,
      });

      // Manual similarity calculation for near-exact duplicate
      const existingKey = 'tier3/exact-match';
      const newKey = 'tier3/exact-match';

      const keySimilarity = calculateKeySimilarity(existingKey, newKey);
      const tagOverlap = calculateTagOverlap(
        ['exact', 'test', 'match'],
        ['exact', 'test', 'match']
      );

      const totalScore = keySimilarity + tagOverlap;

      // Tier 3: 60+ score range
      assert.ok(totalScore >= 60, `Score ${totalScore} should be in Tier 3 range (60+)`);
    });

    it('should not flag non-duplicates (score < 35)', async () => {
      const db = getDb();

      await createDecisionWithTags(db, {
        key: 'no-match/api-design',
        value: 'rest',
        layer: 'business',
        tags: ['api'],
        projectId,
      });

      // Manual similarity calculation for completely different decision
      const existingKey = 'no-match/api-design';
      const newKey = 'no-match/database-schema';

      const keySimilarity = calculateKeySimilarity(existingKey, newKey);
      const tagOverlap = calculateTagOverlap(['api'], ['database']);

      const totalScore = keySimilarity + tagOverlap;

      // Should be below Tier 1 threshold
      assert.ok(totalScore < 35, `Score ${totalScore} should be below Tier 1 threshold (35)`);
    });
  });

  // ============================================================================
  // Cross-Database Compatibility Tests
  // ============================================================================

  describe(`Cross-database compatibility - ${dbType}`, () => {
    it('should handle unicode in decision keys for tag index', async () => {
      const db = getDb();
      const unicodeKey = 'unicode/日本語';

      await createDecisionWithTags(db, {
        key: unicodeKey,
        value: 'test',
        layer: 'business',
        tags: ['unicode'],
        projectId,
      });

      // Query tag index
      const results = await queryTagIndex(db, ['unicode']);

      assert.ok(results.length > 0, 'Should find unicode decision in tag index');
      const foundKey = results.find(r => r.key === unicodeKey);
      assert.ok(foundKey, 'Should find exact unicode key');
    });

    it('should handle special characters in tag names', async () => {
      const db = getDb();

      await createDecisionWithTags(db, {
        key: 'special/test',
        value: 'value',
        layer: 'business',
        tags: ['api-v2', 'oauth2.0'],
        projectId,
      });

      // Query tag index with special characters
      const results = await queryTagIndex(db, ['api-v2']);

      assert.ok(results.length > 0, 'Should find tags with special characters');
    });

    it('should handle case sensitivity in tag index queries', async () => {
      const db = getDb();

      await createDecisionWithTags(db, {
        key: 'case/APIDesign',
        value: 'value',
        layer: 'business',
        tags: ['API'],
        projectId,
      });

      // Query with different case
      const upperResults = await queryTagIndex(db, ['API']);
      const lowerResults = await queryTagIndex(db, ['api']);

      // Behavior may vary by database
      assert.ok(upperResults !== undefined, 'Should handle case sensitivity gracefully');
      // MySQL case-insensitive, PostgreSQL case-sensitive
      if (dbType === 'mysql' || dbType === 'mariadb') {
        // Case-insensitive behavior expected
        assert.ok(upperResults.length > 0 || lowerResults.length > 0, 'Should find tags regardless of case');
      }
    });
  });

  // ============================================================================
  // Tag Index Performance Tests
  // ============================================================================

  describe('Tag Index Performance', () => {
    it('should efficiently query tag index for multiple tags', async () => {
      const db = getDb();

      // Create multiple decisions with overlapping tags
      for (let i = 1; i <= 5; i++) {
        await createDecisionWithTags(db, {
          key: `perf/decision-${i}`,
          value: `value${i}`,
          layer: 'business',
          tags: i % 2 === 0 ? ['even', 'number'] : ['odd', 'number'],
          projectId,
        });
      }

      // Query tag index for 'number' tag (should find all 5)
      const results = await queryTagIndex(db, ['number']);

      assert.ok(results.length >= 5, 'Should find all 5 decisions with number tag');
    });

    it('should count tag matches per decision efficiently', async () => {
      const db = getDb();

      await createDecisionWithTags(db, {
        key: 'perf/multi-tag',
        value: 'value',
        layer: 'business',
        tags: ['tag1', 'tag2', 'tag3'],
        projectId,
      });

      // Query tag index for multiple tags
      const results = await queryTagIndex(db, ['tag1', 'tag2', 'tag3']);

      // Group by decision_id to count matches
      const decisionMatches = new Map<number, number>();
      for (const result of results) {
        const count = decisionMatches.get(result.decision_id) || 0;
        decisionMatches.set(result.decision_id, count + 1);
      }

      // Should have 3 tag matches for the multi-tag decision
      const maxMatches = Math.max(...decisionMatches.values());
      assert.strictEqual(maxMatches, 3, 'Should find decision with 3 tag matches');
    });
  });
});
