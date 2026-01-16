/**
 * Inference Logic Tests
 *
 * Tests for quick_set → set parameter transformation
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { inferDecisionParams } from '../../backend/inference.js';

describe('inferDecisionParams', () => {
  describe('layer inference', () => {
    it('should infer presentation layer from api/ prefix', () => {
      const result = inferDecisionParams({ key: 'api/rate-limit', value: '100' });
      assert.strictEqual(result.transformedParams.layer, 'presentation');
      assert.strictEqual(result.inferred.layer, 'presentation');
    });

    it('should infer presentation layer from endpoint/ prefix', () => {
      const result = inferDecisionParams({ key: 'endpoint/auth', value: 'oauth2' });
      assert.strictEqual(result.transformedParams.layer, 'presentation');
    });

    it('should infer presentation layer from ui/ prefix', () => {
      const result = inferDecisionParams({ key: 'ui/theme', value: 'dark' });
      assert.strictEqual(result.transformedParams.layer, 'presentation');
    });

    it('should infer business layer from service/ prefix', () => {
      const result = inferDecisionParams({ key: 'service/payment', value: 'stripe' });
      assert.strictEqual(result.transformedParams.layer, 'business');
    });

    it('should infer business layer from logic/ prefix', () => {
      const result = inferDecisionParams({ key: 'logic/validation', value: 'strict' });
      assert.strictEqual(result.transformedParams.layer, 'business');
    });

    it('should infer data layer from db/ prefix', () => {
      const result = inferDecisionParams({ key: 'db/engine', value: 'postgresql' });
      assert.strictEqual(result.transformedParams.layer, 'data');
    });

    it('should infer data layer from model/ prefix', () => {
      const result = inferDecisionParams({ key: 'model/user', value: 'active-record' });
      assert.strictEqual(result.transformedParams.layer, 'data');
    });

    it('should infer infrastructure layer from config/ prefix', () => {
      const result = inferDecisionParams({ key: 'config/logging', value: 'debug' });
      assert.strictEqual(result.transformedParams.layer, 'infrastructure');
    });

    it('should infer infrastructure layer from deploy/ prefix', () => {
      const result = inferDecisionParams({ key: 'deploy/strategy', value: 'blue-green' });
      assert.strictEqual(result.transformedParams.layer, 'infrastructure');
    });

    it('should default to business layer for unknown prefix', () => {
      const result = inferDecisionParams({ key: 'custom/setting', value: 'value' });
      assert.strictEqual(result.transformedParams.layer, 'business');
      assert.strictEqual(result.inferred.layer, 'business');
    });

    it('should not override explicitly provided layer', () => {
      const result = inferDecisionParams({
        key: 'api/rate-limit',
        value: '100',
        layer: 'cross-cutting',
      });
      assert.strictEqual(result.transformedParams.layer, 'cross-cutting');
      assert.strictEqual(result.inferred.layer, undefined);
    });
  });

  describe('tags extraction', () => {
    it('should extract tags from slash-separated key', () => {
      const result = inferDecisionParams({ key: 'api/v1/auth', value: 'jwt' });
      assert.deepStrictEqual(result.transformedParams.tags, ['api', 'v1', 'auth']);
      assert.deepStrictEqual(result.inferred.tags, ['api', 'v1', 'auth']);
    });

    it('should extract tags from dash-separated key', () => {
      const result = inferDecisionParams({ key: 'rate-limit-config', value: '100' });
      assert.deepStrictEqual(result.transformedParams.tags, ['rate', 'limit', 'config']);
    });

    it('should extract tags from underscore-separated key', () => {
      const result = inferDecisionParams({ key: 'user_auth_method', value: 'oauth' });
      assert.deepStrictEqual(result.transformedParams.tags, ['user', 'auth', 'method']);
    });

    it('should handle mixed separators', () => {
      const result = inferDecisionParams({ key: 'api/rate-limit_v2', value: '200' });
      assert.deepStrictEqual(result.transformedParams.tags, ['api', 'rate', 'limit', 'v2']);
    });

    it('should not override explicitly provided tags', () => {
      const result = inferDecisionParams({
        key: 'api/rate-limit',
        value: '100',
        tags: ['custom', 'tag'],
      });
      assert.deepStrictEqual(result.transformedParams.tags, ['custom', 'tag']);
      assert.strictEqual(result.inferred.tags, undefined);
    });
  });

  describe('scope inference', () => {
    it('should infer scope from key hierarchy', () => {
      const result = inferDecisionParams({ key: 'api/v1/auth/method', value: 'jwt' });
      assert.deepStrictEqual(result.transformedParams.scopes, ['api/v1/auth']);
      assert.strictEqual(result.inferred.scope, 'api/v1/auth');
    });

    it('should not infer scope for single-part key', () => {
      const result = inferDecisionParams({ key: 'setting', value: 'value' });
      assert.strictEqual(result.transformedParams.scopes, undefined);
      assert.strictEqual(result.inferred.scope, undefined);
    });

    it('should not override explicitly provided scopes', () => {
      const result = inferDecisionParams({
        key: 'api/v1/auth/method',
        value: 'jwt',
        scopes: ['custom-scope'],
      });
      assert.deepStrictEqual(result.transformedParams.scopes, ['custom-scope']);
      assert.strictEqual(result.inferred.scope, undefined);
    });
  });

  describe('default values', () => {
    it('should set default version to v1.0.0', () => {
      const result = inferDecisionParams({ key: 'test', value: 'value' });
      assert.strictEqual(result.transformedParams.version, 'v1.0.0');
    });

    it('should set default status to active', () => {
      const result = inferDecisionParams({ key: 'test', value: 'value' });
      assert.strictEqual(result.transformedParams.status, 'active');
    });

    it('should not override explicitly provided version', () => {
      const result = inferDecisionParams({ key: 'test', value: 'value', version: 'v2.0.0' });
      assert.strictEqual(result.transformedParams.version, 'v2.0.0');
    });

    it('should not override explicitly provided status', () => {
      const result = inferDecisionParams({ key: 'test', value: 'value', status: 'draft' });
      assert.strictEqual(result.transformedParams.status, 'draft');
    });
  });

  describe('passthrough params', () => {
    it('should preserve key and value', () => {
      const result = inferDecisionParams({ key: 'my-key', value: 'my-value' });
      assert.strictEqual(result.transformedParams.key, 'my-key');
      assert.strictEqual(result.transformedParams.value, 'my-value');
    });

    it('should preserve agent if provided', () => {
      const result = inferDecisionParams({ key: 'test', value: 'value', agent: 'claude' });
      assert.strictEqual(result.transformedParams.agent, 'claude');
    });
  });
});
