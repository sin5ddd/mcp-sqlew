import { describe, it } from 'node:test';
import assert from 'node:assert';
import { normalizeIdentifier } from '../../../utils/case-insensitive-validator.js';

describe('case-insensitive-validator', () => {
  describe('normalizeIdentifier', () => {
    describe('case normalization', () => {
      it('should convert uppercase to lowercase', () => {
        assert.strictEqual(normalizeIdentifier('DRY'), 'dry');
        assert.strictEqual(normalizeIdentifier('API'), 'api');
        assert.strictEqual(normalizeIdentifier('SOLID'), 'solid');
      });

      it('should handle mixed case', () => {
        assert.strictEqual(normalizeIdentifier('DryPrinciple'), 'dryprinciple');
        assert.strictEqual(normalizeIdentifier('APIDesign'), 'apidesign');
      });
    });

    describe('kebab-case normalization', () => {
      it('should remove hyphens', () => {
        assert.strictEqual(normalizeIdentifier('api-design'), 'apidesign');
        assert.strictEqual(normalizeIdentifier('dry-principle'), 'dryprinciple');
        assert.strictEqual(normalizeIdentifier('my-long-tag-name'), 'mylongtagname');
      });

      it('should handle uppercase kebab-case', () => {
        assert.strictEqual(normalizeIdentifier('API-Design'), 'apidesign');
        assert.strictEqual(normalizeIdentifier('DRY-PRINCIPLE'), 'dryprinciple');
      });
    });

    describe('snake_case normalization', () => {
      it('should remove underscores', () => {
        assert.strictEqual(normalizeIdentifier('api_design'), 'apidesign');
        assert.strictEqual(normalizeIdentifier('dry_principle'), 'dryprinciple');
        assert.strictEqual(normalizeIdentifier('my_long_tag_name'), 'mylongtagname');
      });

      it('should handle uppercase snake_case (SCREAMING_SNAKE)', () => {
        assert.strictEqual(normalizeIdentifier('API_DESIGN'), 'apidesign');
        assert.strictEqual(normalizeIdentifier('DRY_PRINCIPLE'), 'dryprinciple');
      });
    });

    describe('camelCase normalization', () => {
      it('should handle camelCase', () => {
        assert.strictEqual(normalizeIdentifier('apiDesign'), 'apidesign');
        assert.strictEqual(normalizeIdentifier('dryPrinciple'), 'dryprinciple');
        assert.strictEqual(normalizeIdentifier('myLongTagName'), 'mylongtagname');
      });

      it('should handle PascalCase', () => {
        assert.strictEqual(normalizeIdentifier('ApiDesign'), 'apidesign');
        assert.strictEqual(normalizeIdentifier('DryPrinciple'), 'dryprinciple');
        assert.strictEqual(normalizeIdentifier('MyLongTagName'), 'mylongtagname');
      });
    });

    describe('cross-convention equivalence', () => {
      it('should normalize kebab, snake, camel to same value', () => {
        const normalized = normalizeIdentifier('api-design');
        assert.strictEqual(normalizeIdentifier('api_design'), normalized);
        assert.strictEqual(normalizeIdentifier('apiDesign'), normalized);
        assert.strictEqual(normalizeIdentifier('ApiDesign'), normalized);
        assert.strictEqual(normalizeIdentifier('API-DESIGN'), normalized);
        assert.strictEqual(normalizeIdentifier('API_DESIGN'), normalized);
      });

      it('should normalize dry variants to same value', () => {
        const normalized = normalizeIdentifier('dry');
        assert.strictEqual(normalizeIdentifier('DRY'), normalized);
        assert.strictEqual(normalizeIdentifier('Dry'), normalized);
      });

      it('should normalize complex names correctly', () => {
        const normalized = normalizeIdentifier('user-authentication-flow');
        assert.strictEqual(normalizeIdentifier('user_authentication_flow'), normalized);
        assert.strictEqual(normalizeIdentifier('userAuthenticationFlow'), normalized);
        assert.strictEqual(normalizeIdentifier('UserAuthenticationFlow'), normalized);
      });
    });

    describe('edge cases', () => {
      it('should handle single character', () => {
        assert.strictEqual(normalizeIdentifier('a'), 'a');
        assert.strictEqual(normalizeIdentifier('A'), 'a');
      });

      it('should handle numbers', () => {
        assert.strictEqual(normalizeIdentifier('api2'), 'api2');
        assert.strictEqual(normalizeIdentifier('api-v2'), 'apiv2');
        assert.strictEqual(normalizeIdentifier('api_v2'), 'apiv2');
      });

      it('should handle consecutive separators', () => {
        assert.strictEqual(normalizeIdentifier('api--design'), 'apidesign');
        assert.strictEqual(normalizeIdentifier('api__design'), 'apidesign');
        assert.strictEqual(normalizeIdentifier('api-_design'), 'apidesign');
      });

      it('should handle empty string', () => {
        assert.strictEqual(normalizeIdentifier(''), '');
      });

      it('should handle leading/trailing separators', () => {
        assert.strictEqual(normalizeIdentifier('-api-'), 'api');
        assert.strictEqual(normalizeIdentifier('_api_'), 'api');
      });
    });
  });
});
