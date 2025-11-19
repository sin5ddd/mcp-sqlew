/**
 * Tag Parser Utility
 *
 * Common tag parsing logic used across the codebase.
 * Handles both comma-separated strings and arrays.
 */

/**
 * Parse tags from GROUP_CONCAT result
 *
 * @param tags - Comma-separated string from GROUP_CONCAT or null
 * @returns Array of tag names or empty array
 *
 * @example
 * parseGroupConcatTags('security,vulnerability,auth') // ['security', 'vulnerability', 'auth']
 * parseGroupConcatTags(null) // []
 * parseGroupConcatTags('') // []
 */
export function parseGroupConcatTags(tags: string | null | undefined): string[] {
  if (!tags || tags.trim() === '') {
    return [];
  }
  return tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
}

/**
 * Parse tags from user input
 *
 * Handles both arrays and comma-separated strings.
 * More permissive than parseGroupConcatTags - designed for user input.
 *
 * @param tags - Array of tags or comma-separated string
 * @returns Array of trimmed tag names
 *
 * @example
 * parseUserInputTags(['security', ' vulnerability ', 'auth']) // ['security', 'vulnerability', 'auth']
 * parseUserInputTags('security, vulnerability, auth') // ['security', 'vulnerability', 'auth']
 * parseUserInputTags([' test ']) // ['test']
 */
export function parseUserInputTags(tags: string | string[]): string[] {
  if (Array.isArray(tags)) {
    return tags.map(t => t.trim()).filter(t => t.length > 0);
  }
  return tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
}

/**
 * Format tags for GROUP_CONCAT SQL
 *
 * Returns the Knex.raw() expression for GROUP_CONCAT with proper SQLite/MySQL/PostgreSQL compatibility.
 *
 * @param knex - Knex instance
 * @param distinct - Whether to use DISTINCT (default: false)
 * @returns Knex.Raw expression for GROUP_CONCAT
 *
 * @example
 * import { Knex } from 'knex';
 * const expr = formatGroupConcatTags(knex);
 * // Returns: knex.raw('GROUP_CONCAT(t.name) as tags')
 *
 * const exprDistinct = formatGroupConcatTags(knex, true);
 * // Returns: knex.raw('GROUP_CONCAT(DISTINCT t.name) as tags')
 */
export function formatGroupConcatTags(knex: any, distinct = false): any {
  const distinctClause = distinct ? 'DISTINCT ' : '';
  return knex.raw(`GROUP_CONCAT(${distinctClause}t.name) as tags`);
}
