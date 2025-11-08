/**
 * File tool - Barrel export
 *
 * Exports all file-related actions from modular structure
 */

// Action exports
export { recordFileChange } from './actions/record.js';
export { getFileChanges } from './actions/get.js';
export { checkFileLock } from './actions/check-lock.js';
export { recordFileChangeBatch } from './actions/record-batch.js';

// Help exports
export { fileHelp } from './help/help.js';
export { fileExample } from './help/example.js';

// Type re-exports
export type {
  RecordFileChangeParams,
  GetFileChangesParams,
  CheckFileLockParams,
  RecordFileChangeBatchParams,
  RecordFileChangeResponse,
  GetFileChangesResponse,
  CheckFileLockResponse,
  RecordFileChangeBatchResponse,
  RecentFileChange
} from './types.js';
