/**
 * Case-Insensitive Validator Utility
 *
 * Provides normalized duplicate detection for master tables.
 * Handles case differences and naming convention variations:
 * - Case: "DRY" vs "dry"
 * - Kebab vs Snake: "api-design" vs "api_design"
 * - CamelCase: "apiDesign" vs "api-design"
 *
 * NOTE: This module only validates - it does NOT normalize stored values.
 * Input values are saved as-is; normalization is only for comparison.
 *
 * @see Decision: db/mysql-mariadb-case-sensitivity-handling
 * @since v4.0.2
 */

import { Knex } from 'knex';

/**
 * Result of normalized duplicate check
 */
export interface NormalizedDuplicateResult {
  /** Whether a normalized duplicate exists */
  isDuplicate: boolean;
  /** The existing value (if found) */
  existingValue?: string;
  /** The existing record's ID (if found) */
  existingId?: number;
  /** Type of match detected */
  matchType?: 'exact' | 'case' | 'naming-convention';
}

/**
 * Normalize an identifier for comparison purposes
 * Handles case, kebab-case, snake_case, and camelCase
 *
 * @param value - Value to normalize
 * @returns Normalized string for comparison
 *
 * @example
 * normalizeIdentifier('API-Design')   // → 'apidesign'
 * normalizeIdentifier('api_design')   // → 'apidesign'
 * normalizeIdentifier('apiDesign')    // → 'apidesign'
 * normalizeIdentifier('DRY')          // → 'dry'
 */
export function normalizeIdentifier(value: string): string {
  return value
    // Insert space before uppercase letters (for camelCase)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    // Convert to lowercase
    .toLowerCase()
    // Remove hyphens, underscores, and spaces
    .replace(/[-_\s]/g, '');
}

/**
 * Check if a normalized duplicate exists in a table
 *
 * @param knex - Knex instance or transaction
 * @param table - Table name to check
 * @param column - Column name to check for duplicates
 * @param value - Value to check
 * @param additionalWhere - Additional WHERE conditions (e.g., { project_id: 1 })
 * @returns Result indicating if duplicate exists and details
 *
 * @example
 * // Check for duplicate tag (detects 'dry', 'DRY', 'D-R-Y', 'd_r_y')
 * const result = await checkNormalizedDuplicate(
 *   knex, 'v4_tags', 'name', 'DRY', { project_id: 1 }
 * );
 * if (result.isDuplicate) {
 *   throw new Error(`Tag "${result.existingValue}" already exists`);
 * }
 */
export async function checkNormalizedDuplicate(
  knex: Knex | Knex.Transaction,
  table: string,
  column: string,
  value: string,
  additionalWhere: Record<string, any> = {}
): Promise<NormalizedDuplicateResult> {
  const normalizedInput = normalizeIdentifier(value);

  // Fetch all records matching the additional conditions
  // We need to compare in JS because SQL can't easily handle our normalization
  const records = await knex(table)
    .where(additionalWhere)
    .select('id', column);

  for (const record of records) {
    const existingValue = record[column];
    const normalizedExisting = normalizeIdentifier(existingValue);

    if (normalizedExisting === normalizedInput && existingValue !== value) {
      // Determine match type for better error messages
      let matchType: 'case' | 'naming-convention' = 'naming-convention';
      if (existingValue.toLowerCase() === value.toLowerCase()) {
        matchType = 'case';
      }

      return {
        isDuplicate: true,
        existingValue,
        existingId: record.id,
        matchType
      };
    }
  }

  return { isDuplicate: false };
}

/**
 * Validate and throw error if normalized duplicate exists
 *
 * @param knex - Knex instance or transaction
 * @param table - Table name to check
 * @param column - Column name to check for duplicates
 * @param value - Value to check
 * @param entityType - Human-readable entity type for error message (e.g., "tag", "scope", "policy")
 * @param additionalWhere - Additional WHERE conditions
 * @throws Error if normalized duplicate exists
 *
 * @example
 * // Validate tag before insert
 * await validateNoNormalizedDuplicate(
 *   knex, 'v4_tags', 'name', 'api-design', 'tag', { project_id: 1 }
 * );
 * // Throws if 'api_design' or 'apiDesign' exists:
 * // Tag "api_design" already exists (naming conflict with "api-design")
 */
export async function validateNoNormalizedDuplicate(
  knex: Knex | Knex.Transaction,
  table: string,
  column: string,
  value: string,
  entityType: string,
  additionalWhere: Record<string, any> = {}
): Promise<void> {
  const result = await checkNormalizedDuplicate(
    knex, table, column, value, additionalWhere
  );

  if (result.isDuplicate) {
    const capitalizedType = entityType.charAt(0).toUpperCase() + entityType.slice(1);
    const conflictDesc = result.matchType === 'case'
      ? 'case-insensitive match'
      : 'naming conflict';

    throw new Error(
      `${capitalizedType} "${result.existingValue}" already exists (${conflictDesc} with "${value}")`
    );
  }
}

/**
 * Find existing record with normalized match
 * Returns the existing record if found (exact or normalized match)
 *
 * @param knex - Knex instance or transaction
 * @param table - Table name to check
 * @param column - Column name to check
 * @param value - Value to check
 * @param additionalWhere - Additional WHERE conditions
 * @returns Existing record or null
 */
export async function findNormalizedMatch<T extends Record<string, any>>(
  knex: Knex | Knex.Transaction,
  table: string,
  column: string,
  value: string,
  additionalWhere: Record<string, any> = {}
): Promise<T | null> {
  const normalizedInput = normalizeIdentifier(value);

  const records = await knex(table)
    .where(additionalWhere);

  for (const record of records) {
    const existingValue = record[column];
    if (normalizeIdentifier(existingValue) === normalizedInput) {
      return record as T;
    }
  }

  return null;
}

// ============================================================================
// Legacy aliases for backward compatibility
// ============================================================================

/** @deprecated Use checkNormalizedDuplicate instead */
export const checkCaseInsensitiveDuplicate = checkNormalizedDuplicate;

/** @deprecated Use validateNoNormalizedDuplicate instead */
export const validateNoCaseInsensitiveDuplicate = validateNoNormalizedDuplicate;

/** @deprecated Use findNormalizedMatch instead */
export const findCaseInsensitiveMatch = findNormalizedMatch;
