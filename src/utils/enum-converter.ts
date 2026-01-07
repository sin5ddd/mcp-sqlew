/**
 * Enum to String Converter Utilities
 *
 * Converts database integer enum values to human-readable strings.
 * Centralizes conversion logic to avoid raw SQL CASE statements.
 *
 * @since v4.1.0
 */

import { STATUS_TO_STRING, PRIORITY_TO_STRING } from '../constants.js';
import { Status, Priority } from '../types.js';

// ============================================================================
// Status Conversion
// ============================================================================

/**
 * Convert status integer to string for a single record
 *
 * @example
 * const row = { id: 1, status: 1 };
 * const result = convertStatus(row);
 * // result.status === 'active'
 */
export function convertStatus<T extends { status: number | null }>(
  row: T
): Omit<T, 'status'> & { status: string } {
  const statusInt = row.status as Status | null;
  const statusStr = statusInt !== null ? (STATUS_TO_STRING[statusInt] || 'draft') : 'draft';
  return { ...row, status: statusStr };
}

/**
 * Convert status integer to string for an array of records
 *
 * @example
 * const rows = [{ id: 1, status: 1 }, { id: 2, status: 2 }];
 * const results = convertStatusArray(rows);
 * // results[0].status === 'active', results[1].status === 'deprecated'
 */
export function convertStatusArray<T extends { status: number | null }>(
  rows: T[]
): (Omit<T, 'status'> & { status: string })[] {
  return rows.map(convertStatus);
}

// ============================================================================
// Priority Conversion
// ============================================================================

/**
 * Convert priority integer to string for a single record
 */
export function convertPriority<T extends { priority: number | null }>(
  row: T
): Omit<T, 'priority'> & { priority: string } {
  const priorityInt = row.priority as Priority | null;
  const priorityStr = priorityInt !== null ? (PRIORITY_TO_STRING[priorityInt] || 'medium') : 'medium';
  return { ...row, priority: priorityStr };
}

/**
 * Convert priority integer to string for an array of records
 */
export function convertPriorityArray<T extends { priority: number | null }>(
  rows: T[]
): (Omit<T, 'priority'> & { priority: string })[] {
  return rows.map(convertPriority);
}
