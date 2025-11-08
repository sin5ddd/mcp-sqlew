// generators/controls.ts - Foreign key and transaction control statements

import type { DatabaseFormat } from '../types.js';

/**
 * Generate foreign key disable/enable statements
 */
export function generateForeignKeyControls(format: DatabaseFormat, enable: boolean): string {
  if (format === 'mysql') {
    return enable
      ? 'SET FOREIGN_KEY_CHECKS=1;'
      : 'SET FOREIGN_KEY_CHECKS=0;';
  } else if (format === 'postgresql') {
    return enable
      ? 'SET session_replication_role = DEFAULT;'
      : 'SET session_replication_role = replica;';
  } else {
    // SQLite
    return enable
      ? 'PRAGMA foreign_keys = ON;'
      : 'PRAGMA foreign_keys = OFF;';
  }
}

/**
 * Generate transaction control statements
 */
export function generateTransactionControl(format: DatabaseFormat, isStart: boolean): string {
  if (isStart) {
    return format === 'mysql' ? 'START TRANSACTION;'
         : format === 'postgresql' ? 'BEGIN;'
         : 'BEGIN TRANSACTION;';
  } else {
    return 'COMMIT;';
  }
}
