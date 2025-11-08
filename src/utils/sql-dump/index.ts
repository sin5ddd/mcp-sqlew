// index.ts - Main export point for sql-dump utilities

// Export types
export type { DatabaseFormat, ConflictMode } from './types.js';

// Export main function
export { generateSqlDump } from './core/generate-dump.js';

// Export utilities (for testing and advanced usage)
export { quoteIdentifier } from './formatters/identifiers.js';
export { formatValue, convertValueWithType } from './formatters/value-formatter.js';
export { generateBulkInsert } from './formatters/bulk-insert.js';
export { generateHeader } from './generators/headers.js';
export { generateForeignKeyControls, generateTransactionControl } from './generators/controls.js';
export { getAllTables, getCreateTableStatement } from './core/table-export.js';
export { getAllViews, getCreateViewStatement } from './core/view-export.js';
export { getAllIndexes, getCreateIndexStatement } from './core/index-export.js';
export { generateSequenceResets } from './core/sequence-reset.js';
export { getTableDependencies, topologicalSort } from './core/dependency-sort.js';
export { getPrimaryKeyColumns } from './schema/primary-keys.js';
