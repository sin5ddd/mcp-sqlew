/**
 * Backend Module
 *
 * Provides abstraction layer for local and SaaS backends.
 */

// Types
export type { ToolBackend, HealthCheckResult, BackendType } from './types.js';

// Backend implementations
export { LocalBackend } from './local-backend.js';
export { TransformingBackend } from './transforming-backend.js';

// Inference utilities (for quick_set transformation)
export { inferDecisionParams } from './inference.js';
export type { InferredParams, InferenceResult } from './inference.js';

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
