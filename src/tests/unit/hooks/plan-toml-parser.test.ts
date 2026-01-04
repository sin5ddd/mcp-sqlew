/**
 * Plan TOML Parser Unit Tests
 *
 * Tests for extracting and parsing [[decision]] and [[constraint]]
 * from ```toml blocks in plan markdown files.
 *
 * @since v4.2.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  extractTomlBlocks,
  parseTomlBlock,
  parsePlanToml,
} from '../../../cli/hooks/plan-toml-parser.js';

describe('plan-toml-parser', () => {
  describe('extractTomlBlocks', () => {
    it('should extract single toml block', () => {
      const content = `
# Plan

Some text here.

\`\`\`toml
[[decision]]
key = "test"
value = "value"
\`\`\`

More text.
`;
      const blocks = extractTomlBlocks(content);
      assert.strictEqual(blocks.length, 1);
      assert.ok(blocks[0].includes('[[decision]]'));
    });

    it('should extract multiple toml blocks', () => {
      const content = `
\`\`\`toml
[[decision]]
key = "first"
value = "one"
\`\`\`

Some text between.

\`\`\`toml
[[decision]]
key = "second"
value = "two"
\`\`\`
`;
      const blocks = extractTomlBlocks(content);
      assert.strictEqual(blocks.length, 2);
    });

    it('should handle empty content', () => {
      const blocks = extractTomlBlocks('');
      assert.strictEqual(blocks.length, 0);
    });

    it('should ignore non-toml code blocks', () => {
      const content = `
\`\`\`javascript
const x = 1;
\`\`\`

\`\`\`toml
[[decision]]
key = "test"
value = "value"
\`\`\`

\`\`\`python
print("hello")
\`\`\`
`;
      const blocks = extractTomlBlocks(content);
      assert.strictEqual(blocks.length, 1);
    });

    it('should be case-insensitive for toml tag', () => {
      const content = `
\`\`\`TOML
[[decision]]
key = "upper"
value = "case"
\`\`\`
`;
      const blocks = extractTomlBlocks(content);
      assert.strictEqual(blocks.length, 1);
    });
  });

  describe('parseTomlBlock - decisions', () => {
    it('should parse decision with required fields only', () => {
      const toml = `
[[decision]]
key = "api/auth"
value = "Use JWT tokens"
`;
      const result = parseTomlBlock(toml);
      assert.strictEqual(result.decisions.length, 1);
      assert.strictEqual(result.decisions[0].key, 'api/auth');
      assert.strictEqual(result.decisions[0].value, 'Use JWT tokens');
    });

    it('should parse decision with all optional fields', () => {
      const toml = `
[[decision]]
key = "database/orm"
value = "Knex query builder"
status = "active"
layer = "data"
tags = ["database", "architecture"]
rationale = "Explicit SQL control"
alternatives = ["TypeORM", "Prisma"]
tradeoffs = "Learning curve vs flexibility"
`;
      const result = parseTomlBlock(toml);
      assert.strictEqual(result.decisions.length, 1);
      const d = result.decisions[0];
      assert.strictEqual(d.key, 'database/orm');
      assert.strictEqual(d.value, 'Knex query builder');
      assert.strictEqual(d.status, 'active');
      assert.strictEqual(d.layer, 'data');
      assert.deepStrictEqual(d.tags, ['database', 'architecture']);
      assert.strictEqual(d.rationale, 'Explicit SQL control');
      assert.deepStrictEqual(d.alternatives, ['TypeORM', 'Prisma']);
      assert.strictEqual(d.tradeoffs, 'Learning curve vs flexibility');
    });

    it('should parse multiple decisions', () => {
      const toml = `
[[decision]]
key = "first"
value = "First decision"

[[decision]]
key = "second"
value = "Second decision"

[[decision]]
key = "third"
value = "Third decision"
`;
      const result = parseTomlBlock(toml);
      assert.strictEqual(result.decisions.length, 3);
    });

    it('should skip invalid decisions (missing required fields)', () => {
      const toml = `
[[decision]]
key = "valid"
value = "This is valid"

[[decision]]
key = "missing-value"

[[decision]]
value = "missing-key"
`;
      const result = parseTomlBlock(toml);
      assert.strictEqual(result.decisions.length, 1);
      assert.strictEqual(result.decisions[0].key, 'valid');
    });
  });

  describe('parseTomlBlock - constraints', () => {
    it('should parse constraint with required fields only', () => {
      const toml = `
[[constraint]]
text = "All API endpoints must validate JWT"
category = "security"
`;
      const result = parseTomlBlock(toml);
      assert.strictEqual(result.constraints.length, 1);
      assert.strictEqual(result.constraints[0].text, 'All API endpoints must validate JWT');
      assert.strictEqual(result.constraints[0].category, 'security');
    });

    it('should parse constraint with all optional fields', () => {
      const toml = `
[[constraint]]
text = "No raw SQL strings"
category = "code-style"
priority = "high"
layer = "data"
tags = ["database", "security"]
rationale = "Prevent SQL injection"
`;
      const result = parseTomlBlock(toml);
      assert.strictEqual(result.constraints.length, 1);
      const c = result.constraints[0];
      assert.strictEqual(c.text, 'No raw SQL strings');
      assert.strictEqual(c.category, 'code-style');
      assert.strictEqual(c.priority, 'high');
      assert.strictEqual(c.layer, 'data');
      assert.deepStrictEqual(c.tags, ['database', 'security']);
      assert.strictEqual(c.rationale, 'Prevent SQL injection');
    });

    it('should parse multiple constraints', () => {
      const toml = `
[[constraint]]
text = "First rule"
category = "security"

[[constraint]]
text = "Second rule"
category = "performance"
`;
      const result = parseTomlBlock(toml);
      assert.strictEqual(result.constraints.length, 2);
    });

    it('should skip invalid constraints (missing required fields)', () => {
      const toml = `
[[constraint]]
text = "Valid constraint"
category = "security"

[[constraint]]
text = "Missing category"

[[constraint]]
category = "missing-text"
`;
      const result = parseTomlBlock(toml);
      assert.strictEqual(result.constraints.length, 1);
      assert.strictEqual(result.constraints[0].text, 'Valid constraint');
    });
  });

  describe('parseTomlBlock - mixed decisions and constraints', () => {
    it('should parse both decisions and constraints from same block', () => {
      const toml = `
[[decision]]
key = "auth/method"
value = "JWT with refresh tokens"
layer = "business"

[[constraint]]
text = "All endpoints must validate JWT"
category = "security"
priority = "critical"

[[decision]]
key = "database/engine"
value = "PostgreSQL 15"
layer = "data"

[[constraint]]
text = "Use parameterized queries only"
category = "security"
`;
      const result = parseTomlBlock(toml);
      assert.strictEqual(result.decisions.length, 2);
      assert.strictEqual(result.constraints.length, 2);
    });
  });

  describe('parsePlanToml - end-to-end', () => {
    it('should parse complete plan markdown with toml blocks', () => {
      const content = `
# Implementation Plan

## Overview
This is a plan for implementing authentication.

## Architectural Decisions & Constraints

\`\`\`toml
[[decision]]
key = "auth/provider"
value = "Custom JWT implementation"
status = "active"
layer = "business"
tags = ["auth", "security"]
rationale = "Full control over token lifecycle"

[[constraint]]
text = "JWT tokens must expire within 15 minutes"
category = "security"
priority = "critical"
layer = "business"
\`\`\`

## Implementation Steps

1. Create token service
2. Add middleware

## Additional Constraints

\`\`\`toml
[[constraint]]
text = "Store refresh tokens in HTTP-only cookies"
category = "security"
priority = "high"
\`\`\`
`;
      const result = parsePlanToml(content);
      assert.strictEqual(result.decisions.length, 1);
      assert.strictEqual(result.constraints.length, 2);
      assert.strictEqual(result.decisions[0].key, 'auth/provider');
      assert.strictEqual(result.constraints[0].text, 'JWT tokens must expire within 15 minutes');
      assert.strictEqual(result.constraints[1].text, 'Store refresh tokens in HTTP-only cookies');
    });

    it('should handle plan with no toml blocks', () => {
      const content = `
# Simple Plan

Just some text without any TOML.
`;
      const result = parsePlanToml(content);
      assert.strictEqual(result.decisions.length, 0);
      assert.strictEqual(result.constraints.length, 0);
    });

    it('should handle malformed toml gracefully', () => {
      const content = `
\`\`\`toml
this is not valid toml
{ broken json
\`\`\`
`;
      // Should not throw, just return empty
      const result = parsePlanToml(content);
      assert.strictEqual(result.decisions.length, 0);
      assert.strictEqual(result.constraints.length, 0);
    });
  });
});
