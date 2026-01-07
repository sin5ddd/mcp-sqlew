/**
 * Backend Module
 *
 * Provides abstraction layer for local and plugin-based backends.
 */

// Types
export type { ToolBackend, HealthCheckResult, BackendType, PluginModule } from './types.js';

// Backend implementations
export { LocalBackend } from './local-backend.js';

// Plugin loader
export {
  loadPlugin,
  isPluginInstalled,
  getPluginInfo,
  listInstalledPlugins,
  KNOWN_PLUGINS,
} from './plugin-loader.js';
export type { PluginLoadResult } from './plugin-loader.js';

// Factory and global state
export {
  initializeBackend,
  getBackend,
  isBackendInitialized,
  getBackendType,
  resetBackend,
  createBackend,
  isCloudMode,
  loadCloudConfig,
  validateCloudConfig,
} from './backend-factory.js';
