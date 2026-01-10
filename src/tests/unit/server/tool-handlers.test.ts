/**
 * Tool Handlers Unit Tests
 *
 * Tests for error detection and fallback logic in tool-handlers.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { isLocalFallbackRequired } from '../../../server/tool-handlers.js';

describe('isLocalFallbackRequired', () => {
  describe('UNSUPPORTED_TOOL error', () => {
    it('should return true for UNSUPPORTED_TOOL code', () => {
      const error = { code: 'UNSUPPORTED_TOOL', message: 'Tool not supported' };
      assert.strictEqual(isLocalFallbackRequired(error), true);
    });

    it('should return true for UNSUPPORTED_TOOL without message', () => {
      const error = { code: 'UNSUPPORTED_TOOL' };
      assert.strictEqual(isLocalFallbackRequired(error), true);
    });
  });

  describe('LOCAL_ONLY_ACTION error', () => {
    it('should return true for LOCAL_ONLY_ACTION code', () => {
      const error = { code: 'LOCAL_ONLY_ACTION', message: 'Action requires local processing' };
      assert.strictEqual(isLocalFallbackRequired(error), true);
    });

    it('should return true for LOCAL_ONLY_ACTION with tool and action info', () => {
      const error = {
        code: 'LOCAL_ONLY_ACTION',
        message: 'decision.help requires local processing',
        tool: 'decision',
        action: 'help',
      };
      assert.strictEqual(isLocalFallbackRequired(error), true);
    });

    it('should return true for LOCAL_ONLY_ACTION without message', () => {
      const error = { code: 'LOCAL_ONLY_ACTION' };
      assert.strictEqual(isLocalFallbackRequired(error), true);
    });
  });

  describe('Legacy message pattern', () => {
    it('should return true for "not supported in SaaS mode" message', () => {
      const error = { message: 'help action not supported in SaaS mode' };
      assert.strictEqual(isLocalFallbackRequired(error), true);
    });

    it('should return true when message contains pattern anywhere', () => {
      const error = { message: 'Error: This feature is not supported in SaaS mode. Please use local.' };
      assert.strictEqual(isLocalFallbackRequired(error), true);
    });
  });

  describe('Non-fallback errors', () => {
    it('should return false for NETWORK_ERROR', () => {
      const error = { code: 'NETWORK_ERROR', message: 'Connection failed' };
      assert.strictEqual(isLocalFallbackRequired(error), false);
    });

    it('should return false for VALIDATION_ERROR', () => {
      const error = { code: 'VALIDATION_ERROR', message: 'Invalid parameters' };
      assert.strictEqual(isLocalFallbackRequired(error), false);
    });

    it('should return false for generic Error', () => {
      const error = new Error('Something went wrong');
      assert.strictEqual(isLocalFallbackRequired(error), false);
    });

    it('should return false for null', () => {
      assert.strictEqual(isLocalFallbackRequired(null), false);
    });

    it('should return false for undefined', () => {
      assert.strictEqual(isLocalFallbackRequired(undefined), false);
    });

    it('should return false for string error', () => {
      assert.strictEqual(isLocalFallbackRequired('error string'), false);
    });

    it('should return false for empty object', () => {
      assert.strictEqual(isLocalFallbackRequired({}), false);
    });
  });
});
