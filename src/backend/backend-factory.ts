/**
 * Backend Factory
 *
 * Creates and manages backend instances based on configuration.
 * Supports LocalBackend (direct DB) and plugin-based backends (e.g., SaaS).
 */

import type { ToolBackend } from './types.js';
import type { SqlewConfig, CloudConfig } from '../config/types.js';
import { CLOUD_ENV_VARS } from '../config/types.js';
import { LocalBackend } from './local-backend.js';
import { loadPlugin, KNOWN_PLUGINS } from './plugin-loader.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Global backend instance (singleton)
 */
let globalBackend: ToolBackend | null = null;
let initialized = false;

/**
 * Check if the configuration specifies cloud mode
 */
export function isCloudMode(config: SqlewConfig): boolean {
  return config.database?.type === 'cloud';
}

/**
 * Load cloud configuration from environment variables
 *
 * @param projectRoot - Project root directory
 * @returns CloudConfig or null if not configured
 */
export function loadCloudConfig(projectRoot?: string): CloudConfig | null {
  // Try to load from .sqlew/.env file first
  if (projectRoot) {
    const envPath = path.join(projectRoot, '.sqlew', '.env');
    if (fs.existsSync(envPath)) {
      try {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        parseEnvFile(envContent);
      } catch {
        // Ignore parse errors, fall back to process.env
      }
    }
  }

  // Read from environment variables
  const apiKey = process.env[CLOUD_ENV_VARS.API_KEY];
  if (!apiKey) {
    return null;
  }

  return {
    apiKey,
    endpoint: process.env[CLOUD_ENV_VARS.ENDPOINT],
    projectId: process.env[CLOUD_ENV_VARS.PROJECT_ID],
  };
}

/**
 * Parse .env file and set environment variables
 */
function parseEnvFile(content: string): void {
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) {
      continue;
    }
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    // Remove quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    // Only set if not already defined (environment takes precedence)
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

/**
 * Validate cloud configuration
 */
export function validateCloudConfig(config: CloudConfig | null): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config) {
    errors.push(`${CLOUD_ENV_VARS.API_KEY} is required for cloud mode`);
    return { valid: false, errors };
  }

  if (!config.apiKey) {
    errors.push(`${CLOUD_ENV_VARS.API_KEY} is required for cloud mode`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Create a backend instance based on configuration
 *
 * @param config - sqlew configuration
 * @param projectRoot - Project root directory
 * @returns Backend instance
 */
export function createBackend(config: SqlewConfig, projectRoot?: string): ToolBackend {
  if (isCloudMode(config)) {
    // Load cloud config from environment
    const cloudConfig = loadCloudConfig(projectRoot);
    const validation = validateCloudConfig(cloudConfig);

    if (!validation.valid) {
      throw new Error(validation.errors.join('; '));
    }

    // Load saas-connector plugin
    const root = projectRoot || process.cwd();
    const result = loadPlugin(KNOWN_PLUGINS.SAAS_CONNECTOR, root, cloudConfig);

    if (!result.success || !result.backend) {
      throw new Error(
        result.error ||
        `SaaS connector not found. Run: sqlew --install-saas`
      );
    }

    return result.backend;
  }

  // Default: LocalBackend
  return new LocalBackend();
}

/**
 * Initialize the global backend instance
 *
 * @param config - sqlew configuration
 * @param projectRoot - Project root directory
 * @returns Backend instance
 */
export function initializeBackend(config: SqlewConfig, projectRoot?: string): ToolBackend {
  if (initialized && globalBackend) {
    return globalBackend;
  }

  globalBackend = createBackend(config, projectRoot);
  initialized = true;

  const modeInfo = globalBackend.backendType === 'plugin'
    ? `plugin (${globalBackend.pluginName || 'unknown'})`
    : globalBackend.backendType;
  console.error(`✅ ${modeInfo} backend initialized`);

  return globalBackend;
}

/**
 * Get the current backend instance
 *
 * @returns Backend instance (creates LocalBackend if not initialized)
 */
export function getBackend(): ToolBackend {
  if (!globalBackend) {
    console.error('⚠️  Backend not initialized, using default LocalBackend');
    globalBackend = new LocalBackend();
  }
  return globalBackend;
}

/**
 * Check if backend is initialized
 */
export function isBackendInitialized(): boolean {
  return initialized;
}

/**
 * Get current backend type
 */
export function getBackendType(): 'local' | 'plugin' | null {
  return globalBackend?.backendType ?? null;
}

/**
 * Reset backend state (for testing)
 */
export async function resetBackend(): Promise<void> {
  if (globalBackend) {
    await globalBackend.disconnect();
    globalBackend = null;
  }
  initialized = false;
}
