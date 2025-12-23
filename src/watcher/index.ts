/**
 * Watcher module exports
 * Provides file watching and test execution functionality
 */

export { BaseWatcher } from './base-watcher.js';
export type { WatcherOptions } from './base-watcher.js';
export { FileWatcher } from './file-watcher.js';
export { QueueWatcher, startQueueWatcher, stopQueueWatcher } from './queue-watcher.js';
export { executeAcceptanceCriteria } from './test-executor.js';
export type { CheckResult } from './test-executor.js';
export { GitIgnoreParser, createGitIgnoreParser, BUILT_IN_IGNORE_PATTERNS } from './gitignore-parser.js';
