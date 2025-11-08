/**
 * Action Specification Type Definition
 *
 * Core type for defining parameter requirements and examples for MCP tool actions.
 * Used by parameter-validator.ts to generate structured error messages with examples
 * and typo suggestions.
 */

export interface ActionSpec {
  required: string[];
  optional: string[];
  example: any;
  hint?: string;
}
