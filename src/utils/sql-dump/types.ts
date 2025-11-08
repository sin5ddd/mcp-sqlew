// types.ts - Type definitions for sql-dump utilities

import type { DatabaseFormat } from '../sql-dump-converters.js';

export type { DatabaseFormat };

/**
 * Conflict resolution mode for INSERT statements
 * - 'error': Standard INSERT, fails on duplicate
 * - 'ignore': INSERT IGNORE / INSERT OR IGNORE / ON CONFLICT DO NOTHING
 * - 'replace': ON DUPLICATE KEY UPDATE / ON CONFLICT DO UPDATE
 */
export type ConflictMode = 'error' | 'ignore' | 'replace';
