/**
 * Use Case Tool Type Definitions
 * Defines parameter and response types for the use_case tool
 */

// Action types
export type UseCaseAction =
  | 'get'
  | 'search'
  | 'list_all';

// Parameter interfaces for each action
export interface UseCaseGetParams {
  action: 'get';
  use_case_id: number;
}

export interface UseCaseSearchParams {
  action: 'search';
  keyword: string;
  category?: string;
  complexity?: 'basic' | 'intermediate' | 'advanced';
}

export interface UseCaseListAllParams {
  action: 'list_all';
  category?: string;
  complexity?: 'basic' | 'intermediate' | 'advanced';
  limit?: number;
  offset?: number;
}

// Union type for all use_case parameters
export type UseCaseParams =
  | UseCaseGetParams
  | UseCaseSearchParams
  | UseCaseListAllParams;

// Response type interfaces
export interface UseCaseWorkflowStep {
  step: number;
  action: string;
  description: string;
  code: string;
}

export interface UseCaseResult {
  use_case_id: number;
  category: string;
  title: string;
  complexity: string;
  description: string;
  workflow?: UseCaseWorkflowStep[];
  full_example?: any;
  expected_outcome?: string;
  action_sequence: string[];
}

export interface UseCaseSummary {
  use_case_id: number;
  title: string;
  complexity: string;
  category: string;
  description?: string;
}

export interface UseCaseSearchResult {
  total: number;
  use_cases: UseCaseSummary[];
}

export interface UseCaseListAllResult {
  total: number;
  filtered: number;
  use_cases: UseCaseSummary[];
  categories?: string[];
}
