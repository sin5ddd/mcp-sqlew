/**
 * Token Estimation Utility
 *
 * Provides token count estimation for help system responses.
 * Uses a simple heuristic: ~4 characters per token (GPT-style tokenization)
 *
 * This is an approximation for measuring token efficiency gains.
 * Actual token counts may vary based on tokenizer used.
 */

/**
 * Estimate token count for a string or object
 *
 * @param data - String or object to estimate token count for
 * @returns Estimated token count
 */
export function estimateTokens(data: string | object): number {
  let text: string;

  if (typeof data === 'string') {
    text = data;
  } else {
    // Convert object to JSON string
    text = JSON.stringify(data);
  }

  // Simple heuristic: ~4 characters per token
  // This is a conservative estimate for GPT-style tokenization
  const charCount = text.length;
  const tokenCount = Math.ceil(charCount / 4);

  return tokenCount;
}

/**
 * Add token metadata to response object
 *
 * @param data - Response data
 * @returns Response with token metadata
 */
export function addTokenMetadata<T extends object>(data: T): T & { _token_info: { estimated_tokens: number; actual_chars: number } } {
  const estimated_tokens = estimateTokens(data);
  const actual_chars = JSON.stringify(data).length;

  return {
    ...data,
    _token_info: {
      estimated_tokens,
      actual_chars
    }
  };
}

/**
 * Token ranges for different query types
 */
export const TOKEN_RANGES = {
  help_action: { min: 50, max: 100, legacy: 2000 },
  help_params: { min: 30, max: 80, legacy: 1500 },
  help_tool: { min: 100, max: 200, legacy: 5000 },
  help_use_case: { min: 150, max: 200, legacy: 300 },
  help_list_use_cases: { min: 100, max: 300, legacy: 500 },
  help_next_actions: { min: 30, max: 50, legacy: 100 }
} as const;

/**
 * Calculate token efficiency percentage
 *
 * @param current - Current token count
 * @param legacy - Legacy token count
 * @returns Efficiency gain percentage
 */
export function calculateEfficiencyGain(current: number, legacy: number): number {
  if (legacy === 0) return 0;
  return Math.round((1 - current / legacy) * 100);
}
