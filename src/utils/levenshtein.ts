/**
 * Levenshtein Distance Calculation
 * Shared utility for typo detection across validation modules
 *
 * Used by:
 * - parameter-validator.ts (parameter typo suggestions)
 * - batch-validation.ts (enum value typo suggestions)
 */

/**
 * Calculate Levenshtein distance between two strings
 * Used for typo detection (e.g., "busines" → "business", "context_key" → "key")
 *
 * @param a First string
 * @param b Second string
 * @returns Edit distance (number of single-character edits needed)
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}
