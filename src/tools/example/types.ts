/**
 * Example Tool Type Definitions
 * Defines parameter and response types for the example tool
 */

// Action types
export type ExampleAction = 'get' | 'search' | 'list_all';

// Parameter interfaces for each action
export interface ExampleGetParams {
  action: 'get';
  tool?: string;
  action_name?: string;
  topic?: string;
}

export interface ExampleSearchParams {
  action: 'search';
  keyword: string;
  tool?: string;
  action_name?: string;
  complexity?: 'basic' | 'intermediate' | 'advanced';
}

export interface ExampleListAllParams {
  action: 'list_all';
  tool?: string;
  complexity?: 'basic' | 'intermediate' | 'advanced';
  limit?: number;
  offset?: number;
}

// Union type for all example parameters
export type ExampleParams =
  | ExampleGetParams
  | ExampleSearchParams
  | ExampleListAllParams;

// Response type interfaces
export interface ExampleResult {
  example_id: number;
  title: string;
  tool: string;
  action: string;
  code: string;
  explanation: string;
  complexity?: string;
  tags?: string[];
}

export interface ExampleSearchResult {
  total: number;
  examples: Array<{
    example_id: number;
    title: string;
    tool: string;
    action: string;
    complexity?: string;
    preview: string;
  }>;
}

export interface ExampleListAllResult {
  total: number;
  filtered: number;
  examples: Array<{
    example_id: number;
    title: string;
    tool: string;
    action: string;
    complexity?: string;
  }>;
}
