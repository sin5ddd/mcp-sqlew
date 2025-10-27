/**
 * Parameter parsing utilities for MCP tool parameters
 * Handles JSON array strings from MCP SDK
 */

/**
 * Parse a parameter that could be a string array or a JSON-encoded string array
 * MCP SDK sometimes sends arrays as JSON strings: "[\"tag1\", \"tag2\"]"
 *
 * @param param - The parameter to parse (array or JSON string)
 * @returns Parsed string array
 *
 * @example
 * parseStringArray(['tag1', 'tag2']) // returns ['tag1', 'tag2']
 * parseStringArray('["tag1", "tag2"]') // returns ['tag1', 'tag2']
 * parseStringArray('single-tag') // returns ['single-tag']
 */
export function parseStringArray(param: string | string[] | undefined | null): string[] {
  if (!param) {
    return [];
  }

  // Already an array
  if (Array.isArray(param)) {
    return param;
  }

  // Try to parse as JSON
  if (typeof param === 'string') {
    try {
      const parsed = JSON.parse(param);
      // If parsed result is an array, return it
      if (Array.isArray(parsed)) {
        return parsed;
      }
      // If it's a single string after parsing, return as array
      return [String(parsed)];
    } catch (e) {
      // If parse fails, treat as single string
      return [param];
    }
  }

  // Fallback: convert to string and return as single-element array
  return [String(param)];
}

/**
 * Parse optional string array parameter
 * Returns undefined if param is null/undefined/empty
 */
export function parseOptionalStringArray(param: string | string[] | undefined | null): string[] | undefined {
  const result = parseStringArray(param);
  return result.length > 0 ? result : undefined;
}
