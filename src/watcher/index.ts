/**
 * Watcher module exports
 * Provides queue watching for Plan-to-ADR functionality
 */

export { BaseWatcher } from './base-watcher.js';
export type { WatcherOptions } from './base-watcher.js';
export { QueueWatcher, startQueueWatcher, stopQueueWatcher } from './queue-watcher.js';
export { GitIgnoreParser, createGitIgnoreParser, BUILT_IN_IGNORE_PATTERNS } from './gitignore-parser.js';
