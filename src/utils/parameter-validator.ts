/**
 * Parameter Validation with Typo Detection for MCP Tools
 *
 * Provides comprehensive parameter validation with:
 * - Missing required parameter detection
 * - Typo suggestions using Levenshtein distance
 * - Structured error messages with examples
 * - Support for all sqlew MCP tools
 *
 * Usage:
 *   validateActionParams('decision', 'set', params);
 *   // Throws ValidationError with structured details if validation fails
 */

import { getActionSpec, ACTION_SPECS_BY_TOOL } from './action-specs.js';
import type {
  ValidationError,
  DecisionAction,
  TaskAction,
  FileAction,
  ConstraintAction,
  StatsAction,
  ConfigAction,
  MessageAction
} from '../types.js';

/**
 * Calculate Levenshtein distance between two strings
 * Used for typo detection (e.g., "context_key" → "key")
 *
 * @param a First string
 * @param b Second string
 * @returns Edit distance (number of single-character edits needed)
 */
function levenshteinDistance(a: string, b: string): number {
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

/**
 * Common abbreviation patterns for AI parameter typos
 * Maps abbreviated/shortened names to their full parameter names
 */
const COMMON_ABBREVIATIONS: Record<string, string[]> = {
  desc: ['description'],
  val: ['value'],
  prio: ['priority'],
  pri: ['priority'],
  config: ['configuration'],
  msg: ['message'],
  crit: ['criteria', 'critical'],
  req: ['required'],
  opt: ['optional'],
  param: ['parameter', 'params'],
  arg: ['argument', 'args'],
  attr: ['attribute', 'attributes'],
  prop: ['property', 'properties'],
  stat: ['status', 'statistics'],
  info: ['information'],
  temp: ['template'],
  rel: ['related', 'relation'],
  deps: ['dependencies'],
  dep: ['dependency'],
  ref: ['reference'],
  ctx: ['context'],
  db: ['database'],
};

/**
 * Check if provided parameter matches any common abbreviation pattern
 *
 * @param provided Parameter name provided by user (potentially abbreviated)
 * @param validParams List of valid parameters to match against
 * @returns Matched full parameter name, or null if no match
 */
function checkAbbreviation(provided: string, validParams: string[]): string | null {
  const lowerProvided = provided.toLowerCase();

  // Direct abbreviation match
  if (COMMON_ABBREVIATIONS[lowerProvided]) {
    for (const fullForm of COMMON_ABBREVIATIONS[lowerProvided]) {
      // Check if any valid parameter contains this full form
      const match = validParams.find(v => v.toLowerCase().includes(fullForm));
      if (match) {
        return match;
      }
    }
  }

  // Check if provided is a prefix abbreviation (e.g., "desc" → "description")
  for (const valid of validParams) {
    if (valid.length > provided.length &&
        valid.toLowerCase().startsWith(lowerProvided) &&
        provided.length >= 3) {  // Minimum 3 chars for prefix matching
      return valid;
    }
  }

  return null;
}

/**
 * Find typo suggestions for provided parameters
 * Uses:
 * 1. Abbreviation dictionary for common AI shortcuts
 * 2. Prefix matching for partial parameter names
 * 3. Levenshtein distance ≤ 2 for typos
 *
 * @param providedParams Parameters actually provided by user
 * @param validParams All valid parameters (required + optional)
 * @returns Map of typo → suggested correction
 */
function findTypoSuggestions(
  providedParams: string[],
  validParams: string[]
): Record<string, string> {
  const suggestions: Record<string, string> = {};

  for (const provided of providedParams) {
    // Skip 'action' parameter (always valid)
    if (provided === 'action') {
      continue;
    }

    // Skip if it's a valid parameter
    if (validParams.includes(provided)) {
      continue;
    }

    // 1. Check abbreviation dictionary first (highest priority)
    const abbreviationMatch = checkAbbreviation(provided, validParams);
    if (abbreviationMatch) {
      suggestions[provided] = abbreviationMatch;
      continue;
    }

    // 2. Find closest match within Levenshtein distance ≤ 2
    let bestMatch: string | null = null;
    let bestDistance = Infinity;

    for (const valid of validParams) {
      const distance = levenshteinDistance(provided.toLowerCase(), valid.toLowerCase());
      if (distance <= 2 && distance < bestDistance) {
        bestDistance = distance;
        bestMatch = valid;
      }
    }

    if (bestMatch) {
      suggestions[provided] = bestMatch;
    }
  }

  return suggestions;
}

/**
 * Validate action parameters and throw structured error if invalid
 *
 * @param tool Tool name (e.g., 'decision', 'task', 'file', 'constraint', 'stats')
 * @param action Action name (accepts both typed action enums and strings for backward compatibility)
 * @param params Parameters provided by user
 * @throws Error with structured ValidationError JSON if validation fails
 */
export function validateActionParams(
  tool: string,
  action: DecisionAction | TaskAction | FileAction | ConstraintAction | StatsAction | ConfigAction | MessageAction | string,
  params: any
): void {
  // Skip validation for help actions
  const helpActions = ['help', 'example', 'use_case', 'help_action', 'help_params',
                       'help_tool', 'help_use_case', 'help_list_use_cases', 'help_next_actions'];
  if (helpActions.includes(action)) {
    return;
  }

  // Get action specification
  const spec = getActionSpec(tool, action);
  if (!spec) {
    throw new Error(`Unknown action "${action}" for tool "${tool}". Use action: "help" to see available actions, or action: "use_case" for comprehensive scenarios.`);
  }

  // Check for missing required parameters
  const missingParams: string[] = [];
  for (const requiredParam of spec.required) {
    if (params[requiredParam] === undefined || params[requiredParam] === null || params[requiredParam] === '') {
      missingParams.push(requiredParam);
    }
  }

  // Get all provided parameters (excluding 'action')
  const providedParams = Object.keys(params).filter(p => p !== 'action');

  // All valid parameters for this action
  const allValidParams = [...spec.required, ...spec.optional];

  // Find typo suggestions
  const typoSuggestions = findTypoSuggestions(providedParams, allValidParams);

  // If validation fails, throw structured error
  if (missingParams.length > 0 || Object.keys(typoSuggestions).length > 0) {
    const error: ValidationError = {
      error: missingParams.length > 0
        ? `Missing required parameter${missingParams.length > 1 ? 's' : ''} for action '${action}': ${missingParams.join(', ')}`
        : `Invalid parameter name${Object.keys(typoSuggestions).length > 1 ? 's' : ''} detected`,
      action: action,
      missing_params: missingParams.length > 0 ? missingParams : undefined,
      required_params: spec.required,
      optional_params: spec.optional,
      you_provided: providedParams,
      did_you_mean: Object.keys(typoSuggestions).length > 0 ? typoSuggestions : undefined,
      example: spec.example,
      hint: spec.hint,
      need_help: `For comprehensive scenarios and examples, try: ${tool}({ action: "use_case" })`
    };

    // Throw error with JSON-formatted details for easy parsing by AI agents
    throw new Error(JSON.stringify(error, null, 2));
  }
}

/**
 * Validate batch operation parameters
 * Used by set_batch, record_batch, batch_create actions
 *
 * @param tool Tool name
 * @param batchParamName Name of the batch array parameter (e.g., 'decisions', 'tasks', 'file_changes')
 * @param items Array of items to validate
 * @param itemAction Action name for each item (e.g., 'set' for decision items)
 * @param maxItems Maximum allowed items (default: 50)
 * @throws Error if batch validation fails
 */
export function validateBatchParams(
  tool: string,
  batchParamName: string,
  items: any[],
  itemAction: string,
  maxItems: number = 50
): void {
  // Check if batch parameter exists and is an array
  if (!items || !Array.isArray(items)) {
    throw new Error(`Parameter "${batchParamName}" is required and must be an array`);
  }

  // Check array is not empty
  if (items.length === 0) {
    // Allow empty arrays (will return empty success response)
    return;
  }

  // Check max items constraint
  if (items.length > maxItems) {
    throw new Error(`Parameter "${batchParamName}" must contain at most ${maxItems} items (got ${items.length})`);
  }

  // Validate each item in the batch
  const itemErrors: Array<{ index: number; error: string }> = [];

  for (let i = 0; i < items.length; i++) {
    try {
      validateActionParams(tool, itemAction, items[i]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      itemErrors.push({
        index: i,
        error: message
      });
    }
  }

  // If any items have validation errors, throw aggregate error
  if (itemErrors.length > 0) {
    const errorSummary = itemErrors.map(e => `Item ${e.index}: ${e.error}`).join('\n');
    throw new Error(`Batch validation failed for ${itemErrors.length} item(s):\n${errorSummary}`);
  }
}

/**
 * Get all available actions for a tool
 * Useful for error messages suggesting alternatives
 *
 * @param tool Tool name
 * @returns Array of available action names
 */
export function getAvailableActions(tool: string): string[] {
  const toolSpecs = ACTION_SPECS_BY_TOOL[tool];
  if (!toolSpecs) {
    return [];
  }
  return Object.keys(toolSpecs);
}

/**
 * Suggest similar action names using Levenshtein distance
 * Helps users when they misspell an action name
 *
 * @param tool Tool name
 * @param providedAction Action name provided by user
 * @returns Array of suggested action names (max 3)
 */
export function suggestSimilarActions(tool: string, providedAction: string): string[] {
  const availableActions = getAvailableActions(tool);

  const scored = availableActions.map(action => ({
    action,
    distance: levenshteinDistance(providedAction.toLowerCase(), action.toLowerCase())
  }));

  // Sort by distance and return top 3 within distance ≤ 3
  return scored
    .filter(item => item.distance <= 3)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)
    .map(item => item.action);
}
