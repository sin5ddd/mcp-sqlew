/**
 * Example Tool - Barrel Export
 * Exports all example tool actions and utilities
 */

// Action exports
export { getExample } from './actions/get.js';
export { searchExamples } from './actions/search.js';
export { listAllExamples } from './actions/list-all.js';

// Help/Example exports
export { exampleHelp } from './help/help.js';
export { exampleExample } from './help/example.js';

// Type exports
export type {
  ExampleAction,
  ExampleParams,
  ExampleGetParams,
  ExampleSearchParams,
  ExampleListAllParams,
  ExampleResult,
  ExampleSearchResult,
  ExampleListAllResult
} from './types.js';
