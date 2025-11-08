/**
 * Parameter Validation Types
 * Validation error types for MCP tool parameter validation
 */

// ============================================================================
// Parameter Validation Types
// ============================================================================

/**
 * Concise validation error for MCP tool parameter validation
 * Designed for token efficiency - references examples via ID instead of embedding full objects
 *
 * Example output: "Missing: key, value. See: decision.set"
 */
export interface ValidationError {
  error: string;                   // Concise error message (e.g., "Missing: key, value")
  action: string;                  // Action name (e.g., "set")
  reference: string;               // Reference ID for full docs (e.g., "decision.set")
  missing?: string[];              // Missing required params (only if present)
  typos?: Record<string, string>;  // Typo suggestions: provided � correct (only if detected)
  hint?: string;                   // Short actionable hint from spec
}

/**
 * Batch validation error for batch operations
 * Reports validation failures across multiple items
 */
export interface BatchValidationError {
  error: string;
  batch_param: string;
  item_errors: Array<{
    index: number;
    error: string | ValidationError;
  }>;
  total_items: number;
  failed_items: number;
}

/**
 * Action not found error
 * Thrown when an invalid action is specified
 */
export interface ActionNotFoundError {
  error: string;
  tool: string;
  action_provided: string;
  available_actions: string[];
  did_you_mean?: string[];  // Similar action suggestions
}
