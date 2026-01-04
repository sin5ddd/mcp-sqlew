/**
 * Text truncation utilities for token-efficient responses
 */

/**
 * Truncate a string to specified length with ellipsis
 *
 * @param value - String to truncate
 * @param maxLength - Maximum length (default: 30)
 * @param ellipsis - Ellipsis character (default: '…' Unicode U+2026)
 * @returns Truncated string with ellipsis if needed
 */
export function truncateValue(
  value: string,
  maxLength: number = 30,
  ellipsis: string = '…'
): string {
  if (!value || value.length <= maxLength) {
    return value;
  }
  return value.slice(0, maxLength) + ellipsis;
}
