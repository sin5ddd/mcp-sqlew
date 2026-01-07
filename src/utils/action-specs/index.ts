/**
 * Action Specifications - Barrel Export
 *
 * Centralized export for all action specification modules.
 * Maintains backward compatibility with the original action-specs.ts file.
 */

// Export type definition
export type { ActionSpec } from './types.js';

// Export individual tool specs
export { DECISION_ACTION_SPECS } from './decision-specs.js';
export { CONSTRAINT_ACTION_SPECS } from './constraint-specs.js';
export { CONFIG_ACTION_SPECS } from './config-specs.js';

// Re-export master registry and utility functions
import { DECISION_ACTION_SPECS } from './decision-specs.js';
import { CONSTRAINT_ACTION_SPECS } from './constraint-specs.js';
import { CONFIG_ACTION_SPECS } from './config-specs.js';
import { ActionSpec } from './types.js';

/**
 * Master Registry - Maps tool names to their action specifications
 */
export const ACTION_SPECS_BY_TOOL: Record<string, Record<string, ActionSpec>> = {
  decision: DECISION_ACTION_SPECS,
  constraint: CONSTRAINT_ACTION_SPECS,
  config: CONFIG_ACTION_SPECS
};

/**
 * Get action specification for a tool/action combination
 * @param tool Tool name (e.g., 'decision', 'task')
 * @param action Action name (e.g., 'set', 'create')
 * @returns Action specification or null if not found
 */
export function getActionSpec(tool: string, action: string): ActionSpec | null {
  const toolSpecs = ACTION_SPECS_BY_TOOL[tool];
  if (!toolSpecs) {
    return null;
  }
  return toolSpecs[action] || null;
}

/**
 * Check if an action exists for a tool
 * @param tool Tool name
 * @param action Action name
 * @returns True if action exists
 */
export function hasAction(tool: string, action: string): boolean {
  return getActionSpec(tool, action) !== null;
}

/**
 * Get all action names for a tool
 * @param tool Tool name
 * @returns Array of action names or empty array if tool not found
 */
export function getToolActions(tool: string): string[] {
  const toolSpecs = ACTION_SPECS_BY_TOOL[tool];
  if (!toolSpecs) {
    return [];
  }
  return Object.keys(toolSpecs);
}
