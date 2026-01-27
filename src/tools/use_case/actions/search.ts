/**
 * Use Case Tool - search Action
 * Search use cases by keyword/category
 *
 * TOML-based implementation (v5.0+)
 * Loads from src/help-data/use-cases/*.toml instead of database
 */

import { getHelpLoader } from '../../../help-loader.js';
import { UseCaseSearchParams, UseCaseSearchResult } from '../types.js';

/**
 * Search use cases by keyword/category
 * Uses HelpSystemLoader (TOML-based)
 */
export async function searchUseCases(
  params: UseCaseSearchParams
): Promise<UseCaseSearchResult | { error: string; available_categories?: string[] }> {
  const loader = await getHelpLoader();

  // Validate category if provided
  if (params.category) {
    const categories = loader.getCategories();
    const categoryExists = categories.some(c => c.name === params.category);
    if (!categoryExists) {
      return {
        error: `Category "${params.category}" not found`,
        available_categories: categories.map(c => c.name)
      };
    }
  }

  // Validate complexity if provided
  if (params.complexity) {
    if (!['basic', 'intermediate', 'advanced'].includes(params.complexity)) {
      return { error: 'Complexity must be one of: basic, intermediate, advanced' };
    }
  }

  const results = loader.searchUseCases(params.keyword, {
    category: params.category,
    complexity: params.complexity,
    limit: 10
  });

  return {
    total: results.length,
    use_cases: results.map(uc => ({
      use_case_id: uc.id,
      title: uc.title,
      complexity: uc.complexity,
      category: uc.category,
      description: uc.description
    }))
  };
}
