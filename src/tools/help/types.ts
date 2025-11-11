/**
 * Help Tool Type Definitions
 * Defines parameter and response types for the help tool
 */

// Action types
export type HelpAction =
  | 'query_action'
  | 'query_params'
  | 'query_tool'
  | 'workflow_hints'
  | 'batch_guide'
  | 'error_recovery';

// Parameter interfaces for each action
export interface HelpQueryActionParams {
  action: 'query_action';
  tool: string;
  target_action: string;
}

export interface HelpQueryParamsParams {
  action: 'query_params';
  tool: string;
  target_action: string;
}

export interface HelpQueryToolParams {
  action: 'query_tool';
  tool: string;
}

export interface HelpWorkflowHintsParams {
  action: 'workflow_hints';
  tool: string;
  current_action: string;
}

export interface HelpBatchGuideParams {
  action: 'batch_guide';
  operation: string;
}

export interface HelpErrorRecoveryParams {
  action: 'error_recovery';
  error_message: string;
  tool?: string;
}

// Union type for all help parameters
export type HelpParams =
  | HelpQueryActionParams
  | HelpQueryParamsParams
  | HelpQueryToolParams
  | HelpWorkflowHintsParams
  | HelpBatchGuideParams
  | HelpErrorRecoveryParams;

// Response type interfaces
export interface HelpParameter {
  name: string;
  type: string;
  required: boolean;
  description: string;
  default?: string;
}

export interface HelpExample {
  title: string;
  code: string;
  explanation: string;
}

export interface HelpActionResult {
  tool: string;
  action: string;
  description: string;
  parameters: HelpParameter[];
  examples: HelpExample[];
}

export interface HelpParamsResult {
  tool: string;
  action: string;
  parameters: HelpParameter[];
}

export interface HelpActionSummary {
  name: string;
  description: string;
}

export interface HelpToolResult {
  tool: string;
  description: string;
  actions: HelpActionSummary[];
}

export interface HelpNextAction {
  action: string;
  frequency: string;
  context: string;
}

export interface HelpNextActionsResult {
  tool: string;
  action: string;
  next_actions: HelpNextAction[];
}

export interface HelpBatchGuideResult {
  operation: string;
  description: string;
  syntax: string;
  best_practices: string[];
  examples?: HelpExample[];
}

export interface HelpErrorRecoveryResult {
  error: string;
  cause: string;
  solution: string;
  example: string;
  prevention: string;
}
