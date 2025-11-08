// formatters/identifiers.ts - Identifier quoting utilities

import type { DatabaseFormat } from '../types.js';

/**
 * Quote identifier (table or column name) for target database
 */
export function quoteIdentifier(name: string, format: DatabaseFormat): string {
  switch (format) {
    case 'mysql':
      return `\`${name}\``;
    case 'postgresql':
    case 'sqlite':
      return `"${name}"`;
    default:
      return `"${name}"`;
  }
}
