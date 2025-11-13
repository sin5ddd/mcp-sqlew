import { describe, it } from 'node:test';
import assert from 'node:assert';
import { incrementSemver, isValidSemver, compareSemver, DEFAULT_VERSION } from '../utils/semver.js';

describe('semver utilities', () => {
  describe('incrementSemver', () => {
    it('should increment patch version', () => {
      assert.strictEqual(incrementSemver('1.2.3', 'patch'), '1.2.4');
      assert.strictEqual(incrementSemver('0.0.0', 'patch'), '0.0.1');
      assert.strictEqual(incrementSemver('1.0.9', 'patch'), '1.0.10');
    });

    it('should increment minor version and reset patch', () => {
      assert.strictEqual(incrementSemver('1.2.3', 'minor'), '1.3.0');
      assert.strictEqual(incrementSemver('0.0.5', 'minor'), '0.1.0');
      assert.strictEqual(incrementSemver('2.9.8', 'minor'), '2.10.0');
    });

    it('should increment major version and reset minor/patch', () => {
      assert.strictEqual(incrementSemver('1.2.3', 'major'), '2.0.0');
      assert.strictEqual(incrementSemver('0.5.9', 'major'), '1.0.0');
      assert.strictEqual(incrementSemver('9.99.99', 'major'), '10.0.0');
    });

    it('should default to patch when level not specified', () => {
      assert.strictEqual(incrementSemver('1.2.3'), '1.2.4');
    });

    it('should throw on invalid version format', () => {
      assert.throws(() => incrementSemver('1.2', 'patch'), /Invalid semver format/);
      assert.throws(() => incrementSemver('v1.2.3', 'patch'), /Invalid semver format/);
      assert.throws(() => incrementSemver('1.2.x', 'patch'), /Invalid semver format/);
    });

    it('should throw on invalid bump level', () => {
      assert.throws(() => incrementSemver('1.2.3', 'invalid' as any), /Invalid bump level/);
    });
  });

  describe('isValidSemver', () => {
    it('should validate correct semver strings', () => {
      assert.strictEqual(isValidSemver('1.2.3'), true);
      assert.strictEqual(isValidSemver('0.0.0'), true);
      assert.strictEqual(isValidSemver('10.20.30'), true);
    });

    it('should reject invalid semver strings', () => {
      assert.strictEqual(isValidSemver('1.2'), false);
      assert.strictEqual(isValidSemver('v1.2.3'), false);
      assert.strictEqual(isValidSemver('1.2.3-beta'), false);
      assert.strictEqual(isValidSemver('1.2.x'), false);
      assert.strictEqual(isValidSemver(''), false);
    });
  });

  describe('compareSemver', () => {
    it('should return -1 when v1 < v2', () => {
      assert.strictEqual(compareSemver('1.2.3', '1.2.4'), -1);
      assert.strictEqual(compareSemver('1.2.3', '1.3.0'), -1);
      assert.strictEqual(compareSemver('1.2.3', '2.0.0'), -1);
    });

    it('should return 1 when v1 > v2', () => {
      assert.strictEqual(compareSemver('1.2.4', '1.2.3'), 1);
      assert.strictEqual(compareSemver('1.3.0', '1.2.9'), 1);
      assert.strictEqual(compareSemver('2.0.0', '1.99.99'), 1);
    });

    it('should return 0 when v1 === v2', () => {
      assert.strictEqual(compareSemver('1.2.3', '1.2.3'), 0);
      assert.strictEqual(compareSemver('0.0.0', '0.0.0'), 0);
    });
  });

  describe('DEFAULT_VERSION', () => {
    it('should be a valid semver', () => {
      assert.strictEqual(isValidSemver(DEFAULT_VERSION), true);
    });

    it('should be 1.0.0', () => {
      assert.strictEqual(DEFAULT_VERSION, '1.0.0');
    });
  });
});
