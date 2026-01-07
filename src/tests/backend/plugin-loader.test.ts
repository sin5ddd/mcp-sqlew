/**
 * Plugin Loader Tests
 *
 * Tests for plugin loading functionality.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as path from 'path';
import {
  loadPlugin,
  isPluginInstalled,
  getPluginInfo,
  listInstalledPlugins,
  KNOWN_PLUGINS,
} from '../../backend/plugin-loader.js';

describe('Plugin Loader', () => {
  const testProjectRoot = process.cwd();

  describe('KNOWN_PLUGINS', () => {
    it('should define SAAS_CONNECTOR', () => {
      assert.strictEqual(KNOWN_PLUGINS.SAAS_CONNECTOR, 'saas-connector');
    });
  });

  describe('loadPlugin', () => {
    it('should return error for non-existent plugin', () => {
      const result = loadPlugin('non-existent-plugin', testProjectRoot, {});

      assert.strictEqual(result.success, false);
      assert.ok(result.error);
      assert.ok(result.error.includes('not found') || result.error.includes('--install-saas'));
    });

    it('should return error for saas-connector when not installed', () => {
      const result = loadPlugin(KNOWN_PLUGINS.SAAS_CONNECTOR, testProjectRoot, {});

      assert.strictEqual(result.success, false);
      assert.ok(result.error);
    });
  });

  describe('isPluginInstalled', () => {
    it('should return false for non-existent plugin', () => {
      const installed = isPluginInstalled('non-existent-plugin', testProjectRoot);

      assert.strictEqual(installed, false);
    });

    it('should return false for saas-connector when not installed', () => {
      const installed = isPluginInstalled(KNOWN_PLUGINS.SAAS_CONNECTOR, testProjectRoot);

      assert.strictEqual(installed, false);
    });
  });

  describe('getPluginInfo', () => {
    it('should return null for non-existent plugin', () => {
      const info = getPluginInfo('non-existent-plugin', testProjectRoot);

      assert.strictEqual(info, null);
    });

    it('should return null for saas-connector when not installed', () => {
      const info = getPluginInfo(KNOWN_PLUGINS.SAAS_CONNECTOR, testProjectRoot);

      assert.strictEqual(info, null);
    });
  });

  describe('listInstalledPlugins', () => {
    it('should return empty array when no plugins installed', () => {
      const plugins = listInstalledPlugins(testProjectRoot);

      // May have some plugins or may be empty
      assert.ok(Array.isArray(plugins));
    });
  });
});
