/**
 * Backend Factory Tests
 *
 * Tests for backend creation and configuration.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  createBackend,
  resetBackend,
  initializeBackend,
  getBackend,
  isBackendInitialized,
  getBackendType,
  isCloudMode,
  loadCloudConfig,
  validateCloudConfig,
} from '../../backend/index.js';
import type { SqlewConfig } from '../../config/types.js';

describe('Backend Factory', () => {
  beforeEach(async () => {
    await resetBackend();
    // Clear environment variables
    delete process.env.SQLEW_API_KEY;
    delete process.env.SQLEW_PROJECT_ID;
  });

  afterEach(async () => {
    await resetBackend();
  });

  describe('createBackend', () => {
    it('should create LocalBackend for sqlite config', () => {
      const config: SqlewConfig = {
        database: { type: 'sqlite' },
      };

      const backend = createBackend(config);
      assert.strictEqual(backend.backendType, 'local');
    });

    it('should create LocalBackend for postgres config', () => {
      const config: SqlewConfig = {
        database: { type: 'postgres' },
      };

      const backend = createBackend(config);
      assert.strictEqual(backend.backendType, 'local');
    });

    it('should create LocalBackend for mysql config', () => {
      const config: SqlewConfig = {
        database: { type: 'mysql' },
      };

      const backend = createBackend(config);
      assert.strictEqual(backend.backendType, 'local');
    });

    it('should create LocalBackend when no config specified', () => {
      const config: SqlewConfig = {};

      const backend = createBackend(config);
      assert.strictEqual(backend.backendType, 'local');
    });

    it('should throw error for cloud config without API key', () => {
      const config: SqlewConfig = {
        database: { type: 'cloud' },
      };

      assert.throws(
        () => createBackend(config),
        /SQLEW_API_KEY is required for cloud mode/
      );
    });

    it('should throw error for cloud config when plugin not installed', () => {
      const config: SqlewConfig = {
        database: { type: 'cloud' },
      };

      // Set API key but plugin is not installed
      process.env.SQLEW_API_KEY = 'test-key';

      assert.throws(
        () => createBackend(config),
        /saas-connector.*not found|--install-saas/i
      );
    });
  });

  describe('initializeBackend', () => {
    it('should initialize LocalBackend for local config', () => {
      const config: SqlewConfig = {
        database: { type: 'sqlite' },
      };

      const backend = initializeBackend(config);

      assert.strictEqual(backend.backendType, 'local');
      assert.strictEqual(isBackendInitialized(), true);
      assert.strictEqual(getBackendType(), 'local');
    });

    it('should return same instance on getBackend', () => {
      const config: SqlewConfig = {
        database: { type: 'sqlite' },
      };

      const backend1 = initializeBackend(config);
      const backend2 = getBackend();

      assert.strictEqual(backend1, backend2);
    });
  });

  describe('getBackend', () => {
    it('should return LocalBackend as default when not initialized', () => {
      const backend = getBackend();

      assert.strictEqual(backend.backendType, 'local');
    });
  });

  describe('resetBackend', () => {
    it('should reset backend state', async () => {
      const config: SqlewConfig = {
        database: { type: 'sqlite' },
      };

      initializeBackend(config);
      assert.strictEqual(isBackendInitialized(), true);

      await resetBackend();
      assert.strictEqual(isBackendInitialized(), false);
      assert.strictEqual(getBackendType(), null);
    });
  });

  describe('isCloudMode', () => {
    it('should return true for cloud type', () => {
      const config: SqlewConfig = {
        database: { type: 'cloud' },
      };

      assert.strictEqual(isCloudMode(config), true);
    });

    it('should return false for sqlite type', () => {
      const config: SqlewConfig = {
        database: { type: 'sqlite' },
      };

      assert.strictEqual(isCloudMode(config), false);
    });

    it('should return false for no database config', () => {
      const config: SqlewConfig = {};

      assert.strictEqual(isCloudMode(config), false);
    });
  });

  describe('loadCloudConfig', () => {
    it('should return null when no API key set', () => {
      const config = loadCloudConfig();

      assert.strictEqual(config, null);
    });

    it('should return config when API key is set', () => {
      process.env.SQLEW_API_KEY = 'test-api-key';

      const config = loadCloudConfig();

      assert.strictEqual(config?.apiKey, 'test-api-key');
    });

    it('should include projectId when set', () => {
      process.env.SQLEW_API_KEY = 'test-api-key';
      process.env.SQLEW_PROJECT_ID = 'my-project';

      const config = loadCloudConfig();

      assert.strictEqual(config?.projectId, 'my-project');
    });
  });

  describe('validateCloudConfig', () => {
    it('should return valid false for null config', () => {
      const result = validateCloudConfig(null);

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.length > 0);
    });

    it('should return valid true for config with API key', () => {
      const result = validateCloudConfig({
        apiKey: 'test-key',
      });

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.errors.length, 0);
    });
  });
});
